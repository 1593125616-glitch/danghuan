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
  var tabs = await feishuGet(`https://open.feishu.cn/open-apis/bitable/v1/apps/${CONFIG.appToken}/tables?page_size=50`);
  for (var t of (tabs.data.items || [])) {
    var day = now.getDay();
    var monday = new Date(now); monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    var sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
    var m1 = monday.getFullYear() + '年' + (monday.getMonth() + 1) + '月' + monday.getDate();
    if (t.name.includes(m1)) { console.log('[质检B] 使用已有周表:', t.name, t.table_id); return t.table_id; }
  }
  var m2 = sunday.getMonth() !== monday.getMonth() ? (sunday.getMonth() + 1) + '月' + sunday.getDate() : sunday.getDate();
  var name = m1 + '-' + m2;
  console.log('[质检B] 创建新周表:', name);
  var cr = await feishuPost(`https://open.feishu.cn/open-apis/bitable/v1/apps/${CONFIG.appToken}/tables`,
    { table: { name: name, fields: TABLE_FIELDS } });
  var id = cr.data ? cr.data.table_id : '';
  if (!id) console.error('[质检B] 创建周表失败:', JSON.stringify(cr).substring(0,200));
  return id || CONFIG.tableId;
}

function parseCreatedAt(r) {
  if (!r.createdAt) return 0;
  var v = r.createdAt;
  if (v.$date) return v.$date;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') { var d = new Date(v); return isNaN(d.getTime()) ? 0 : d.getTime(); }
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
    if (!tblId) { console.error('[质检B] 无法获取周表ID,跳过同步'); return; }
    var records = await cloudGet('/unpushed');
    console.log('[质检B] unpushed返回: code='+(records?records.code:'null')+' 数据量='+((records&&records.data)?records.data.length:'null'));
    if (!records || !records.data || !records.data.length) return;

    var total = records.data.length;
    console.log('[质检B] 待同步:', total, '条');

    var batch = [], ids = [], written = 0;
    for (var rec of records.data) {
      var user = parseUserName(rec.userName);
      var createdAt = parseCreatedAt(rec);
      var submitTime = parseSubmitTime(rec);
      if (written < 3) console.log('[质检B] 记录', written, 'createdAt_raw:', JSON.stringify(rec.createdAt), 'submitTime:', submitTime, 'user:', user.inspector);
      var inspTime = (createdAt && submitTime) ? fmtDiff(createdAt - submitTime) : '';
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
        try {
          var cr = await feishuPost(`https://open.feishu.cn/open-apis/bitable/v1/apps/${CONFIG.appToken}/tables/${tblId}/records/batch_create`, { records: batch });
          if (cr.code !== 0) console.error('[质检B] batch_create返回:', JSON.stringify(cr).substring(0,200));
        } catch(e) { console.error('[质检B] batch_create异常:', e.message); }
        try { await cloudPost('/mark-pushed', { ids: ids }); } catch(e) { console.error('[质检B] mark-pushed异常:', e.message); }
        console.log('[质检B] 已写入', written, '/', total);
        batch = []; ids = [];
      }
    }
    if (batch.length) {
      try { await feishuPost(`https://open.feishu.cn/open-apis/bitable/v1/apps/${CONFIG.appToken}/tables/${tblId}/records/batch_create`, { records: batch }); } catch(e) { console.error('[质检B] 最后批次异常:', e.message); }
      try { await cloudPost('/mark-pushed', { ids: ids }); } catch(e) { console.error('[质检B] mark-pushed异常:', e.message); }
    }
    if (written) console.log('[质检B] 同步完成:', written, '/', total);
  } catch(e) {
    console.error('[质检B] 同步异常:', e.message, e.stack ? e.stack.substring(0,200) : '');
  }
}

// 每10分钟同步(8-23点)
function shouldRun() {
  var h = new Date().getHours();
  return h >= 8 && h < 23;
}

async function loop() {
  var h = new Date().getHours();
  console.log('[质检B] 心跳', h, '时');
  if (h >= 8 && h < 24) {
    console.log('[质检B] 开始同步...');
    await syncData();
    var today = new Date().toDateString();
    if (today !== lastCleanup) {
      lastCleanup = today;
      try { var cr2 = await cloudPost('/cleanup', { days: 180 }); console.log('[质检B] 清理旧数据:', cr2.deleted||0, '条'); } catch(e) { console.error('[质检B] 清理异常:', e.message); }
    }
  }
  setTimeout(loop, 60000);
}

console.log('[质检B] 云托管服务已启动');
console.log('[质检B] 当前时间:', new Date().toString());
loop();
// 启动时也同步一次排名(测试)
setTimeout(function(){ console.log('[质检B] 首次排名同步...'); syncRankToFeishu(); }, 10000);

