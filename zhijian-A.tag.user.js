// ==UserScript==
// @name         质检中心-提交后自动上传
// @namespace    http://tampermonkey.net/
// @version      3.9
// @description  点击提交后自动上传物品条码+账号+时间到腾讯云
// @author       Kun
// @match        https://yihuan.oppoer.me/*
// @match        http://yihuan.oppoer.me/static/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      zhijian-d7gqnvecce55e0e0e-1445087380.ap-shanghai.app.tcloudbase.com
// @connect      cdn.jsdelivr.net
// @run-at       document-idle
// @updateURL    https://cdn.jsdelivr.net/gh/1593125616-glitch/danghuan/zhijian-A.tag.user.js
// @downloadURL  https://cdn.jsdelivr.net/gh/1593125616-glitch/danghuan/zhijian-A.tag.user.js
// ==/UserScript==

(function() {
    'use strict';

    // ===== 配置区 - 部署云函数后修改此处 URL =====
    const CLOUD_FN_URL = 'https://zhijian-d7gqnvecce55e0e0e-1445087380.ap-shanghai.app.tcloudbase.com/zhijian';

    function getBarcode() {
        const input = document.querySelector('input[placeholder="请输入物品条码"]');
        if (input && input.value.trim()) return input.value.trim();

        const items = document.querySelectorAll('.el-form-item');
        for (const item of items) {
            const label = item.querySelector('.el-form-item__label');
            if (label && label.textContent.trim() === '物品条码') {
                const inp = item.querySelector('input');
                if (inp && inp.value.trim()) return inp.value.trim();
            }
        }
        try {
            const form = document.querySelector('.el-form');
            if (form && form.__vue__ && form.__vue__.model) {
                return form.__vue__.model.goodsCode || '';
            }
        } catch(e) {}
        return '';
    }

    function getUserInfo() {
        const match = document.cookie.match(/(?:^|;\s*)p_name=([^;]*)/);
        if (match) return decodeURIComponent(match[1]);
        const userEl = document.querySelector('.el-dropdown-link');
        if (userEl) return userEl.textContent.trim();
        try {
            const info = sessionStorage.getItem('userInfo');
            if (info) {
                const parsed = JSON.parse(info);
                return parsed.name || '';
            }
        } catch(e) {}
        return '';
    }

    function getFieldValue(labelName) {
        var items = document.querySelectorAll('.el-form-item');
        for (var i = 0; i < items.length; i++) {
            var label = items[i].querySelector('.el-form-item__label');
            if (label && label.textContent.trim() === labelName) {
                var inp = items[i].querySelector('.el-input__inner');
                if (inp) {
                    var val = inp.value.trim();
                    if ((!val || val === '请选择') && inp.placeholder && inp.placeholder !== '请选择') val = inp.placeholder.trim();
                    if (val && val !== '请选择') return val;
                }
                var tag = items[i].querySelector('.el-select__tags-text, .el-select__selection span, .el-select .el-tag');
                if (tag) {
                    var tval = tag.textContent.trim();
                    if (tval && tval !== '请选择') return tval;
                }
            }
        }
        return '';
    }

    function getCategory() {
        if (window.dropdownSelections && window.dropdownSelections['品类']) {
            return window.dropdownSelections['品类'];
        }
        return getFieldValue('品类');
    }

    function getBrand() { return getFieldValue('品牌'); }
    function getModel() { return getFieldValue('机型'); }

    function getTimestamp() {
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        return now.getFullYear() + '-' + pad(now.getMonth()+1) + '-' + pad(now.getDate()) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
    }

    function getMachineType() {
        var tags = document.querySelectorAll('.goods-source');
        if (!tags.length) return '';
        var types = [];
        for (var i = 0; i < tags.length; i++) {
            var t = tags[i].textContent.trim();
            if (t) types.push(t);
        }
        return types.join(',');
    }

    function getAllSelections() {
        var labels = document.querySelectorAll('.el-form-item__label');
        var pairs = [];
        var skipLabels = ['检测线', '物品条码', '品类', '品牌', '机型'];
        for (var i = 0; i < labels.length; i++) {
            var text = labels[i].textContent.trim();
            if (!text) continue;
            if (skipLabels.indexOf(text) !== -1) continue;
            var content = labels[i].nextElementSibling;
            if (!content) continue;
            var active = content.querySelector('.el-radio-button.is-active .el-radio-button__inner');
            if (!active) active = content.querySelector('.el-radio.is-checked .el-radio__label');
            var val = '';
            if (active) {
                var span = active.querySelector('span');
                val = span ? span.textContent.trim() : active.textContent.trim();
            }
            if (!val) {
                var inp = content.querySelector('.el-input__inner');
                if (inp && inp.value && inp.value !== '请选择') val = inp.value.trim();
            }
            if (!val) {
                var tag = content.querySelector('.el-tag');
                if (tag) val = tag.textContent.trim();
            }
            if (val) pairs.push(text + ':' + val);
        }
        return pairs.join('\n');
    }

    function getStepInfo() {
        var spans=document.querySelectorAll('span');
        for(var i=0;i<spans.length;i++){
            if(spans[i].textContent.trim().indexOf('当前步骤')===0){
                var next=spans[i+1];
                if(next){
                    var t=next.textContent.trim();
                    // 只取形如 "sku问题项1/1" 或 "1/4" 的部分
                    var m=t.match(/^(.+?\d+\/\d+)/);
                    if(m)return m[1].trim();
                    return t;
                }
            }
        }
        return '';
    }

    function getDetectionLine() {
        const items = document.querySelectorAll('.el-form-item');
        for (const item of items) {
            const label = item.querySelector('.el-form-item__label');
            if (label && label.textContent.trim() === '检测线') {
                const inp = item.querySelector('.el-input__inner');
                if (inp) {
                    let val = inp.value.trim();
                    if ((!val || val === '请选择') && inp.placeholder && inp.placeholder !== '请选择') {
                        val = inp.placeholder.trim();
                    }
                    if (val && val !== '请选择') return val;
                }
            }
        }
        return '';
    }

    function uploadToCloud(data) {
        GM_xmlhttpRequest({
            method: 'POST',
            url: CLOUD_FN_URL + '/submit',
            data: JSON.stringify(data),
            headers: { 'Content-Type': 'application/json' },
            onload: function(resp) {
                console.log('[质检上传]', resp.status, resp.responseText);
                if (resp.status === 200) {
                    try {
                        const r = JSON.parse(resp.responseText);
                        if (r.code === 0) {
                            console.log('[质检上传] 成功');
                        } else {
                            console.error('[质检上传] 失败:', r.message);
                        }
                    } catch(e) {
                        console.error('[质检上传] 解析响应失败');
                    }
                }
            },
            onerror: function() {
                console.error('[质检上传] 网络错误');
            }
        });
    }

    function getInspector(userName) {
        if (!userName) return '';
        const parts = userName.split('-');
        return parts.length >= 2 ? parts[1] : parts[0];
    }

    let barcodeTimeMap = {};
    let lastBarcode = '';
    let lastUploadedKey = '';

    function recordBarcodeTime(barcode){
        var now = new Date();
        var pad = function(n){return String(n).padStart(2,'0');};
        var ts = now.getFullYear()+'-'+pad(now.getMonth()+1)+'-'+pad(now.getDate())+' '+pad(now.getHours())+':'+pad(now.getMinutes())+':'+pad(now.getSeconds());
        barcodeTimeMap[barcode] = ts;
        console.log('[质检] 扫码时间:', ts, '条码:', barcode);
    }

    // 轮询检测条码变化(VUE v-model不触发DOM事件，每次重新获取input以防Vue重建DOM)
    setInterval(function(){
        var inp = document.querySelector('input[placeholder="请输入物品条码"]');
        if(!inp) return;
        var v = inp.value.trim();
        if(v && v !== lastBarcode){ lastBarcode = v; recordBarcodeTime(v); }
        else if(!v && lastBarcode){ lastBarcode = ''; }
    }, 500);

    document.addEventListener('click', function(e) {
        const btn = e.target.closest('button');
        if (!btn) return;
        const btnText = btn.textContent.trim();
        if (btnText === '提交' || btnText === '提 交') {
            const barcode = getBarcode();
            const data = {
                barcode: barcode,
                userName: getUserInfo(),
                category: getCategory(),
                brand: getBrand(),
                model: getModel(),
                detectionLine: getDetectionLine(),
                step: getStepInfo(),
                machineType: getMachineType(),
                selections: getAllSelections(),
                submitTime: barcodeTimeMap[barcode] || getTimestamp()
            };
            console.log('[质检] 提交数据:', JSON.stringify(data));
            console.log('[质检] barcodeTime:', barcodeTimeMap[barcode] || '', 'fallback:', !barcodeTimeMap[barcode]);
            if (data.barcode && data.userName) {
                // K线 + 物品30天内在库质检报告 + 保修机 → 跳过上传
                if (data.detectionLine === 'K线') {
                    const bodyText = document.body.textContent || '';
                    if (/物品30天内在库质检报告/.test(bodyText) && /保修机/.test(bodyText)) {
                        console.log('[质检] K线+保修机，跳过上传:', data.barcode);
                        return;
                    }
                }
                // 去重：barcode + step + userName 与上次完全一致则跳过
                var thisKey = data.barcode + '|' + data.step + '|' + data.userName;
                if (thisKey === lastUploadedKey) {
                    console.log('[质检] 重复提交，跳过:', data.barcode, data.step);
                    lastBarcode = data.barcode; delete barcodeTimeMap[data.barcode];
                    return;
                }
                lastUploadedKey = thisKey;
                const inspector = getInspector(data.userName);
                uploadToCloud(data);
                console.log('[质检] 自动上传:', JSON.stringify(data));
                lastBarcode = data.barcode; delete barcodeTimeMap[data.barcode];
            } else {
                console.warn('[质检] 条码或用户信息为空，跳过上传');
            }
        }
    });

    // ========== 自动检测更新（每6小时，刷新不重置计时） ==========
    const A_CK_KEY = 'zhijian_a_last_update_check';
    const A_CK_INTERVAL = 6 * 60 * 60 * 1000;
    const A_URL = 'https://cdn.jsdelivr.net/gh/1593125616-glitch/danghuan/zhijian-A.tag.user.js';

    function isNewerVer(remote, current) {
        const r = remote.split('.').map(Number);
        const c = current.split('.').map(Number);
        for (let i = 0; i < Math.max(r.length, c.length); i++) {
            const rv = r[i] || 0, cv = c[i] || 0;
            if (rv > cv) return true;
            if (rv < cv) return false;
        }
        return false;
    }

    function shouldCheck(key) {
        if (typeof GM_getValue === 'undefined') return true;
        return Date.now() - GM_getValue(key, 0) >= A_CK_INTERVAL;
    }
    function markDone(key) { if (typeof GM_setValue !== 'undefined') GM_setValue(key, Date.now()); }

    // ========== 质检排名面板（可拖动、可折叠） ==========
    function fmtSec(sec) { if (sec < 60) return sec + '秒'; var m = Math.floor(sec/60); var s = sec%60; return m + '分' + (s ? s + '秒' : ''); }
    function showRankPanel(data, myName, mySite) {
        var PANEL_ID = 'qc_rank_panel';
        if (!document.getElementById('qc_rank_style')) {
            var s = document.createElement('style'); s.id = 'qc_rank_style';
            s.textContent = '#'+PANEL_ID+'{position:fixed;top:60px;right:10px;z-index:99998;background:#fff;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.15);font-size:12px;user-select:none;min-width:220px;max-height:80vh;overflow-y:auto;}'+
            '#'+PANEL_ID+' .rh{padding:6px 10px;background:#007aff;color:#fff;border-radius:8px 8px 0 0;font-weight:bold;cursor:move;display:flex;justify-content:space-between;}'+
            '#'+PANEL_ID+' .rcb{font-size:11px;cursor:pointer;}'+
            '#'+PANEL_ID+' .rb{padding:4px 0;}'+
            '#'+PANEL_ID+' .rs{padding:2px 10px;font-weight:bold;color:#999;font-size:11px;border-bottom:1px solid #eee;}'+
            '#'+PANEL_ID+' .rr{display:flex;align-items:center;padding:2px 10px;border-bottom:1px solid #f5f5f5;font-size:11px;}'+
            '#'+PANEL_ID+' .rk{min-width:24px;font-weight:bold;text-align:left;}'+
            '#'+PANEL_ID+' .rn{flex:1;}'+
            '#'+PANEL_ID+' .rs2{font-size:10px;color:#666;padding:1px 10px;}'+
            '#'+PANEL_ID+'.fold .rb{display:none;}'+
            '#'+PANEL_ID+'.fold .rs{display:none;}'+
            '#'+PANEL_ID+'.fold .rr{display:none;}'+
            '#'+PANEL_ID+'.fold .rs2{display:none;}'+
            '#'+PANEL_ID+'.fold .rh_fold{display:block;}'+
            '#'+PANEL_ID+' .rh_fold{display:none;padding:3px 10px;border-bottom:1px solid #eee;font-size:11px;}'+
            '#'+PANEL_ID+' .rh_top{color:#666;font-size:10px;}'+
            '#'+PANEL_ID+' .rc3{display:inline-block;min-width:68px;}';
            document.head.appendChild(s);
        }
        var el = document.getElementById(PANEL_ID);
        if (!el) { el = document.createElement('div'); el.id = PANEL_ID; document.body.appendChild(el); }

        var dragging = false, ox = 0, oy = 0;
        el.onmousedown = function(e) { if(e.target.closest('.rcb,.rh_fold,.rb'))return; dragging=true; ox=e.clientX-el.offsetLeft; oy=e.clientY-el.offsetTop; };
        document.onmousemove = function(e){ if(dragging){el.style.left=(e.clientX-ox)+'px';el.style.top=(e.clientY-oy)+'px';el.style.right='auto';}};
        document.onmouseup = function(){ dragging=false; };

        var inspectors = data.inspectors || [];
        var sites = data.sites || {};
        var stepLabels = ['qj','sku','gn','cx','wg'];
        var stepNames = ['全检','SKU','功能','拆修','外观'];

        // 每类步骤各取前N人组成5列排名
        var stepRanks = {};
        for (var si = 0; si < stepLabels.length; si++) {
            var key = stepLabels[si];
            var sorted = inspectors.slice().sort(function(a,b){ return (b[key]||0) - (a[key]||0); });
            stepRanks[key] = sorted;
        }

        // 找自己
        var self = null, selfToday = null;
        for (var i = 0; i < inspectors.length; i++) { if (inspectors[i].inspector === myName) { self = inspectors[i]; break; } }
        var todayList = data.today || [];
        for (var j = 0; j < todayList.length; j++) { if (todayList[j].inspector === myName) { selfToday = todayList[j]; break; } }

        function stepStr(s) {
            return '全检'+(s.qj||0)+'台 SKU'+(s.sku||0)+'台 功能'+(s.gn||0)+'台 拆修'+(s.cx||0)+'台 外观'+(s.wg||0)+'台';
        }

        var maxRows = 0;
        for (var si2 = 0; si2 < stepLabels.length; si2++) { maxRows = Math.max(maxRows, stepRanks[stepLabels[si2]].length); }

        var html = '<div class="rh" title="拖动移动"><span>'+(selfToday?stepStr(selfToday):'今日质检数量')+'</span><span class="rcb">折叠</span></div>';
        // 折叠态: 昨日自己+昨日第1(今日在标题已显示)
        html += '<div class="rh_fold">';
        html += '<span class="rh_top">昨日: '+(self?stepStr(self):'')+'</span><br>';
        if (maxRows > 0) {
            var r1 = '';
            for (var c1 = 0; c1 < stepLabels.length; c1++) {
                var f1 = stepRanks[stepLabels[c1]][0];
                r1 += (f1 ? f1.inspector+' '+(f1[stepLabels[c1]]||0) : '-') + (c1<stepLabels.length-1?' ':'');
            }
            html += '<span class="rh_top">1: '+r1+'</span>';
        }
        html += '</div>';

        html += '<div class="rb">';
        html += '<div class="rs">昨日排名</div>';
        if (self) {
            html += '<div class="rr"><span class="rk">自己</span><span class="rn">';
            html += '<span class="rc3">全检'+(self.qj||0)+'台</span>';
            html += '<span class="rc3">SKU'+(self.sku||0)+'台</span>';
            html += '<span class="rc3">功能'+(self.gn||0)+'台</span>';
            html += '<span class="rc3">拆修'+(self.cx||0)+'台</span>';
            html += '<span class="rc3">外观'+(self.wg||0)+'台</span>';
            html += '</span></div>';
        }

        for (var r = 0; r < maxRows; r++) {
            html += '<div class="rr"><span class="rk">'+(r+1)+'</span><span class="rn">';
            for (var c = 0; c < stepLabels.length; c++) {
                var p2 = stepRanks[stepLabels[c]][r];
                html += '<span class="rc3">'+(p2 ? p2.inspector+' '+(p2[stepLabels[c]]||0) : '-')+'</span>';
            }
            html += '</span></div>';
        }
        html += '</div>';
        el.innerHTML = html;
        if (GM_getValue('qc_rank_fold', false)) el.classList.add('fold');
        setTimeout(function() {
            var fcb = el.querySelector('.rcb');
            if (fcb) fcb.onclick = function() { el.classList.toggle('fold'); GM_setValue('qc_rank_fold', el.classList.contains('fold')); };
            var fed = el.querySelector('.rh_fold');
            if (fed) fed.onclick = function() { el.classList.remove('fold'); GM_setValue('qc_rank_fold', false); };
        }, 50);
    }

    function fetchRank() {
        var myName = (document.cookie.match(/(?:^|;\s*)p_name=([^;]*)/) || [])[1] || '';
        if (!myName) return;
        GM_xmlhttpRequest({
            method: 'GET',
            url: CLOUD_FN_URL + '/rank',
            onload: function(resp) {
                try {
                    var r = JSON.parse(resp.responseText);
                    if (r.code === 0 && r.data) {
                        var parts = myName.split('-');
                        var rawInspector = parts.length >= 2 ? parts[1] : '';
                        var myInspector = rawInspector.includes('+') ? rawInspector.split('+').pop() : rawInspector;
                        var mySite = parts.length >= 4 ? (parts[2] + '-' + parts[3]) : '深圳-龙岗';
                        showRankPanel(r.data, myInspector, mySite);
                    }
                } catch(e) {}
            }
        });
    }
    // 整点更新(8-24点)
    function scheduleNextFetch(){
        var now=new Date();
        var h=now.getHours();
        if(h<8||h>=24)return;
        var next=new Date(now);
        next.setHours(h+1,0,0,0);
        var delay=next-now;
        setTimeout(function(){fetchRank(); scheduleNextFetch();},delay);
    }
    setTimeout(function(){fetchRank(); scheduleNextFetch();}, 4000);

    function checkUpdate() {
        if (!shouldCheck(A_CK_KEY) || typeof GM_xmlhttpRequest === 'undefined') return;
        console.log('[质检A] 检查更新...');
        GM_xmlhttpRequest({
            method: 'GET', url: A_URL,
            onload: function(resp) {
                var m = resp.responseText.match(/@version\s+(\S+)/);
                if (!m) { markDone(A_CK_KEY); return; }
                console.log('[质检A] 远程版本:', m[1], '本地版本:', GM_info.script.version);
                if (isNewerVer(m[1], GM_info.script.version)) {
                    console.warn('[质检A] 发现新版本 ' + m[1] + '（当前 ' + GM_info.script.version + '），自动更新');
                    window.location.href = A_URL;
                } else {
                    markDone(A_CK_KEY);
                    console.log('[质检A] 已是最新版本');
                }
            },
            onerror: function() { markDone(A_CK_KEY); },
            ontimeout: function() { markDone(A_CK_KEY); }
        });
    }
    checkUpdate();
    setInterval(checkUpdate, A_CK_INTERVAL);
})();
