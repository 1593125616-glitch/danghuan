const { getToken, feishuGet, feishuPost, feishuPut, feishuDelete, cloudGet, cloudPost, sendMsg } = require('./feishu');
const CONFIG = require('./config');
const XLSX = require('xlsx');

const BITABLE = 'XHOMbD0XtaEHtasq5KqcyvSznPh';
let processedIds = new Set();

function pad(n) { return n < 10 ? '0' + n : '' + n; }

function parseDate(str) {
  if (!str) return null;
  var s = String(str).trim().replace(/年|月/g, '-').replace(/日/g, '');
  var m = s.match(/(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/);
  if (m) { var d = new Date(m[1].replace(/\//g, '-')); if (!isNaN(d.getTime())) { d.setHours(0, 0, 0, 0); return d; } }
  return null;
}

function wText(d) {
  if (d < 30) return '保修时长<30天';
  if (d < 110) return '30天≤保修时长<110天';
  if (d < 190) return '110天≤保修时长<190天';
  if (d < 250) return '190天≤保修时长<250天';
  if (d < 330) return '250天≤保修时长<330天';
  return '保修时长≥330天';
}

async function deleteOldTables(token) {
  var tabs = await feishuGet(`https://open.feishu.cn/open-apis/bitable/v1/apps/${BITABLE}/tables?page_size=50`);
  if (tabs.code !== 0) return;
  for (var t of (tabs.data.items || [])) {
    if (/手机保修复检|保修差异|无记录/.test(t.name)) {
      try { await feishuDelete(`https://open.feishu.cn/open-apis/bitable/v1/apps/${BITABLE}/tables/${t.table_id}`); } catch(e) {}
    }
  }
}

async function downloadFile(token, msgId, fileKey) {
  var url = `https://open.feishu.cn/open-apis/im/v1/messages/${msgId}/resources/${fileKey}?type=file`;
  var resp = await feishuGet(url);
  // Feishu returns binary differently via axios - need to handle this
  var { data } = await require('axios').get(url, {
    headers: { 'Authorization': 'Bearer ' + token },
    responseType: 'arraybuffer'
  });
  return new Uint8Array(data);
}

async function doImport(token, files) {
  await deleteOldTables(token);
  try { await cloudPost('/baoxiu-clear', {}); } catch(e) {}

  var duckAll = [];
  for (var f of files) {
    try {
      var raw = await downloadFile(token, f.msgId, f.fileKey);
      var wb = XLSX.read(raw, { type: 'array' });
      var arr = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
      if (!arr.length) continue;

      if (/手机保修复检/i.test(f.name)) {
        var hd = arr[0].map(h => String(h || ''));
        var fds = hd.filter(h => h).map(h => ({ field_name: h, type: 1 }));
        var cr = await feishuPost(`https://open.feishu.cn/open-apis/bitable/v1/apps/${BITABLE}/tables`,
          { table: { name: '手机保修复检(第二批)', fields: fds } });
        var tid = cr.data ? cr.data.table_id : '';
        if (!tid) continue;
        var recs = [];
        for (var r = 1; r < arr.length; r++) {
          var rf = {};
          for (var c = 0; c < hd.length; c++) rf[hd[c]] = typeof arr[r][c] === 'number' ? String(Math.round(arr[r][c])) : String(arr[r][c] || '');
          recs.push({ fields: rf });
          if (recs.length >= 500) { await feishuPost(`https://open.feishu.cn/open-apis/bitable/v1/apps/${BITABLE}/tables/${tid}/records/batch_create`, { records: recs }); recs = []; }
        }
        if (recs.length) await feishuPost(`https://open.feishu.cn/open-apis/bitable/v1/apps/${BITABLE}/tables/${tid}/records/batch_create`, { records: recs });
      } else {
        duckAll.push({ name: f.name, rows: arr });
      }
    } catch(e) { console.error(f.name, e.message); }
  }
  return duckAll;
}

async function doWarranty(token, duckAll) {
  var tabs = await feishuGet(`https://open.feishu.cn/open-apis/bitable/v1/apps/${BITABLE}/tables?page_size=50`);
  if (tabs.code !== 0) return sendMsg('找不到表列表');
  var rTab = tabs.data.items.find(t => /手机保修复检/i.test(t.name));
  if (!rTab) return sendMsg('找不到手机保修复检表');
  if (!duckAll.length) return sendMsg('无鸭宝数据');

  // Build IMEI index
  var idx = {}, si = 0;
  for (var d of duckAll) {
    var dr = d.rows;
    if (!dr.length) continue;
    var hd = dr[0].map(h => String(h || '').trim());
    var col = -1, wc = -1;
    for (var x = 0; x < hd.length; x++) {
      if (hd[x] === '输入串号') col = x;
      else if (col < 0 && /^IMEI$/i.test(hd[x])) col = x;
      if (/保修结束日期|保修到期|保修截止/i.test(hd[x])) wc = x;
    }
    if (col < 0) continue;
    for (var y = 1; y < dr.length; y++) {
      var raw = String(dr[y][col] || '').replace(/[\s\t\r\n]/g, '');
      if (/^[\d.]+e\+\d+$/i.test(raw)) { var n = Number(raw); if (!isNaN(n)) raw = String(Math.round(n)); }
      if (raw && !idx[raw]) { idx[raw] = { row: dr[y], wc: wc >= 0 ? wc : 14 }; si++; }
    }
  }
  console.log('[机器人] IMEI索引:', si);

  // Read main table records
  var recs = [], pt = '';
  while (true) {
    var u = `https://open.feishu.cn/open-apis/bitable/v1/apps/${BITABLE}/tables/${rTab.table_id}/records?page_size=500`;
    if (pt) u += '&page_token=' + pt;
    var rp = await feishuGet(u);
    if (rp.code !== 0 || !rp.data.items.length) break;
    recs = recs.concat(rp.data.items);
    if (!rp.data.has_more) break;
    pt = rp.data.page_token;
  }
  console.log('[机器人] 手机保修复检:', recs.length);

  var today = new Date(); today.setHours(0, 0, 0, 0);
  var chg = [], noR = [], ok = [];
  for (var rec of recs) {
    try {
      var fs = rec.fields, imei = '';
      for (var fk in fs) {
        var v = String(fs[fk] || '').trim();
        if (fk === 'IMEI' && v) imei = v.replace(/[\s\t\r\n]/g, '');
        if (/物品码|物品条码/i.test(fk)) { /* skip */ }
      }
      if (!imei) continue;
      var fo = idx[imei];
      if (!fo) { noR.push({ imei, rid: rec.record_id, fields: fs }); continue; }
      var wStr = fo.wc < fo.row.length ? String(fo.row[fo.wc] || '') : '';
      var wd = parseDate(wStr);
      if (!wd) { noR.push({ imei, rid: rec.record_id, fields: fs }); continue; }
      var days = Math.floor((wd - today) / (1000 * 60 * 60 * 24));
      var ew = wText(days);
      var sku = ''; for (var sk in fs) { if (/sku|SKU/i.test(sk)) { sku = String(fs[sk]); break; } }
      var cw = ''; var parts = sku.split('|'); if (parts.length) cw = parts[parts.length - 1].trim();
      if (cw && cw !== ew) chg.push({ imei, days, ew, rid: rec.record_id, fields: fs });
      else ok.push({ imei, days, rid: rec.record_id, fields: fs });
    } catch(e) {}
  }
  console.log('[机器人] chg:', chg.length, 'ok:', ok.length, 'noR:', noR.length);

  // Create result tables
  var rfs = await feishuGet(`https://open.feishu.cn/open-apis/bitable/v1/apps/${BITABLE}/tables/${rTab.table_id}/fields`);
  var tf = (rfs.data.items || []).filter(f => f.type !== 21);

  async function mkTbl(name, list) {
    if (!list.length) return;
    var cr = await feishuPost(`https://open.feishu.cn/open-apis/bitable/v1/apps/${BITABLE}/tables`, { table: { name, fields: tf } });
    var tid = cr.data ? cr.data.table_id : '';
    if (!tid) return;
    var rs = [];
    for (var item of list) {
      var f = {};
      for (var k in item.fields) f[k] = String(item.fields[k] || '');
      if (name === '保修差异' && item.ew) f['出库时间'] = item.ew;
      if (name === '无记录') f['出库时间'] = '无记录';
      rs.push({ fields: f });
      if (rs.length >= 500) { await feishuPost(`https://open.feishu.cn/open-apis/bitable/v1/apps/${BITABLE}/tables/${tid}/records/batch_create`, { records: rs }); rs = []; }
    }
    if (rs.length) await feishuPost(`https://open.feishu.cn/open-apis/bitable/v1/apps/${BITABLE}/tables/${tid}/records/batch_create`, { records: rs });
  }
  await mkTbl('保修差异', chg);
  await mkTbl('无记录', noR);

  // Delete chg+noR from main table
  var delFromMain = chg.concat(noR);
  if (delFromMain.length) {
    var delIds = delFromMain.map(d => d.rid);
    for (var di = 0; di < delIds.length; di += 500) {
      var chunk = delIds.slice(di, di + 500);
      try { await feishuDelete(`https://open.feishu.cn/open-apis/bitable/v1/apps/${BITABLE}/tables/${rTab.table_id}/records/batch_delete`); /* Feishu batch_delete takes records in body */ } catch(e) {}
      // Feishu batch delete via POST with body
      try {
        await feishuPost(`https://open.feishu.cn/open-apis/bitable/v1/apps/${BITABLE}/tables/${rTab.table_id}/records/batch_delete`, { records: chunk });
      } catch(e) {}
    }
  }

  // Batch update ok records
  if (ok.length) {
    var updates = ok.map(o => ({ record_id: o.rid, fields: { '出库时间': o.days + '天' } }));
    for (var ui = 0; ui < updates.length; ui += 500) {
      var ub = updates.slice(ui, ui + 500);
      try { await feishuPut(`https://open.feishu.cn/open-apis/bitable/v1/apps/${BITABLE}/tables/${rTab.table_id}/records/batch_update`, { records: ub }); } catch(e) {}
    }
  }

  // Upload noR IMEIs
  if (noR.length) {
    var imeis = noR.map(r => r.imei);
    try { await cloudPost('/baoxiu-upload', { imeis }); } catch(e) {}
  }

  var msg = '保修计算完成\n需改:' + chg.length + '  OK:' + ok.length + '  无记录:' + noR.length;
  await sendMsg(msg);
}

async function pollMessages() {
  try {
    var token = await getToken();
    var msgs = await feishuGet(
      `https://open.feishu.cn/open-apis/im/v1/messages?container_id_type=chat&container_id=${CONFIG.botChatId}&page_size=10&sort_type=ByCreateTimeDesc`
    );
    if (!msgs.data || !msgs.data.items.length) return;

    var items = msgs.data.items;
    var mentionItem = null;
    for (var item of items) {
      var mentions = item.mentions || [];
      // 调试: 打印第一个@消息的mention列表
      if (mentions.length && !mentionItem) console.log('[机器人] mention检查:', JSON.stringify(mentions.map(m=>({name:m.name,id:m.id,key:m.key}))), 'botName:', CONFIG.botName);
      if (mentions.some(m => m.name === CONFIG.botName) && item.msg_type !== 'file') {
        mentionItem = item;
        break;
      }
    }
    if (!mentionItem || processedIds.has(mentionItem.message_id)) return;
    processedIds.add(mentionItem.message_id);

    // 检查文本命令
    try {
      var content = JSON.parse(mentionItem.body.content);
      var text = content.text || '';

      // "重新查询"命令
      if (/重新查询/.test(text)) {
        console.log('[机器人] 重新查询');
        // 直接从消息列表收集文件(跳过文本命令消息,收集其后的Excel文件)
        var rfiles = [];
        var mi = items.indexOf(mentionItem);
        for (var j = mi + 1; j < items.length; j++) {
          var pm = items[j];
          if (processedIds.has(pm.message_id)) break;
          if (pm.msg_type === 'file') {
            try {
              var fc = JSON.parse(pm.body.content);
              if (/\.xlsx?$/i.test(fc.file_name || '')) {
                rfiles.push({ msgId: pm.message_id, fileKey: fc.file_key, name: fc.file_name.replace(/\.xlsx?$/i, '') });
              }
            } catch(e) {}
          }
        }
        if (!rfiles.length) { await sendMsg('无上次查询记录'); return; }
        await sendMsg('收到' + rfiles.length + '个文件(重新查询)');
        var duck2 = await doImport(token, rfiles);
        await sendMsg('导入完成,计算保修...');
        await doWarranty(token, duck2);
        return;
      }

      // "删除表格"命令
      if (/删除表格/.test(text)) {
        await deleteOldTables(token);
        await sendMsg('已删除手机保修复检/保修差异/无记录表');
        return;
      }
    } catch(e) {}

    // Collect files after mention (regular processing)
    var files = [];
    var mIdx = items.indexOf(mentionItem);
    for (var j2 = mIdx + 1; j2 < items.length; j2++) {
      var pm = items[j2];
      if (processedIds.has(pm.message_id)) break;
      if (pm.msg_type === 'file') {
        try {
          var c = JSON.parse(pm.body.content);
          if (/\.xlsx?$/i.test(c.file_name || '')) {
            files.push({ msgId: pm.message_id, fileKey: c.file_key, name: c.file_name.replace(/\.xlsx?$/i, '') });
            processedIds.add(pm.message_id);
          }
        } catch(e) {}
      }
    }
    if (!files.length) return;

    await sendMsg('收到' + files.length + '个文件');
    var duck = await doImport(token, files);
    await sendMsg('导入完成,计算保修...');
    await doWarranty(token, duck);
  } catch(e) {
    console.error('[机器人] 异常:', e.message);
  }
}

console.log('[机器人] 云托管服务已启动');
setInterval(pollMessages, 30000);
pollMessages();
