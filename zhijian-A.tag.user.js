// ==UserScript==
// @name         质检中心-提交后自动上传
// @namespace    http://tampermonkey.net/
// @version      1.7
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

    function getTimestamp() {
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        return `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
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

    document.addEventListener('click', function(e) {
        const btn = e.target.closest('button');
        if (!btn) return;
        const btnText = btn.textContent.trim();
        if (btnText === '提交' || btnText === '提 交') {
            const data = {
                barcode: getBarcode(),
                userName: getUserInfo(),
                category: getCategory(),
                submitTime: getTimestamp()
            };
            if (data.barcode && data.userName) {
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