// ===== 排名同步 =====
const RANK_TABLE_FIELDS = [
  {"field_name":"统计时间","type":1}, {"field_name":"质检数","type":1},
  {"field_name":"时效排名","type":1}, {"field_name":"平均时效","type":1},
  {"field_name":"间隔排名","type":1}, {"field_name":"总间隔","type":1},
  {"field_name":"第一步","type":1}, {"field_name":"第二步","type":1},
  {"field_name":"第三步","type":1}, {"field_name":"第四步","type":1}
];
let rankCache = {}; // { key: tableId }

function fmtSec(sec) {
  if (!sec || sec <= 0) return '0秒';
  var m = Math.floor(sec / 60), s = sec % 60;
  return m > 0 ? m + '分' + s + '秒' : s + '秒';
}

async function ensureRankTable(token, tableName) {
  if (rankCache[tableName]) return rankCache[tableName];
  var tabs = await feishuGet(`https://open.feishu.cn/open-apis/bitable/v1/apps/${CONFIG.appToken}/tables?page_size=50`);
  for (var t of (tabs.data.items || [])) { if (t.name === tableName) { rankCache[tableName] = t.table_id; console.log('[排名] 已有表:', tableName, t.table_id); return t.table_id; } }
  console.log('[排名] 创建表:', tableName);
  var cr = await feishuPost(`https://open.feishu.cn/open-apis/bitable/v1/apps/${CONFIG.appToken}/tables`,
    { table: { name: tableName, fields: RANK_TABLE_FIELDS } });
  var id = cr.data ? cr.data.table_id : '';
  if (!id) console.error('[排名] 创建表失败:', JSON.stringify(cr).substring(0,200));
  else rankCache[tableName] = id;
  return id;
}

async function clearRankTable(token, tblId) {
  var items = [], pt = '';
  while (true) {
    var u = `https://open.feishu.cn/open-apis/bitable/v1/apps/${CONFIG.appToken}/tables/${tblId}/records?page_size=500`;
    if (pt) u += '&page_token=' + pt;
    var rp = await feishuGet(u);
    if (rp.code !== 0 || !rp.data.items.length) break;
    items = items.concat(rp.data.items.map(x => x.record_id));
    if (!rp.data.has_more) break; else pt = rp.data.page_token;
  }
  if (!items.length) return;
  console.log('[排名] 清空表', tblId, items.length, '条记录');
  for (var i = 0; i < items.length; i += 500) {
    try { await feishuDelete(`https://open.feishu.cn/open-apis/bitable/v1/apps/${CONFIG.appToken}/tables/${tblId}/records`, { records: items.slice(i, i + 500) }); } catch(e) { console.error('[排名] 清空表异常:', e.message); }
  }
}

function formatInspectors(inspectors) { return (inspectors||[]).slice().sort((a,b)=>b.count-a.count); }

function buildCountText(sorted) { return sorted.map(s=>(s.site||'')+s.inspector+s.count+'台').join('\n'); }

function buildInspRankText(sorted) {
  var rs = sorted.slice().sort((a,b)=>a.avgTime-b.avgTime);
  return rs.map(s=>(s.site||'')+s.inspector+fmtSec(s.avgTime)).join('\n');
}

function buildAvgTimeText(sorted) { return sorted.map(s=>(s.site||'')+s.inspector+fmtSec(s.avgTime)).join('\n'); }

function buildIntervalRankText(sorted) {
  var rs = sorted.slice().sort((a,b)=>b.totalInterval-a.totalInterval);
  return rs.map(s=>(s.site||'')+s.inspector+fmtSec(s.totalInterval)).join('\n');
}

function buildTotalIntervalText(sorted) { return sorted.map(s=>(s.site||'')+s.inspector+fmtSec(s.totalInterval)).join('\n'); }

function buildStepText(sorted, stepKey) {
  var withStep = sorted.filter(s=>s.stepGroups&&s.stepGroups[stepKey]&&s.stepGroups[stepKey].count>0);
  if (!withStep.length) return '';
  var stepSorted = withStep.slice().sort((a,b)=>a.stepGroups[stepKey].avgInspTime-b.stepGroups[stepKey].avgInspTime);
  return stepSorted.map(s=>{
    var rank = (s.stepRanks&&s.stepRanks[stepKey])?s.stepRanks[stepKey].inspRank:0;
    return (s.site||'')+s.inspector+'排名'+rank+' '+fmtSec(s.stepGroups[stepKey].avgInspTime);
  }).join('\n');
}

