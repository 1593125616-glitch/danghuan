// ==UserScript==
// @name         复检脚本
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  质检流水详情页自动复制问题项+答案项,质检页点击同步开关自动勾选
// @author       Kun
// @match        https://yihuan.oppoer.me/*
// @match        http://yihuan.oppoer.me/static/*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    var STORE_KEY = 'fj_pairs';
    var SKIP_KEYS = ['品牌', '机型', 'IMEI'];

    function isDetailPage() {
        var bc = document.querySelectorAll('.el-breadcrumb__inner');
        for (var i = 0; i < bc.length; i++) {
            if (bc[i].textContent.trim() === '质检流水详情') return true;
        }
        return false;
    }

    // ===== 质检流水详情页: 自动读取存储 =====
    if (isDetailPage()) {
        setTimeout(function() {
            var pairs = {};
            var rows = document.querySelectorAll('.el-table__body-wrapper tbody tr');
            for (var i = 0; i < rows.length; i++) {
                var cells = rows[i].querySelectorAll('td .cell');
                if (cells.length >= 2) {
                    var key = cells[0].textContent.trim();
                    var val = cells[1].textContent.trim();
                    if (key && val) pairs[key] = val;
                }
            }
            if (Object.keys(pairs).length) {
                GM_setValue(STORE_KEY, JSON.stringify(pairs));
                console.log('[复检] 已复制 ' + Object.keys(pairs).length + ' 项');
            }
        }, 2000);
        return;
    }

    // ===== 质检页: 同步按钮 =====
    function getStoredPairs() {
        try { return JSON.parse(GM_getValue(STORE_KEY, '{}')); } catch(e) { return {}; }
    }

    function findLabelAndClick(labelName, targetText) {
        var allRadios = document.querySelectorAll('.el-radio-button__inner');
        for (var i = 0; i < allRadios.length; i++) {
            if (allRadios[i].textContent.trim() === targetText) {
                allRadios[i].click();
                allRadios[i].dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));
                console.log('[复检] 勾选:', targetText);
                return true;
            }
        }
        var inputs = document.querySelectorAll('.el-input__inner');
        for (var j = 0; j < inputs.length; j++) {
            if (inputs[j].value !== targetText) {
                inputs[j].value = targetText;
                inputs[j].dispatchEvent(new Event('input', {bubbles: true}));
                inputs[j].dispatchEvent(new Event('change', {bubbles: true}));
                return true;
            }
        }
        return false;
    }

    function doSync() {
        // 调试: 打印表单标签
        var labels = document.querySelectorAll('.el-form-item__label');
        var labelTexts = [];
        for (var i = 0; i < labels.length; i++) labelTexts.push(labels[i].textContent.trim());
        console.log('[复检] 表单标签:', JSON.stringify(labelTexts));

        var pairs = getStoredPairs();
        var done = 0, fail = 0, skipped = 0;
        var keys = Object.keys(pairs);
        for (var i = 0; i < keys.length; i++) {
            if (SKIP_KEYS.indexOf(keys[i]) >= 0) { skipped++; continue; }
            if (findLabelAndClick(keys[i], pairs[keys[i]])) done++;
            else { console.log('[复检] 未匹配:', keys[i], '→', pairs[keys[i]]); fail++; }
        }
        console.log('[复检] 同步: ' + done + '/' + (keys.length - skipped) + (fail ? ' 未匹配:' + fail : '') + (skipped ? ' 跳过:' + skipped : ''));
    }

    if (!isDetailPage() && !document.querySelector('#btn_fj_sync')) {
        var btn = document.createElement('button');
        btn.id = 'btn_fj_sync';
        btn.textContent = '复检同步';
        btn.style.cssText = 'position:fixed; top:7cm; right:10px; z-index:999997; height:1.3cm; min-width:2.5cm; padding:0 0.5cm; background:#007aff; color:#fff; border:none; border-radius:0.3cm; cursor:pointer; font-size:0.3cm; line-height:1.3cm; box-shadow:0 2px 6px rgba(0,0,0,0.2);';
        btn.onclick = doSync;
        document.body.appendChild(btn);
    }
    console.log('[复检] 脚本已加载');
})();
