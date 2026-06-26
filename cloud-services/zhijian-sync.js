const { getToken, feishuGet, feishuPost, cloudGet, cloudPost } = require('./feishu');
const CONFIG = require('./config');

const TABLE_FIELDS = [
  {"field_name":"提交时间","type":5,"property":{"date_formatter":"yyyy/MM/dd HH:mm"}},
  {"field_name":"物品条码","type":1},
  {"field_name":"品类","type":3,"property":{"options":[{"name":"手机","color":18},{"name":"3C","color":12},{"name":"笔记本","color":15},{"name":"平板","color":11}]}},
  {"field_name":"站点","type":3,"property":{"options":[{"name":"深圳-龙岗","color":18},{"name":"深圳-沙井","color":16},{"name":"合肥","color":12},{"name":"石家庄","color":15},{"name":"成都","color":11}]}},
  {"field_name":"质检人","type":1},
  {"field_name":"工号","type":1},
  {"field_name":"质检时间","type":1},
  {"field_name":"质检间隔时间","type":1},
  {"field_name":"质检时效","type":1},
  {"field_name":"分步质检","type":1}
];

// 缓存: 同用户的上一条 createdAt 用于计算间隔
let prevCache = {};
let lastCleanup = '';

function pad(n) { return n < 10 ? '0' + n : '' + n; }

function parseUserName(userName) {
  if (!userName) return { jobNo: '', inspector: '', site: '' };
  var parts = userName.split('-');
  var inspector = parts.length >= 2 ? parts[1] : '';
  if (inspector.includes('+')) inspector = inspector.split('+').pop();
  var site = parts.length >= 4 ? parts[2] + '-' + parts[3] : (parts[2] || '');
  return { jobNo: parts[0] || '', inspector, site };
}

function mapCategory(cat) {
  if (cat === '手机' || cat === '笔记本' || cat === '平板') return cat;
  return '3C';
}

function fmtDiff(ms) {
  if (ms <= 0) return '';
  var totalSec = Math.floor(ms / 1000);
  var m = Math.floor(totalSec / 60), s = totalSec % 60;
  return m > 0 ? m + '分' + s + '秒' : s + '秒';
}

function getWeekKey(d) {
  var day = d.getDay();
  var monday = new Date(d);
  monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return monday.getFullYear() + '-' + pad(monday.getMonth() + 1) + '-' + pad(monday.getDate());
}

async function getOrCreateWeeklyTable(token) {
  var now = new Date(), key = getWeekKey(now);
  // 查已有表
  var tabs = await feishuGet(`https://open.feishu.cn/open-apis/bitable/v1/apps/${CONFIG.appToken}/tables?page_size=50`);
  for (var t of (tabs.data.items || [])) {
    var day = now.getDay();
    var monday = new Date(now); monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    var sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
    var m1 = monday.getFullYear() + '年' + (monday.getMonth() + 1) + '月' + monday.getDate();
    var m2 = sunday.getMonth() !== monday.getMonth() ? (sunday.getMonth() + 1) + '月' + sunday.getDate() : sunday.getDate();
    if (t.name.includes(m1)) return t.table_id;
  }
  // 新建
  var cr = await feishuPost(`https://open.feishu.cn/open-apis/bitable/v1/apps/${CONFIG.appToken}/tables`,
    { table: { name: m1 + '-' + m2, fields: TABLE_FIELDS } });
  return cr.data ? cr.data.table_id : CONFIG.tableId;
}

function parseCreatedAt(r) {
  if (!r.createdAt) return 0;
  if (r.createdAt.$date) return r.createdAt.$date;
  if (typeof r.createdAt === 'number') return r.createdAt;
  return 0;
}

function parseSubmitTime(r) {
  if (!r.submitTime) return 0;
  var d = new Date(r.submitTime.replace(/-/g, '/'));
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

async function syncData() {
  try {
    var token = await getToken();
    var tblId = await getOrCreateWeeklyTable(token);
    var records = await cloudGet('/unpushed');
    if (!records || !records.data || !records.data.length) return;

    console.log('[质检B] 待同步:', records.data.length);

    var batch = [], ids = [], written = 0, skipped = 0;
    for (var rec of records.data) {
      var user = parseUserName(rec.userName);
      var createdAt = parseCreatedAt(rec);
      var submitTime = parseSubmitTime(rec);
      var inspTime = (createdAt && submitTime) ? fmtDiff(createdAt - submitTime) : '';
      // 计算间隔/时效
      var ck = user.inspector ? (user.site || '') + '-' + user.inspector : '';
      var interval = '', efficiency = '';
      if (ck && prevCache[ck]) {
        if (prevCache[ck] && createdAt > prevCache[ck]) efficiency = fmtDiff(createdAt - prevCache[ck]);
        if (prevCache[ck] && submitTime > prevCache[ck]) interval = fmtDiff(submitTime - prevCache[ck]);
      }
      prevCache[ck] = createdAt;

      var fields = {};
      if (rec.barcode) fields['物品条码'] = rec.barcode;
      fields['品类'] = mapCategory(rec.category || '');
      if (user.jobNo) fields['工号'] = user.jobNo;
      if (user.inspector) fields['质检人'] = user.inspector;
      if (user.site) fields['站点'] = user.site;
      if (createdAt) fields['提交时间'] = createdAt;
      if (inspTime) fields['质检时间'] = inspTime;
      fields['质检间隔时间'] = interval || '';
      fields['质检时效'] = efficiency || '';
      fields['分步质检'] = rec.step || '';

      batch.push({ fields });
      ids.push(rec._id);
      written++;

      if (batch.length >= 500) {
        await feishuPost(`https://open.feishu.cn/open-apis/bitable/v1/apps/${CONFIG.appToken}/tables/${tblId}/records/batch_create`, { records: batch });
        await cloudPost('/mark-pushed', { ids: ids });
        console.log('[质检B] 已写入', written);
        batch = []; ids = [];
      }
    }
    if (batch.length) {
      await feishuPost(`https://open.feishu.cn/open-apis/bitable/v1/apps/${CONFIG.appToken}/tables/${tblId}/records/batch_create`, { records: batch });
      await cloudPost('/mark-pushed', { ids: ids });
    }
    if (written) console.log('[质检B] 同步完成:', written);
  } catch(e) {
    console.error('[质检B] 同步异常:', e.message);
  }
}

// 每10分钟同步(8-23点)
function shouldRun() {
  var h = new Date().getHours();
  return h >= 8 && h < 23;
}

async function loop() {
  if (shouldRun()) {
    await syncData();
    // 180天自动清理(每天检查一次)
    var today = new Date().toDateString();
    if (today !== lastCleanup) {
      lastCleanup = today;
      try { var cr = await cloudPost('/cleanup', { days: 180 }); if (cr.deleted) console.log('[质检B] 清理旧数据:', cr.deleted, '条'); } catch(e) {}
    }
  }
  setTimeout(loop, 600000);
}

console.log('[质检B] 云托管服务已启动');
loop();
