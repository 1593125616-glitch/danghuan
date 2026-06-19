// ==UserScript==
// @name         质检中心-提交后自动上传
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  点击提交后自动上传物品条码+账号+时间到腾讯云
// @author       Kun
// @match        https://yihuan.oppoer.me/*
// @match        http://yihuan.oppoer.me/static/*
// @grant        GM_xmlhttpRequest
// @connect      zhijian-d7gqnvecce55e0e0e-1445087380.ap-shanghai.app.tcloudbase.com
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
        const items = document.querySelectorAll('.el-form-item');
        for (const item of items) {
            const label = item.querySelector('.el-form-item__label');
            if (label && label.textContent.trim() === '品类') {
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
                uploadToCloud(data);
                console.log('[质检] 自动上传:', JSON.stringify(data));
            } else {
                console.warn('[质检] 条码或用户信息为空，跳过上传');
            }
        }
    });
})();
