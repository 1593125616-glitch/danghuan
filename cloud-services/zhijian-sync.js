const { getToken, feishuGet, feishuPost, feishuDelete, cloudGet, cloudPost } = require('./feishu');
const CONFIG = require('./config');

const TABLE_FIELDS = [
  {"field_name":"提交时间","type":5,"property":{"date_formatter":"yyyy/MM/dd HH:mm"}},
  {"field_name":"物品条码","type":1},
  {"field_name":"检测线","type":1},
  {"field_name":"品类","type":1},
  {"field_name":"品牌","type":1},
  {"field_name":"机型","type":1},
  {"field_name":"渠道","type":1},
  {"field_name":"站点","type":3,"property":{"options":[{"name":"深圳-龙岗","color":18},{"name":"深圳-沙井","color":16},{"name":"合肥","color":12},{"name":"石家庄","color":15},{"name":"成都","color":11}]}},
  {"field_name":"质检人","type":1},
  {"field_name":"工号","type":1},
  {"field_name":"质检时间","type":1},
  {"field_name":"质检间隔时间","type":1},
  {"field_name":"质检时效","type":1},
  {"field_name":"分步质检","type":1},
  {"field_name":"功能","type":1},
  {"field_name":"拆修","type":1},
  {"field_name":"边框背板","type":1}
];

// 持久化缓存: 防止更新重启丢失上一台记录
const fs = require('fs');
const CACHE_FILE = '/tmp/zb_lastrec.json';
let lastRec = {};
let lastCleanup = '';
try { lastRec = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); console.log('[质检B] 加载缓存:', Object.keys(lastRec).length, '人'); } catch(e) { lastRec = {}; }
function saveRec() { try { fs.writeFileSync(CACHE_FILE, JSON.stringify(lastRec)); } catch(e) {} }

function pad(n) { return n < 10 ? '0' + n : '' + n; }

