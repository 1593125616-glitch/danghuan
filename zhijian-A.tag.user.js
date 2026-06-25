// ==UserScript==
// @name         质检中心-提交后自动上传
// @namespace    http://tampermonkey.net/
// @version      2.11
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

    let barcodeTime = '';
    let lastBarcode = '';

    function recordBarcodeTime(){
        var now = new Date();
        var pad = function(n){return String(n).padStart(2,'0');};
        barcodeTime = now.getFullYear()+'-'+pad(now.getMonth()+1)+'-'+pad(now.getDate())+' '+pad(now.getHours())+':'+pad(now.getMinutes())+':'+pad(now.getSeconds());
        console.log('[质检] 扫码时间:', barcodeTime);
    }

    // 轮询检测条码变化(VUE v-model不触发DOM事件)
    function watchBarcodeInput(){
        var inp = document.querySelector('input[placeholder="请输入物品条码"]');
        if(!inp){setTimeout(watchBarcodeInput,500);return;}
        setInterval(function(){
            var v = inp.value.trim();
            if(v && v !== lastBarcode){ lastBarcode = v; recordBarcodeTime(); }
        }, 500);
    }
    watchBarcodeInput();

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
            console.log('[质检] 提交数据:', JSON.stringify(data));
            console.log('[质检] barcodeTime:', barcodeTime, 'fallback:', !barcodeTime);
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
                uploadToCloud(data);
                console.log('[质检] 自动上传:', JSON.stringify(data));
                lastBarcode = ''; barcodeTime = '';
            } else {
                console.warn('[质检] 条码或用户信息为空，跳过上传');
            }
        }
    });

    // ========== 自动检测更新（每6小时，刷新不重置计时） ==========
    const A_CK_KEY = 'zhijian_a_last_update_check';
    const A_CK_INTERVAL = 60 * 60 * 1000;
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
            s.textContent = '#'+PANEL_ID+'{position:fixed;top:60px;right:10px;z-index:99998;background:#fff;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.15);font-size:12px;user-select:none;min-width:200px;}'+
            '#'+PANEL_ID+' .rh{padding:6px 10px;background:#007aff;color:#fff;border-radius:8px 8px 0 0;font-weight:bold;cursor:move;display:flex;justify-content:space-between;}'+
            '#'+PANEL_ID+' .rcb{font-size:11px;cursor:pointer;}'+
            '#'+PANEL_ID+' .rb{padding:4px 0;}'+
            '#'+PANEL_ID+' .rs{padding:2px 10px;font-weight:bold;color:#999;font-size:11px;border-bottom:1px solid #eee;}'+
            '#'+PANEL_ID+' .rr{display:flex;align-items:center;padding:3px 10px;border-bottom:1px solid #f5f5f5;}'+
            '#'+PANEL_ID+' .rk{min-width:30px;font-weight:bold;text-align:left;}'+
            '#'+PANEL_ID+' .rn{flex:1;text-align:left;font-size:12px;}'+
            '#'+PANEL_ID+'.fold .rb{display:none;}'+
            '#'+PANEL_ID+'.fold .rs{display:none;}'+
            '#'+PANEL_ID+'.fold .rr{display:none;}'+
            '#'+PANEL_ID+'.fold .rh_fold{display:block;}'+
            '#'+PANEL_ID+' .rh_fold{display:none;padding:3px 10px;border-bottom:1px solid #eee;}'+
            '#'+PANEL_ID+' .rh_top{color:#666;font-size:11px;}';
            document.head.appendChild(s);
        }
        var el = document.getElementById(PANEL_ID);
        if (!el) { el = document.createElement('div'); el.id = PANEL_ID; document.body.appendChild(el); }

        var dragging = false, ox = 0, oy = 0;
        el.onmousedown = function(e) { if(e.target.closest('.rcb,.rh_fold,.rb'))return; dragging=true; ox=e.clientX-el.offsetLeft; oy=e.clientY-el.offsetTop; };
        document.onmousemove = function(e){ if(dragging){el.style.left=(e.clientX-ox)+'px';el.style.top=(e.clientY-oy)+'px';el.style.right='auto';}};
        document.onmouseup = function(){ dragging=false; };

        var allList = data.inspectors || [];
        var sites = data.sites || {};
        var lgList = sites[mySite] || [];

        function byCount(a,b){ return b.count - a.count; }
        var countRank = lgList.slice().sort(byCount);

        var self = null;
        for (var ti = 0; ti < countRank.length; ti++) { if (countRank[ti].inspector === myName) { self = countRank[ti]; break; } }

        var html = '<div class="rh" title="拖动移动"><span>今日质检数量</span><span class="rcb">折叠</span></div>';
        html += '<div class="rh_fold">展开排名</div>';
        html += '<div class="rb">';
        html += '<div class="rs">昨日排名</div>';
        for (var i = 0; i < countRank.length; i++) {
            var cr = countRank[i];
            html += '<div class="rr"><span class="rk">' + (i+1) + '</span><span class="rn">' + cr.inspector + ' ' + cr.count + '</span></div>';
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
        // 只对潘瑶显示
        var myName = (document.cookie.match(/(?:^|;\s*)p_name=([^;]*)/) || [])[1] || '';
        if (!/潘瑶|pan.*yao/i.test(myName)) return;
        GM_xmlhttpRequest({
            method: 'GET',
            url: CLOUD_FN_URL + '/rank',
            onload: function(resp) {
                try {
                    var r = JSON.parse(resp.responseText);
                    if (r.code === 0 && r.data) {
                        var parts = myName.split('-');
                        var myInspector = parts.length >= 2 ? parts[1] : '';
                        var mySite = parts.length >= 4 ? (parts[2] + '-' + parts[3]) : '深圳-龙岗';
                        showRankPanel(r.data, myInspector, mySite);
                    }
                } catch(e) {}
            }
        });
    }
    // 整点更新(8-23点)
    function scheduleNextFetch(){
        var now=new Date();
        var h=now.getHours();
        if(h<8||h>=23)return;
        var next=new Date(now);
        next.setHours(h+1,0,0,0);
        var delay=next-now;
        setTimeout(function(){fetchRank(); scheduleNextFetch();},delay);
    }
    setTimeout(function(){fetchRank(); scheduleNextFetch();}, 4000);

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