async function writeRankTable(token, tblId, label, inspectors) {
  var sorted = formatInspectors(inspectors);
  if (!sorted.length) return;
  var fields = {};
  fields['统计时间'] = label;
  fields['质检数'] = buildCountText(sorted);
  fields['时效排名'] = buildInspRankText(sorted);
  fields['平均时效'] = buildAvgTimeText(sorted);
  fields['间隔排名'] = buildIntervalRankText(sorted);
  fields['总间隔'] = buildTotalIntervalText(sorted);
  fields['第一步'] = buildStepText(sorted, 'step1') || '';
  fields['第二步'] = buildStepText(sorted, 'step2') || '';
  fields['第三步'] = buildStepText(sorted, 'step3') || '';
  fields['第四步'] = buildStepText(sorted, 'step4') || '';
  await feishuPost(`https://open.feishu.cn/open-apis/bitable/v1/apps/${CONFIG.appToken}/tables/${tblId}/records`, { fields: fields });
  console.log('[排名] 已写入:', label);
}

async function cleanupOldRankTables(token) {
  var tabs = await feishuGet(`https://open.feishu.cn/open-apis/bitable/v1/apps/${CONFIG.appToken}/tables?page_size=100`);
  var rm = /^(昨日|本周|上月)排名/;
  for (var t of (tabs.data.items || [])) {
    if (!rm.test(t.name)) continue;
    var tableDate = 0;
    var m1 = t.name.match(/(\d+)\.(\d+)/);
    if (m1) { var y = new Date().getFullYear(); tableDate = new Date(y, parseInt(m1[1])-1, parseInt(m1[2])).getTime(); }
    if (!tableDate) continue;
    var maxAge = /上月/.test(t.name) ? 60 : (/本周/.test(t.name) ? 21 : 3);
    if (Date.now() - tableDate > maxAge * 24*60*60*1000) {
      try { await feishuDelete(`https://open.feishu.cn/open-apis/bitable/v1/apps/${CONFIG.appToken}/tables/${t.table_id}`); console.log('[排名] 清理旧表:', t.name); } catch(e) {}
    }
  }
}

async function syncRankToFeishu() {
  try {
    var token = await getToken();
    console.log('[排名] 获取排名数据...');
    var data = await cloudGet('/rank');
    if (!data || data.code !== 0 || !data.data) { console.log('[排名] 无数据, code:', data?data.code:'null'); return; }
    var rd = data.data;

    var now = new Date();
    var yesterday = new Date(now.getTime() - 24*60*60*1000);
    var dailyLabel = '昨日排名' + (yesterday.getMonth()+1) + '.' + yesterday.getDate();
    var dow = now.getDay(); if (dow === 0) dow = 7;
    var mon = new Date(now.getTime() - (dow-1)*24*60*60*1000);
    var sun = new Date(now);
    var weeklyLabel = '本周排名' + (mon.getMonth()+1) + '.' + mon.getDate() + '-' + (sun.getMonth()+1) + '.' + sun.getDate();
    var monthlyLabel = '本月排名' + (now.getMonth()+1) + '.1-' + (now.getMonth()+1) + '.' + now.getDate();
    console.log('[排名] 标签:', dailyLabel, weeklyLabel, monthlyLabel);

    if (rd.daily && rd.daily.inspectors && rd.daily.inspectors.length) {
      console.log('[排名] 写入日报:', rd.daily.inspectors.length, '人');
      var dt = await ensureRankTable(token, dailyLabel);
      await clearRankTable(token, dt);
      await writeRankTable(token, dt, dailyLabel, rd.daily.inspectors);
    } else { console.log('[排名] 无日报数据'); }
    if (rd.weekly && rd.weekly.inspectors && rd.weekly.inspectors.length) {
      console.log('[排名] 写入周报:', rd.weekly.inspectors.length, '人');
      var wt = await ensureRankTable(token, weeklyLabel);
      await clearRankTable(token, wt);
      await writeRankTable(token, wt, weeklyLabel, rd.weekly.inspectors);
    } else { console.log('[排名] 无周报数据'); }
    if (rd.monthly && rd.monthly.inspectors && rd.monthly.inspectors.length) {
      console.log('[排名] 写入月报:', rd.monthly.inspectors.length, '人');
      var mt = await ensureRankTable(token, monthlyLabel);
      await clearRankTable(token, mt);
      await writeRankTable(token, mt, monthlyLabel, rd.monthly.inspectors);
    } else { console.log('[排名] 无月报数据'); }
    await cleanupOldRankTables(token);
    console.log('[排名] 同步完成');
  } catch(e) { console.error('[排名] 异常:', e.message, e.stack ? e.stack.substring(0,200) : ''); }
}

// 每天8:00-8:59自动同步排名
let lastRankDate = '';
setInterval(function() {
  var now = new Date();
  if (now.getHours() !== 8) return;
  var dk = now.getFullYear()+'-'+(now.getMonth()+1)+'-'+now.getDate();
  if (dk === lastRankDate) return;
  lastRankDate = dk;
  console.log('[质检B] 自动同步排名...');
  syncRankToFeishu();
}, 60000);