function parseUserName(userName) {
  if (!userName) return { jobNo: '', inspector: '', site: '' };
  var parts = userName.split('-');
  var jobNo = parts[0] || '';
  var inspector = '';
  var site = '';

  // 查找包含"质检"的段，提取质检后面的名字
  var qcIdx = -1;
  for (var i = 1; i < parts.length; i++) {
    if (parts[i].indexOf('质检') !== -1) {
      inspector = parts[i].replace(/^.*?质检/, '');
      if (inspector.includes('+')) inspector = inspector.split('+').pop();
      qcIdx = i;
      break;
    }
  }

  if (qcIdx >= 0) {
    // site: 质检段之后的所有部分用"-"连接
    site = parts.slice(qcIdx + 1).join('-');
  } else {
    // 旧格式: 工号-姓名-城市-区域
    inspector = parts.length >= 2 ? parts[1] : '';
    if (inspector.includes('+')) inspector = inspector.split('+').pop();
    if (parts.length >= 4) {
      site = parts[2] + '-' + parts[3];
    } else if (parts.length >= 3) {
      site = parts[2];
    }
  }

  return { jobNo, inspector, site };
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
  var day = now.getDay();
  var monday = new Date(now); monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  var sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  var m1 = monday.getFullYear() + '年' + (monday.getMonth() + 1) + '月' + monday.getDate();
  var m2 = sunday.getMonth() !== monday.getMonth() ? (sunday.getMonth() + 1) + '月' + sunday.getDate() : sunday.getDate();
  var nameV2 = '数据表' + m1.substring(m1.indexOf('年')+1).replace('年','月') + '日-' + m2;
  for (var t of (tabs.data.items || [])) {
    if (t.name === nameV2 || t.name.startsWith('v2-' + m1)) { console.log('[质检B] 使用已有周表:', t.name, t.table_id); return t.table_id; }
  }
  // 删除同周旧版表(无v2前缀)
  for (var t2 of (tabs.data.items || [])) {
    if (t2.name.includes(m1) && !t2.name.startsWith('v2-')) {
      try { await feishuDelete(`https://open.feishu.cn/open-apis/bitable/v1/apps/${CONFIG.appToken}/tables/${t2.table_id}`); console.log('[质检B] 删除旧版周表:', t2.name); } catch(e) {}
    }
  }
  console.log('[质检B] 创建新周表:', nameV2);
  var cr = await feishuPost(`https://open.feishu.cn/open-apis/bitable/v1/apps/${CONFIG.appToken}/tables`,
    { table: { name: nameV2, fields: TABLE_FIELDS } });
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

function parseSelections(selections) {
  var result = { gongneng: [], caixiu: [], biankuang: [] };
  if (!selections) return result;
  var lines = selections.split('\n');
  var caixiuKeys = [
    '系统弹窗-正品部件/有售后案例','系统弹窗-部件已使用',
    '后摄维修不检测','后摄像头有维修','后摄像头有缺失',
    '前摄维修不检测','前摄像头有维修','前摄像头有缺失',
    '屏幕打磨/黑纸破损等','屏幕更换外屏等','屏幕芯片/背光/排线维修痕迹等',
    '第三方屏幕/屏未知部件等','主板区域贴标/盖章/屏蔽罩形变等','主板维修/破损/弯曲等',
    '无法连接电脑'
  ];
  var gongnengKeys = [
    'iCloud无法注销','无线异常','充电异常','光线、距离感应不正常',
    '面容无法录入和识别','声音功能异常','振动功能不正常','触摸失灵/延迟',
    '前摄拍照有斑','前摄拍照有彩点','前摄画面异常/抖动/模糊/不对焦','前摄无法拍照',
    '后摄拍照有斑','后摄拍照有彩点','后摄画面异常/抖动/模糊/不对焦/闪光灯异常','后摄无法拍照',
    '指南针功能不正常','通话异常(不读卡/不通话/无信号/无基带)','按键无反馈/失灵',
    'ID/账户锁无法解除','NFC功能异常','NFC公交卡未解除','指纹无法完全录入和解锁','面容无法录入和识别'
  ];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    var idx = line.indexOf(':');
    if (idx === -1) continue;
    var key = line.substring(0, idx).trim();
    var val = line.substring(idx + 1).trim();
    if (caixiuKeys.indexOf(val) !== -1) {
      result.caixiu.push(val);
    } else if (gongnengKeys.indexOf(val) !== -1) {
      result.gongneng.push(val);
    }
    if (key === '屏幕显示' || key === '屏幕外观' || key === '边框背板' || key === '外壳维修' || key === '机身弯曲') {
      result.biankuang.push(key + ':' + val);
    }
  }
  return result;
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
      if (written < 6) console.log('[质检B] 记录', written, 'createdAt:', createdAt, 'submitTime:', submitTime, 'interval:', interval, 'efficiency:', efficiency, 'user:', user.inspector);
      var inspTime = (createdAt && submitTime) ? fmtDiff(createdAt - submitTime) : '';
      var interval = (rec._interval > 0) ? fmtDiff(rec._interval) : '';
      var efficiency = (rec._efficiency > 0) ? fmtDiff(rec._efficiency) : '';
      var selInfo = parseSelections(rec.selections);

      var fields = {};
      if (rec.barcode) fields['物品条码'] = rec.barcode;
      if (rec.detectionLine) fields['检测线'] = rec.detectionLine;
      fields['品类'] = rec.category || '';
      if (rec.brand) fields['品牌'] = rec.brand;
      if (rec.model) fields['机型'] = rec.model;
      if (rec.machineType) fields['渠道'] = rec.machineType;
      if (user.jobNo) fields['工号'] = user.jobNo;
      if (user.inspector) fields['质检人'] = user.inspector;
      if (user.site) fields['站点'] = user.site;
      if (createdAt) fields['提交时间'] = createdAt;
      if (inspTime) fields['质检时间'] = inspTime;
      fields['质检间隔时间'] = interval || '';
      fields['质检时效'] = efficiency || '';
      fields['分步质检'] = rec.step || '';
      fields['功能'] = selInfo.gongneng.length ? selInfo.gongneng.join(',') : '';
      fields['拆修'] = selInfo.caixiu.length ? selInfo.caixiu.join(',') : '';
      fields['边框背板'] = selInfo.biankuang.join('; ');

      batch.push({ fields });
      ids.push(rec._id);
      written++;

      if (batch.length >= 500) {
        var ok = false;
        try {
          var cr = await feishuPost(`https://open.feishu.cn/open-apis/bitable/v1/apps/${CONFIG.appToken}/tables/${tblId}/records/batch_create`, { records: batch });
          ok = (cr.code === 0);
          if (!ok) console.error('[质检B] batch_create返回:', JSON.stringify(cr).substring(0,200));
        } catch(e) { console.error('[质检B] batch_create异常:', e.message); }
        if (ok) { try { await cloudPost('/mark-pushed', { ids: ids }); } catch(e) { console.error('[质检B] mark-pushed异常:', e.message); } }
        console.log('[质检B] 已写入', written, '/', total);
        batch = []; ids = [];
      }
    }
    if (batch.length) {
      var ok2 = false;
      try {
        var cr2 = await feishuPost(`https://open.feishu.cn/open-apis/bitable/v1/apps/${CONFIG.appToken}/tables/${tblId}/records/batch_create`, { records: batch });
        ok2 = (cr2.code === 0);
        if (!ok2) console.error('[质检B] 最后批次返回:', JSON.stringify(cr2).substring(0,200));
      } catch(e) { console.error('[质检B] 最后批次异常:', e.message); }
      if (ok2) { try { await cloudPost('/mark-pushed', { ids: ids }); } catch(e) { console.error('[质检B] mark-pushed异常:', e.message); } }
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

async function computeLocalRank() {
  var data = await cloudGet('/stats');
  if (!data || data.code !== 0 || !data.data || !data.data.length) return null;
  var items = data.data;

  var now = new Date();
  var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var yesterdayStart = new Date(todayStart.getTime() - 24*60*60*1000);
  var dow = now.getDay(); if (dow === 0) dow = 7;
  var weekStart = new Date(todayStart.getTime() - (dow - 1) * 24*60*60*1000);
  // 本周日23:59:59作为周结束
  var weekEnd = new Date(weekStart.getTime() + 7 * 24*60*60*1000);
  var monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  // 本月最后一天
  var monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  function parseUser(userName) {
    if (!userName) return { name: '', site: '' };
    var parts = userName.split('-');
    var name = '';
    var site = '';

    var qcIdx = -1;
    for (var i = 1; i < parts.length; i++) {
      if (parts[i].indexOf('质检') !== -1) {
        name = parts[i].replace(/^.*?质检/, '');
        if (name.includes('+')) name = name.split('+').pop();
        qcIdx = i;
        break;
      }
    }

    if (qcIdx >= 0) {
      site = parts.slice(qcIdx + 1).join('-');
    } else {
      var rawName = parts.length >= 2 ? parts[1] : parts[0];
      name = rawName.includes('+') ? rawName.split('+').pop() : rawName;
      if (parts.length >= 4) {
        site = parts[2] + '-' + parts[3];
      } else if (parts.length >= 3) {
        site = parts[2];
      }
    }

    return { name, site };
  }

  function getAt(r) {
    if (!r || !r.createdAt) return 0;
    var v = r.createdAt;
    if (v.$date) return v.$date;
    if (typeof v === 'number') return v;
    if (typeof v === 'string') { var d = new Date(v); return isNaN(d.getTime()) ? 0 : d.getTime(); }
    if (v instanceof Date) return v.getTime();
    return 0;
  }

  function getSt(r) {
    if (!r || !r.submitTime) return 0;
    var d = new Date(String(r.submitTime).replace(/-/g, '/') + ' GMT+0800');
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }

  function filterByTime(data, start, end) {
    return data.filter(function(r) {
      var ct = getAt(r);
      if (!ct) return false;
      if (start && ct < start.getTime()) return false;
      if (end && ct >= end.getTime()) return false;
      return true;
    });
  }

  var MANAGER_BLACKLIST = ['冯琳','陈犁','耿少朋','李滋业','沈力','王航飞','杜鹏','甘冰'];

  function calcStats(data, maxGap) {
    var userMap = {};
    for (var i = 0; i < data.length; i++) {
      var r = data[i];
      if (!r.userName) continue;
      var pu = parseUser(r.userName);
      if (!pu.name || MANAGER_BLACKLIST.indexOf(pu.name) !== -1) continue;
      if (!userMap[pu.name]) userMap[pu.name] = { site: pu.site, records: [] };
      userMap[pu.name].records.push(r);
    }

    var result = [];
    for (var name in userMap) {
      var ug = userMap[name];
      ug.records.sort(function(a, b) { return getAt(a) - getAt(b); });
      var siteSmallGap = /深圳.*龙岗/.test(ug.site) ? 5400000 : 7200000;
      var smallGap = 5400000; // 龙岗1.5h/其他2h通用
      var bigGap = maxGap > 0 ? maxGap : siteSmallGap;

      // 检测每天是否上班(>10台当天)
      var dayCount = {};
      for (var d = 0; d < ug.records.length; d++) {
        var dt = getAt(ug.records[d]);
        if (!dt) continue;
        var dk = new Date(dt).toDateString();
        dayCount[dk] = (dayCount[dk] || 0) + 1;
      }

      var intervalSum = 0, totalGapSum = 0, workSum = 0, validCount = 0;
      var stepCounts = { qj: 0, sku: 0, gn: 0, cx: 0, wg: 0 };
      var stepTime = { qj: 0, sku: 0, gn: 0, cx: 0, wg: 0 };
      var stepInterval = { qj: 0, sku: 0, gn: 0, cx: 0, wg: 0 };

      var lastValidIdx = -1;

      for (var j = 0; j < ug.records.length; j++) {
        var rec = ug.records[j];
        var ct = getAt(rec), st = getSt(rec);
        if (!ct || !st) continue;

        // Y线不分步: createdAt到submitTime < 2分钟 → 排除
        if (rec.detectionLine === 'Y线') {
          var step2 = rec.step || '';
          var m3 = step2.match(/(\d+)\/(\d+)/);
          if (!m3 || parseInt(m3[2]) !== 4) {
            if (ct && st && (ct - st) < 120000) continue;
          }
        }

        validCount++;
        var step = rec.step || '';
        var m2 = step.match(/(\d+)\/(\d+)/);
        var sk = 'qj';
        if (m2 && parseInt(m2[2]) === 4) {
          if (m2[1] === '1') sk = 'sku';
          else if (m2[1] === '2') sk = 'gn';
          else if (m2[1] === '3') sk = 'cx';
          else if (m2[1] === '4') sk = 'wg';
        }
        stepCounts[sk]++;
        workSum += (ct - st);

        if (lastValidIdx >= 0) {
          var prevRec = ug.records[lastValidIdx];
          var prevAt = getAt(prevRec);
          var prevDay = new Date(prevAt).toDateString();
          var curDay = new Date(ct).toDateString();
          var gapLimit = (prevDay === curDay && dayCount[prevDay] > 10) ? siteSmallGap : bigGap;
          // 跳过记录时间隔算0,相邻有效记录正常计算
          if (lastValidIdx === j - 1) {
            var gap = st - prevAt;
            if (gap > 0 && gap < gapLimit) {
              intervalSum += gap;
              stepInterval[sk] += gap;
            }
            var tg = ct - prevAt;
            if (tg > 0) totalGapSum += tg;
          }
        }

        lastValidIdx = j;
      }

      // 总间隔平均 = sum / (count-1), 取第2台开始算
      var avgTotalGap = validCount > 1 ? Math.round(totalGapSum / (validCount - 1) / 1000) : 0;
      // 平均时效 = 每单(createdAt - submitTime)之和 / 数量
      var avgInterval = validCount > 0 ? Math.round(workSum / validCount / 1000) : 0;

      result.push({
        inspector: name,
        site: ug.site,
        count: validCount,
        totalInterval: Math.round(intervalSum / 1000),   // 间隔时间累计(秒)
        avgInterval: avgInterval,                           // 平均时效(秒)
        avgTotalGap: avgTotalGap,                          // 平均每台(秒)
        steps: { qj: stepCounts.qj, sku: stepCounts.sku, gn: stepCounts.gn, cx: stepCounts.cx, wg: stepCounts.wg },
        stepInt: { qj: Math.round(stepInterval.qj/1000), sku: Math.round(stepInterval.sku/1000), gn: Math.round(stepInterval.gn/1000), cx: Math.round(stepInterval.cx/1000), wg: Math.round(stepInterval.wg/1000) }
      });
    }
    return result;
  }

  var dailyData = filterByTime(items, yesterdayStart, todayStart);
  var weeklyData = filterByTime(items, weekStart, weekEnd);
  var monthlyData = filterByTime(items, monthStart, monthEnd);

  // daily用龙岗1.5h/其他2h, weekly/monthly用5h剔除休息时间
  var dailyMaxGap = 7200000;
  var longMaxGap = 10800000; // 3小时

  return {
    daily: { inspectors: calcStats(dailyData, 0) },
    weekly: { inspectors: calcStats(weeklyData, longMaxGap) },
    monthly: { inspectors: calcStats(monthlyData, longMaxGap) }
  };
}
const RANK_TABLE_FIELDS = [
  {"field_name":"全检","type":1}, {"field_name":"SKU","type":1},
  {"field_name":"功能","type":1}, {"field_name":"拆修","type":1},
  {"field_name":"外观","type":1},
  {"field_name":"平均时效","type":1}, {"field_name":"间隔时间","type":1},
  {"field_name":"平均每台","type":1}
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
  if (!tblId) return;
  var items = [], pt = '';
  while (true) {
    var u = `https://open.feishu.cn/open-apis/bitable/v1/apps/${CONFIG.appToken}/tables/${tblId}/records?page_size=500`;
    if (pt) u += '&page_token=' + pt;
    var rp = await feishuGet(u);
    if (rp.code !== 0 || !rp.data || !rp.data.items || !rp.data.items.length) break;
    items = items.concat(rp.data.items.map(x => x.record_id));
    if (!rp.data.has_more) break; else pt = rp.data.page_token;
  }
  if (!items.length) return;
  console.log('[排名] 清空表', tblId, items.length, '条记录');
  for (var i = 0; i < items.length; i++) {
    try { await feishuDelete(`https://open.feishu.cn/open-apis/bitable/v1/apps/${CONFIG.appToken}/tables/${tblId}/records/${items[i]}`); } catch(e) { console.error('[排名] 清空表异常:', e.message); break; }
  }
}

function formatInspectors(inspectors) { return (inspectors||[]).slice().sort((a,b)=>b.count-a.count); }

// 每行显示各分类第N名: 质检数/时效/间隔/步骤各自排名
async function writeRankTable(token, tblId, label, inspectors) {
  if (!inspectors.length) return;

  var categories = [
    { field: '全检', stepKey: 'qj', addSite: true },
    { field: 'SKU', stepKey: 'sku', addSite: true },
    { field: '功能', stepKey: 'gn', addSite: true },
    { field: '拆修', stepKey: 'cx', addSite: true },
    { field: '外观', stepKey: 'wg', addSite: true },
    { field: '平均时效', sort: function(a,b){ return a.avgInterval - b.avgInterval; }, format: function(p){ return (p.site||'') + p.inspector + ' ' + fmtSec(p.avgInterval); } },
    { field: '间隔时间', sort: function(a,b){ return b.totalInterval - a.totalInterval; }, format: function(p){ return (p.site||'') + p.inspector + ' ' + fmtSec(p.totalInterval); } },
    { field: '平均每台', sort: function(a,b){ return a.avgTotalGap - b.avgTotalGap; }, format: function(p){ return (p.site||'') + p.inspector + ' ' + fmtSec(p.avgTotalGap); } }
  ];

  // Pre-sort each category
  var ranked = [];
  for (var ci = 0; ci < categories.length; ci++) {
    var cat = categories[ci];
    var sorted;
    if (cat.stepKey) {
      sorted = inspectors.slice().sort(function(a,b){
        return (b.steps&&b.steps[cat.stepKey]?b.steps[cat.stepKey]:0) - (a.steps&&a.steps[cat.stepKey]?a.steps[cat.stepKey]:0);
      });
      var prefix2 = cat.addSite ? function(p){ return (p.site||'') + p.inspector + ' ' + (p.steps&&p.steps[cat.stepKey]?p.steps[cat.stepKey]:0); } : function(p){ return p.inspector + ' ' + (p.steps&&p.steps[cat.stepKey]?p.steps[cat.stepKey]:0); };
      ranked.push(sorted.map(prefix2));
    } else {
      sorted = inspectors.slice().sort(cat.sort);
      ranked.push(sorted.map(cat.format));
    }
  }

  var maxRows = 0;
  for (var ri = 0; ri < ranked.length; ri++) { maxRows = Math.max(maxRows, ranked[ri].length); }

  var records = [];
  for (var r = 0; r < maxRows; r++) {
    var fields = {};
    for (var c = 0; c < categories.length; c++) {
      fields[categories[c].field] = (ranked[c][r] || '-');
    }
    records.push({ fields: fields });
    if (records.length >= 500) {
      await feishuPost(`https://open.feishu.cn/open-apis/bitable/v1/apps/${CONFIG.appToken}/tables/${tblId}/records/batch_create`, { records: records });
      records = [];
    }
  }
  if (records.length) {
    await feishuPost(`https://open.feishu.cn/open-apis/bitable/v1/apps/${CONFIG.appToken}/tables/${tblId}/records/batch_create`, { records: records });
  }
  console.log('[排名] 已写入:', label, maxRows, '行');
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
    console.log('[排名] 本地计算排名...');
    var rd = await computeLocalRank();
    if (!rd) { console.log('[排名] 无数据'); return; }

    var now = new Date();
    var yesterday = new Date(now.getTime() - 24*60*60*1000);
    var dailyLabel = '昨日排名' + (yesterday.getMonth()+1) + '.' + yesterday.getDate();
    var dow = now.getDay(); if (dow === 0) dow = 7;
    var mon = new Date(now.getTime() - (dow-1)*24*60*60*1000);
    var sun = new Date(mon.getTime() + 6*24*60*60*1000);
    var weeklyLabel = '本周排名' + (mon.getMonth()+1) + '.' + mon.getDate() + '-' + (sun.getMonth()+1) + '.' + sun.getDate();
    var lastDay = new Date(now.getFullYear(), now.getMonth()+1, 0);
    var monthlyLabel = '本月排名' + (now.getMonth()+1) + '.1-' + (now.getMonth()+1) + '.' + lastDay.getDate();
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
