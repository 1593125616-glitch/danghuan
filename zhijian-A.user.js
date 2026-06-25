// ==UserScript==
// @name         质检中心-提交后自动上传
// @namespace    http://tampermonkey.net/
// @version      1.9
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
// @updateURL    https://cdn.jsdelivr.net/gh/1593125616-glitch/danghuan@main/zhijian-A.user.js
// @downloadURL  https://cdn.jsdelivr.net/gh/1593125616-glitch/danghuan@main/zhijian-A.user.js
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

    function getCategory() {
        if (window.dropdownSelections && window.dropdownSelections['品类']) {
            return window.dropdownSelections['品类'];
        }
        const labelNames = ['品类'];
        const items = document.querySelectorAll('.el-form-item');
        for (const item of items) {
            const label = item.querySelector('.el-form-item__label');
            if (label && labelNames.some(n => label.textContent.trim() === n)) {
                // 方式1: input 值
                const inp = item.querySelector('.el-input__inner');
                if (inp) {
                    let val = inp.value.trim();
                    if ((!val || val === '请选择') && inp.placeholder && inp.placeholder !== '请选择') {
                        val = inp.placeholder.trim();
                    }
                    if (val && val !== '请选择') return val;
                }
                // 方式2: 选中标签文本（Vue 异步渲染时 DOM 还没更新但文本已显示）
                const tag = item.querySelector('.el-select__tags-text, .el-select__selection span, .el-select .el-tag');
                if (tag) {
                    let val = tag.textContent.trim();
                    if (val && val !== '请选择') return val;
                }
            }
        }
        return '';
    }

    function getTimestamp() {
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        return now.getFullYear() + '-' + pad(now.getMonth()+1) + '-' + pad(now.getDate()) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
    }

    function getStepInfo() {
        const body=document.body.textContent||'';
        // 优先查"当前步骤"附近的数字
        var m=body.match(/当前步骤[：:][^\/]*(\d+)\/(\d+)/);
        if(!m)m=body.match(/步骤[^\/]*(\d+)\/(\d+)/);
        if(m){return parseInt(m[2])>1?'分步':'不分步';}
        // 兜底扫所有span
        const spans = document.querySelectorAll('span');
        for (const span of spans) {
            const t = span.textContent.trim();
            const sm = t.match(/(\d+)\/(\d+)(?!\/)/);
            if (sm && parseInt(sm[2]) > 1) return '分步';
        }
        return '不分步';
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

    // ===== 本地去重：同质检人同条码只上传一次（自动清理过期） =====
    const DEDUP_KEY = 'zhijian_a_uploaded';
    const DEDUP_CLEAN_KEY = 'zhijian_a_dedup_clean';

    function getTodayStr() {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    }

    function isDuplicate(barcode, inspector) {
        if (!barcode || !inspector) return false;
        const stored = GM_getValue(DEDUP_KEY, '');
        if (!stored) return false;
        const prefix = getTodayStr() + ':';
        return stored.indexOf(prefix + barcode + '|' + inspector) >= 0;
    }

    function markUploaded(barcode, inspector) {
        if (!barcode || !inspector) return;
        let stored = GM_getValue(DEDUP_KEY, '');
        const prefix = getTodayStr() + ':';
        const entry = prefix + barcode + '|' + inspector;
        if (stored) {
            if (stored.indexOf(entry) >= 0) return;
            stored += ',' + entry;
        } else {
            stored = entry;
        }
        GM_setValue(DEDUP_KEY, stored);
    }

    // 每天首次运行时清理过期数据（只保留今天和昨天的）
    function cleanOldDedup() {
        const lastClean = GM_getValue(DEDUP_CLEAN_KEY, '');
        const today = getTodayStr();
        if (lastClean === today) return;
        const stored = GM_getValue(DEDUP_KEY, '');
        if (!stored) { GM_setValue(DEDUP_CLEAN_KEY, today); return; }
        const entries = stored.split(',');
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yStr = yesterday.getFullYear() + '-' + String(yesterday.getMonth()+1).padStart(2,'0') + '-' + String(yesterday.getDate()).padStart(2,'0');
        const keep = entries.filter(e => e.startsWith(today + ':') || e.startsWith(yStr + ':'));
        GM_setValue(DEDUP_KEY, keep.join(','));
        GM_setValue(DEDUP_CLEAN_KEY, today);
    }
    cleanOldDedup();

    function getInspector(userName) {
        if (!userName) return '';
        const parts = userName.split('-');
        return parts.length >= 2 ? parts[1] : parts[0];
    }

    let barcodeTime = '';

    function captureBarcodeTime() {
        const input = document.querySelector('input[placeholder="请输入物品条码"]');
        if (!input) return;
        input.addEventListener('change', function() {
            if (input.value.trim()) {
                const now = new Date();
                const pad = n => String(n).padStart(2, '0');
                barcodeTime = now.getFullYear() + '-' + pad(now.getMonth()+1) + '-' + pad(now.getDate()) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
            }
        });
    }
    captureBarcodeTime();

    document.addEventListener('click', function(e) {
        const btn = e.target.closest('button');
        if (!btn) return;
        const btnText = btn.textContent.trim();
        if (btnText === '提交' || btnText === '提 交') {
            const data = {
                barcode: getBarcode(),
                userName: getUserInfo(),
                category: getCategory(),
                detectionLine: getDetectionLine(),
                step: getStepInfo(),
                submitTime: barcodeTime || getTimestamp()
            };
            if (data.barcode && data.userName) {
                // K线 + 物品30天内在库质检报告 + 保修机 → 跳过上传
                if (data.detectionLine === 'K线') {
                    const bodyText = document.body.textContent || '';
                    if (/物品30天内在库质检报告/.test(bodyText) && /保修机/.test(bodyText)) {
                        console.log('[质检] K线+保修机，跳过上传:', data.barcode);
                        return;
                    }
                }
                const inspector = getInspector(data.userName);
                if (isDuplicate(data.barcode, inspector)) {
                    console.log('[质检] 跳过重复:', data.barcode, inspector);
                    return;
                }
                uploadToCloud(data);
                markUploaded(data.barcode, inspector);
                console.log('[质检] 自动上传:', JSON.stringify(data));
            } else {
                console.warn('[质检] 条码或用户信息为空，跳过上传');
            }
        }
    });

    // ========== 自动检测更新（每6小时，刷新不重置计时） ==========
    const A_CK_KEY = 'zhijian_a_last_update_check';
    const A_CK_INTERVAL = 60 * 60 * 1000;
    const A_URL = 'https://cdn.jsdelivr.net/gh/1593125616-glitch/danghuan@main/zhijian-A.user.js';

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
            s.textContent = '#'+PANEL_ID+'{position:fixed;top:60px;right:10px;z-index:99998;background:#fff;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.15);font-size:12px;max-height:80vh;overflow-y:auto;user-select:none;}'+
            '#'+PANEL_ID+' .rh{padding:6px 10px;background:#007aff;color:#fff;border-radius:8px 8px 0 0;font-weight:bold;cursor:move;display:flex;justify-content:space-between;}'+
            '#'+PANEL_ID+' .rcb{font-size:11px;cursor:pointer;}'+
            '#'+PANEL_ID+' .rb{padding:4px 0;}'+
            '#'+PANEL_ID+' .rs{padding:2px 10px;font-weight:bold;color:#999;font-size:11px;border-bottom:1px solid #eee;}'+
            '#'+PANEL_ID+' .rhh{display:flex;padding:3px 10px;color:#666;font-size:11px;border-bottom:1px solid #eee;background:#f8f8f8;}'+
            '#'+PANEL_ID+' .rhh span{flex:1;text-align:left;}'+
            '#'+PANEL_ID+' .rhh .rhhc{min-width:36px;text-align:left;}'+
            '#'+PANEL_ID+' .rr{display:flex;align-items:center;padding:3px 10px;border-bottom:1px solid #f5f5f5;}'+
            '#'+PANEL_ID+' .rr.self{background:#e8f4fd;}'+
            '#'+PANEL_ID+' .rr:last-child{border-bottom:none;}'+
            '#'+PANEL_ID+' .rk{min-width:36px;font-weight:bold;text-align:left;}'+
            '#'+PANEL_ID+' .rc{flex:1;}'+
            '#'+PANEL_ID+' .rn{flex:1;text-align:left;font-size:11px;}'+
            '#'+PANEL_ID+'.fold .rb{display:none;}'+
            '#'+PANEL_ID+'.fold .rhh{display:none;}'+
            '#'+PANEL_ID+'.fold .rs{display:none;}'+
            '#'+PANEL_ID+'.fold .rr{display:none;}'+
            '#'+PANEL_ID+'.fold .rh_fold{display:block;}'+
            '#'+PANEL_ID+' .rh_fold{display:none;padding:3px 10px;border-bottom:1px solid #eee;}'+
            '#'+PANEL_ID+' .rh_top{color:#666;font-size:11px;}'+
            '#'+PANEL_ID+' .r_site{color:#999;font-size:10px;}';
            document.head.appendChild(s);
        }
        var el = document.getElementById(PANEL_ID);
        if (!el) { el = document.createElement('div'); el.id = PANEL_ID; document.body.appendChild(el); }

        var dragging = false, ox = 0, oy = 0;
        el.onmousedown = function(e) { if(e.target.closest('.rcb,.rh_fold,.rb'))return; dragging=true; ox=e.clientX-el.offsetLeft; oy=e.clientY-el.offsetTop; };
        document.onmousemove = function(e){ if(dragging){el.style.left=(e.clientX-ox)+'px';el.style.top=(e.clientY-oy)+'px';el.style.right='auto';}};
        document.onmouseup = function(){ dragging=false; };

        // 构建三列排名
        var allList = data.inspectors || [];
        // 按站点分组
        var sites = data.sites || {};

        // 深圳-龙岗单独
        var lgList = sites[mySite] || [];
        // 其他合并
        var otherList = [];
        for (var sk in sites) { if (sk !== mySite) otherList = otherList.concat(sites[sk]); }

        // 每列排序
        function byCount(a,b){ return b.count - a.count; }
        function byAvg(a,b){ return a.avgTime - b.avgTime; }
        function byInterval(a,b){ return b.totalInterval - a.totalInterval; }

        var countRank = lgList.slice().sort(byCount);
        var timeRank = lgList.slice().sort(byAvg);
        var intervalRank = lgList.slice().sort(byInterval);

        var otherCount = otherList.slice().sort(byCount);
        var otherTime = otherList.slice().sort(byAvg);
        var otherInterval = otherList.slice().sort(byInterval);

        // 找自己
        var self = null;
        for (var ti = 0; ti < countRank.length; ti++) {
            if (countRank[ti].inspector === myName) { self = countRank[ti]; break; }
        }
        if (!self) for (var oi = 0; oi < otherCount.length; oi++) {
            if (otherCount[oi].inspector === myName) { self = otherCount[oi]; break; }
        }

        var realTop = countRank[0] && countRank[0].inspector === myName ? countRank[1] : countRank[0];
        var foldTop = realTop || timeRank[0];

        var html = '<div class="rh" title="拖动移动"><span>质检排名(昨日)</span><span class="rcb">折叠</span></div>';
        html += '<div class="rh_fold">展开排名</div>';
        html += '<div class="rh_fold"><span class="rh_top">自己: </span>' + (self ? self.count+'单 '+fmtSec(self.avgTime)+'/台 '+fmtSec(self.totalInterval) : '无') + '</div>';
        html += '<div class="rh_fold"><span class="rh_top">第1: </span>' + (foldTop ? foldTop.inspector+' '+foldTop.count+'单 '+fmtSec(foldTop.avgTime)+'/台' : '无') + '</div>';
        html += '<div class="rb">';

        // 表头
        html += '<div class="rhh"><span class="rhhc"></span><span>质检量</span><span>质检时效</span><span>质检间隔</span></div>';

        function makeRow(rank, list1, sort1, list2, sort2, list3, sort3, isSelf) {
            var s1 = list1.slice().sort(sort1), s2 = list2.slice().sort(sort2), s3 = list3.slice().sort(sort3);
            var cls = isSelf ? ' self' : '';
            var rk = isSelf ? '自己' : rank;
            var v1 = s1[rank-1] ? s1[rank-1].inspector + '<span class="r_site">' + s1[rank-1].count + '</span>' : '-';
            var v2 = s2[rank-1] ? s2[rank-1].inspector + '<span class="r_site">' + fmtSec(s2[rank-1].avgTime) + '/台</span>' : '-';
            var v3 = s3[rank-1] ? s3[rank-1].inspector + '<span class="r_site">' + fmtSec(s3[rank-1].totalInterval) + '</span>' : '-';
            return '<div class="rr' + cls + '"><span class="rk">' + rk + '</span><span class="rn">' + v1 + '</span><span class="rn">' + v2 + '</span><span class="rn">' + v3 + '</span></div>';
        }

        // 自己行
        if (self) {
            html += '<div class="rr self"><span class="rk">自己</span><span class="rn">' + self.inspector + '<span class="r_site">' + self.count + '</span></span><span class="rn">' + self.inspector + '<span class="r_site">' + fmtSec(self.avgTime) + '/台</span></span><span class="rn">' + self.inspector + '<span class="r_site">' + fmtSec(self.totalInterval) + '</span></span></div>';
        }

        // 龙岗站排名（5人）
        html += '<div class="rs">' + mySite + '</div>';
        for (var i = 0; i < 5; i++) {
            var sc = countRank[i], st = timeRank[i], si = intervalRank[i];
            if (!sc && !st && !si) break;
            html += '<div class="rr"><span class="rk">' + (i+1) + '</span><span class="rn">' + (sc ? sc.inspector+'<span class="r_site">'+sc.count+'</span>' : '-') + '</span><span class="rn">' + (st ? st.inspector+'<span class="r_site">'+fmtSec(st.avgTime)+'/台</span>' : '-') + '</span><span class="rn">' + (si ? si.inspector+'<span class="r_site">'+fmtSec(si.totalInterval)+'</span>' : '-') + '</span></div>';
        }

        // 其他站点（沙井3+成都2+合肥2+石家庄2）
        html += '<div class="rs">其他站点</div>';
        for (var j = 0; j < 9; j++) {
            var oc = otherCount[j], ot = otherTime[j], oi = otherInterval[j];
            if (!oc && !ot && !oi) break;
            html += '<div class="rr"><span class="rk">' + (j+1) + '</span><span class="rn">' + (oc ? oc.inspector+'<span class="r_site">'+oc.count+'</span>' : '-') + '</span><span class="rn">' + (ot ? ot.inspector+'<span class="r_site">'+fmtSec(ot.avgTime)+'/台</span>' : '-') + '</span><span class="rn">' + (oi ? oi.inspector+'<span class="r_site">'+fmtSec(oi.totalInterval)+'</span>' : '-') + '</span></div>';
        }

        html += '</div>';
        el.innerHTML = html;
        // 记忆折叠状态
        if (GM_getValue('qc_rank_fold', false)) el.classList.add('fold');
        // 绑定折叠/展开事件（内联onclick在沙箱中无法访问GM函数）
        setTimeout(function() {
            var fcb = el.querySelector('.rcb');
            if (fcb) fcb.onclick = function() { el.classList.toggle('fold'); GM_setValue('qc_rank_fold', el.classList.contains('fold')); };
            var fed = el.querySelector('.rh_fold');
            if (fed) fed.onclick = function() { el.classList.remove('fold'); GM_setValue('qc_rank_fold', false); };
        }, 50);
    }

    function fetchRank() {
        GM_xmlhttpRequest({
            method: 'GET',
            url: CLOUD_FN_URL + '/rank',
            onload: function(resp) {
                try {
                    var r = JSON.parse(resp.responseText);
                    if (r.code === 0 && r.data) {
                        var myName = (document.cookie.match(/(?:^|;\s*)p_name=([^;]*)/) || [])[1] || '';
                        var parts = myName.split('-');
                        var myInspector = parts.length >= 2 ? parts[1] : '';
                        var mySite = parts.length >= 4 ? (parts[2] + '-' + parts[3]) : '';
                        showRankPanel(r.data, myInspector, mySite || '深圳-龙岗');
                    }
                } catch(e) {}
            }
        });
    }
    setTimeout(fetchRank, 4000);
    setInterval(fetchRank, 300000);

    function checkUpdate() {
        if (!shouldCheck(A_CK_KEY) || typeof GM_xmlhttpRequest === 'undefined') return;
        GM_xmlhttpRequest({
            method: 'GET', url: A_URL,
            onload: (resp) => {
                const m = resp.responseText.match(/@version\s+(\S+)/);
                if (!m) return;
                if (isNewerVer(m[1], GM_info.script.version)) {
                    console.warn(`[质检A] 发现新版本 ${m[1]}（当前 ${GM_info.script.version}）`);
                    if (confirm(`质检A脚本发现新版本 ${m[1]}（当前 ${GM_info.script.version}），是否前往更新？`)) {
                        window.location.href = A_URL;
                    }
                } else {
                    markDone(A_CK_KEY);
                }
            }
        });
    }
    checkUpdate();
    setInterval(checkUpdate, A_CK_INTERVAL);
})();
