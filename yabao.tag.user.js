// ==UserScript==
// @name         啞寶查詢自動生成報告 (延遲調整)
// @namespace    https://www.ybcheck.com/
// @version      0.66
// @description  優化複製按鈕點擊延遲為500ms；OPPO格式化；VIVO自動提取複製
// @author       py1998
// @match        https://www.ybcheck.com/*
// @match        https://www.57306.com/*
// @match        https://support.oppo.com/*
// @match        https://support.vivo.com.cn/*
// @grant        GM_setClipboard
// @downloadURL  https://cdn.jsdelivr.net/gh/1593125616-glitch/danghuan/yabao.tag.user.js
// @updateURL    https://cdn.jsdelivr.net/gh/1593125616-glitch/danghuan/yabao.tag.user.js
// ==/UserScript==

(function() {
    'use strict';

    // ==================== 凌晨3点强刷 ====================
    const REFRESH_HOUR = 3;
    const STORAGE_KEY = 'qc_auto_refresh_date';
    function getTodayStr() {
        const now = new Date();
        return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    }
    function shouldRefreshNow() {
        const now = new Date();
        const hours = now.getHours();
        const today = getTodayStr();
        if (hours < REFRESH_HOUR) return false;
        if (localStorage.getItem(STORAGE_KEY) === today) return false;
        return true;
    }
    function executeRefresh() {
        if (!shouldRefreshNow()) return;
        const now = new Date();
        const today = getTodayStr();
        localStorage.setItem(STORAGE_KEY, today);
        console.log(`[啞寶腳本] 凌晨${now.getHours()}:${now.getMinutes()} 触发强刷`);
        location.reload(true);
    }
    const refreshInterval = setInterval(executeRefresh, 60 * 1000);
    window.addEventListener('unload', () => clearInterval(refreshInterval));
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') executeRefresh();
    });
    executeRefresh();

    // ==================== 通用工具 ====================
    const DEBUG = true;
    function log(...args) { if (DEBUG) console.log('[啞寶腳本]', ...args); }

    function showToast(msg) {
        const div = document.createElement('div');
        div.textContent = msg;
        div.style.cssText = 'position:fixed; top:3cm; left:50%; transform:translateX(-50%); z-index:888888; background:#333; color:#fff; padding:10px 20px; border-radius:6px; font-size:16px; box-shadow:0 2px 8px rgba(0,0,0,0.3); opacity:0; transition:opacity 0.3s;';
        document.body.appendChild(div);
        requestAnimationFrame(() => div.style.opacity = '1');
        setTimeout(() => {
            div.style.opacity = '0';
            setTimeout(() => div.remove(), 300);
        }, 2000);
    }

    function isVisible(el) {
        if (!el || !el.isConnected) return false;
        if (el.offsetParent !== null) return true;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    function copyToClipboard(text) {
        if (!text) return false;
        // GM_setClipboard 不依赖页面焦点，最可靠
        if (typeof GM_setClipboard !== 'undefined') {
            try {
                GM_setClipboard(text);
                log('✅ GM_setClipboard 成功');
                return true;
            } catch (e) {
                log('GM_setClipboard 失败:', e.message);
            }
        }
        // 备选：页面有焦点时可用
        window.focus();
        navigator.clipboard.writeText(text).catch(() => {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        });
        log('✅ navigator.clipboard 備選複製');
        return true;
    }

    function findButtonByText(textList, container = document.body) {
        if (!Array.isArray(textList)) textList = [textList];
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT, {
            acceptNode: node => {
                const tag = node.tagName.toLowerCase();
                if (['div', 'button', 'a', 'span', 'img', 'input'].includes(tag)) {
                    const txt = node.textContent || '';
                    for (let t of textList) if (txt.includes(t)) return NodeFilter.FILTER_ACCEPT;
                }
                return NodeFilter.FILTER_SKIP;
            }
        });
        return walker.nextNode();
    }

    function findAllButtonsByText(textList, container = document.body) {
        if (!Array.isArray(textList)) textList = [textList];
        const results = [];
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT, {
            acceptNode: node => {
                const tag = node.tagName.toLowerCase();
                if (['div', 'button', 'a', 'span', 'img', 'input'].includes(tag)) {
                    const txt = node.textContent || '';
                    for (let t of textList) if (txt.includes(t)) return NodeFilter.FILTER_ACCEPT;
                }
                return NodeFilter.FILTER_SKIP;
            }
        });
        let node;
        while (node = walker.nextNode()) results.push(node);
        return results;
    }

    function findVisibleButtonByText(textList, container = document.body) {
        const all = findAllButtonsByText(textList, container);
        for (const el of all) {
            if (isVisible(el) && el.closest('.confirm-ft, .confirm-bd')) return el;
        }
        for (const el of all) {
            if (el.closest('.confirm-ft, .confirm-bd')) return el;
        }
        for (const el of all) {
            if (isVisible(el)) return el;
        }
        return all[0] || null;
    }

    function findCopyLink() {
        const links = document.querySelectorAll('a.confirm-btn.primary');
        for (let link of links) {
            const text = link.textContent.trim();
            if (text.includes('点此复制报告文字并关闭对话框') || text.includes('點此復制報告文字並關閉對話框')) {
                return link;
            }
        }
        return null;
    }

    function isInModal(el) {
        if (!el) return false;
        if (el.closest('.confirm-ft, .confirm-bd')) return true;
        let p = el.parentElement;
        while (p) {
            if (p.getAttribute('role') === 'dialog' || p.getAttribute('aria-modal') === 'true') return true;
            p = p.parentElement;
        }
        return false;
    }

    function simpleClick(el) {
        if (!el) return;
        const onclick = el.getAttribute('onclick');
        if (onclick && onclick !== 'javascript:;' && onclick !== 'javascript:void(0);') {
            try {
                new Function('event', onclick).call(el, null);
                log('已執行 onclick');
                return;
            } catch (e) { log('onclick 執行失敗:', e.message); }
        }
        el.click();
        log('已原生點擊');
    }

    function isModalContentReady() {
        const saveBox = document.querySelector('.confirm-bd .saveBox');
        if (!saveBox) return false;
        const text = saveBox.innerText.trim();
        return text.length > 100 && text.includes('查询时间');
    }

    const host = location.hostname;

    // ==================== ybcheck.com ====================
    if (host.includes('ybcheck.com') || host.includes('57306.com')) {
        (function() {
            const MAX_WAIT = 180000;
            const COPY_BTN_DELAY = 1500;   // 延迟后开始检查复制
            const MAX_COPY_WAIT = 15000;
            const GEN_CHECK_INTERVAL = 500;
            const MAX_GEN_ATTEMPTS = Math.ceil(MAX_WAIT / GEN_CHECK_INTERVAL);

            let state = {
                processing: false,
                querySerial: 0,
                currentIMEI: '',
                timers: [],
                observers: []
            };

            function clearAll() {
                state.timers.forEach(clearInterval);
                state.timers = [];
                state.observers.forEach(obs => obs.disconnect());
                state.observers = [];
                state.processing = false;
                state.currentIMEI = '';
            }

            function addTimer(id) { state.timers.push(id); }
            function addObserver(obs) { state.observers.push(obs); }

            function getResultAreaText() {
                const resultArea = document.getElementById('result') || document.getElementById('J_List');
                return resultArea ? resultArea.innerText : '';
            }

            function resultContainsIMEI() {
                if (!state.currentIMEI) return false;
                const text = getResultAreaText();
                return text.includes(state.currentIMEI);
            }

            function handleCopyButton(serial) {
                if (state.querySerial !== serial) return;
                if (!isModalContentReady()) {
                    log('彈窗內容尚未渲染完成，等待中...');
                    return;
                }
                // 自行复制内容到剪贴板（GM_setClipboard 不依赖焦点）
                const saveBox = document.querySelector('.confirm-bd .saveBox');
                if (saveBox) {
                    copyToClipboard(saveBox.innerText.trim());
                }
                // 点击按钮关闭弹窗
                const copyBtn = findCopyLink();
                if (copyBtn) {
                    log('點擊複製按鈕關閉彈窗');
                    simpleClick(copyBtn);
                }
                log('流程結束');
                clearAll();
            }

            function startWatchingForCopy(serial) {
                log('開始監聽複製按鈕...');
                setTimeout(() => {
                    if (state.querySerial !== serial) return;

                    handleCopyButton(serial);
                    if (!state.processing) return; // clearAll 已被调用，不再注册新定时器

                    const observer = new MutationObserver(() => {
                        if (state.querySerial === serial) handleCopyButton(serial);
                    });
                    observer.observe(document.body, { childList: true, subtree: true });
                    addObserver(observer);

                    const interval = setInterval(() => {
                        if (state.querySerial !== serial) { clearInterval(interval); return; }
                        handleCopyButton(serial);
                    }, 500);
                    addTimer(interval);

                    const timeout = setTimeout(() => {
                        log('等待複製按鈕超時');
                        clearAll();
                    }, MAX_COPY_WAIT);
                    addTimer(timeout);
                }, COPY_BTN_DELAY);
            }

            function afterGenClick(serial, modalAlready) {
                if (state.querySerial !== serial) return;
                if (modalAlready) {
                    startWatchingForCopy(serial);
                    return;
                }
                const observer = new MutationObserver(() => {
                    const modal = document.querySelector('.confirm-ft');
                    if (modal && isVisible(modal)) {
                        observer.disconnect();
                        startWatchingForCopy(serial);
                    }
                });
                observer.observe(document.body, { childList: true, subtree: true });
                addObserver(observer);

                const interval = setInterval(() => {
                    const modal = document.querySelector('.confirm-ft');
                    if (modal && isVisible(modal)) {
                        clearInterval(interval);
                        observer.disconnect();
                        startWatchingForCopy(serial);
                    }
                }, 300);
                addTimer(interval);

                const timeout = setTimeout(() => {
                    log('等待彈窗超時');
                    clearAll();
                }, 30000);
                addTimer(timeout);
            }

            function tryClickGen(serial) {
                if (state.querySerial !== serial) return false;
                const genBtn = document.getElementById('initText') || findVisibleButtonByText('生成文字');
                if (!genBtn || !isVisible(genBtn)) return false;

                const inModal = isInModal(genBtn);
                if (!inModal && !resultContainsIMEI()) {
                    log('結果尚未包含當前IMEI，跳過點擊（右側模式）');
                    return false;
                }

                log('✅ 準備點擊生成文字按鈕 (模式: ' + (inModal ? '彈窗' : '右側') + ')');
                if (!inModal) {
                    log('按鈕在頁面中，滾動至可見');
                    genBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    setTimeout(() => {
                        if (state.querySerial !== serial) return;
                        simpleClick(genBtn);
                        afterGenClick(serial, false);
                    }, 500);
                } else {
                    log('按鈕在彈窗內，直接點擊');
                    setTimeout(() => {
                        if (state.querySerial !== serial) return;
                        simpleClick(genBtn);
                        afterGenClick(serial, true);
                    }, 500);
                }
                return true;
            }

            function waitForResult(serial) {
                const resultArea = document.getElementById('result') || document.getElementById('J_List') || document.body;
                const observer = new MutationObserver(() => {
                    if (tryClickGen(serial)) observer.disconnect();
                });
                observer.observe(resultArea, { childList: true, subtree: true });
                addObserver(observer);

                let attempts = 0;
                const interval = setInterval(() => {
                    if (state.querySerial !== serial) { clearInterval(interval); return; }
                    if (tryClickGen(serial)) clearInterval(interval);
                    else if (++attempts > MAX_GEN_ATTEMPTS) {
                        clearInterval(interval);
                        log(`未能在 ${MAX_WAIT/1000} 秒內找到生成文字按鈕`);
                        clearAll();
                    }
                }, GEN_CHECK_INTERVAL);
                addTimer(interval);

                const timeout = setTimeout(() => {
                    log('結果加載超時');
                    clearAll();
                }, MAX_WAIT);
                addTimer(timeout);
            }

            function onQueryClick() {
                try {
                    clearAll();
                    state.processing = true;
                    state.querySerial++;

                    const input = document.getElementById('search');
                    state.currentIMEI = input ? input.value.trim() : '';
                    const serial = state.querySerial;
                    log(`查詢按鈕點擊，序號 ${serial}，IMEI: ${state.currentIMEI}`);

                    let midAttempts = 0;
                    const midInterval = setInterval(() => {
                        const confirmTexts = ['确定', '確定', '是', '查询', '提交', 'OK'];
                        for (let t of confirmTexts) {
                            const btn = findButtonByText(t);
                            if (btn) { simpleClick(btn); break; }
                        }
                        if (++midAttempts > 20) clearInterval(midInterval);
                    }, 300);
                    addTimer(midInterval);

                    waitForResult(serial);
                } catch (e) {
                    log('onQueryClick 异常:', e.message);
                    clearAll();
                }
            }

            function bindSearchButton() {
                const btn = document.getElementById('btn-search');
                if (btn) {
                    btn.addEventListener('click', onQueryClick);
                    log('查詢按鈕綁定成功');
                    return true;
                }
                return false;
            }

            function init() {
                if (!bindSearchButton()) {
                    const searchBtnObserver = new MutationObserver(() => { if (bindSearchButton()) searchBtnObserver.disconnect(); });
                    searchBtnObserver.observe(document.body, { childList: true, subtree: true });
                    log('等待查詢按鈕出現...');
                }
            }

            if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
            else init();
        })();
    }

    // ==================== OPPO 格式化複製 ====================
    else if (host.includes('support.oppo.com')) {
        (function() {
            log('OPPO 格式化提取已啟動');
            let lastCopied = '';

            function copyText(text) {
                if (!text) return;
                copyToClipboard(text);
                showToast('复制成功');
            }

            function findResultCard() {
                const allElements = document.querySelectorAll('*');
                let queryTitle = null;
                for (const el of allElements) {
                    if (el.textContent.trim() === '查询结果' && el.children.length === 0) {
                        queryTitle = el;
                        break;
                    }
                }
                if (!queryTitle) return null;
                let container = queryTitle.parentElement;
                while (container) {
                    const text = container.innerText;
                    if (text.length > 100) return container;
                    container = container.parentElement;
                }
                return null;
            }

            function extractCleanResult(container) {
                if (!container) return '';
                const fullText = container.innerText;
                const startIdx = fullText.indexOf('查询结果');
                const endIdx = fullText.indexOf('温馨提示');
                if (startIdx === -1) return '';
                let result = (endIdx !== -1 && endIdx > startIdx) ?
                    fullText.substring(startIdx, endIdx).trim() : fullText.substring(startIdx).trim();
                const lines = result.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                const filterWords = ['颜色仅供参考', '重新查询', '温馨提示'];
                const cleanLines = lines.filter(l => !filterWords.some(w => l.includes(w)));
                const mergeLabels = ['IMEI/SN', '颜色', '激活时间'];
                const merged = [];
                for (let i = 0; i < cleanLines.length; i++) {
                    let cur = cleanLines[i];
                    let label = cur.replace(/[：:]\s*$/, '');
                    if (mergeLabels.includes(label) && i + 1 < cleanLines.length) {
                        const next = cleanLines[i + 1];
                        if (!['查询结果', ...mergeLabels].includes(next) && !next.startsWith('(')) {
                            merged.push(`${label}:${next}`);
                            i++;
                            continue;
                        }
                    }
                    merged.push(cur);
                }
                const finalLines = [];
                for (let i = 0; i < merged.length; i++) {
                    const line = merged[i];
                    if (line === '查询结果') { finalLines.push(line); continue; }
                    const clean = line.replace(/[：:]\s*$/, '');
                    if (!line.includes(':') && i + 1 < merged.length && merged[i + 1].startsWith('(')) {
                        finalLines.push('型号:' + clean);
                        finalLines.push('容量:' + merged[i + 1].replace(/^\(|\)$/g, ''));
                        i++;
                        continue;
                    }
                    finalLines.push(line);
                }
                return finalLines.join('\n');
            }

            function tryExtractAndCopy() {
                const card = findResultCard();
                if (!card) return false;
                const resultText = extractCleanResult(card);
                if (resultText && resultText !== lastCopied) {
                    lastCopied = resultText;
                    copyText(resultText);
                    log('已複製 OPPO 結果');
                    return true;
                }
                return false;
            }

            document.addEventListener('click', function(e) {
                const target = e.target.closest('button, a, span, div');
                if (target && target.textContent.includes('查询')) {
                    log('重置複製狀態');
                    lastCopied = '';
                }
            }, true);

            let attempts = 0;
            const interval = setInterval(() => {
                if (tryExtractAndCopy() || ++attempts >= 30) clearInterval(interval);
            }, 1000);
            const observer = new MutationObserver(tryExtractAndCopy);
            observer.observe(document.body, { childList: true, subtree: true });
            window.addEventListener('unload', () => observer.disconnect());
        })();
    }

    // ==================== VIVO 格式化提取複製 ====================
    else if (host.includes('support.vivo.com.cn')) {
        (function() {
            log('VIVO 格式化提取已啟動');
            let lastCopied = '';
            let queried = false;

            function copyText(text) {
                if (!text) return;
                copyToClipboard(text);
                showToast('复制成功');
            }

            /**
             * 查找结果卡片容器
             * 寻找包含「激活日期」文字的元素，往上找到内容容器
             */
            function findResultCard() {
                let queryTitle = null;
                const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
                let node;
                while (node = walker.nextNode()) {
                    if (node.textContent.trim().includes('激活日期')) {
                        queryTitle = node.parentElement;
                        break;
                    }
                }
                if (!queryTitle) return null;
                let container = queryTitle.parentElement;
                while (container) {
                    const text = container.innerText;
                    if (text.length > 100) return container;
                    container = container.parentElement;
                }
                return null;
            }

            /**
             * 从「您的机型：Y300 12G+512G」中分离机型与容量
             * 容量格式为 xxG+xxxG（如 12G+512G）或 xxG+xxxGB
             */
            function parseModelCapacity(text) {
                // 匹配末尾容量格式：8GB+256GB, 8G+256G, 16G+1T, 12GB+256GB 等
                const capMatch = text.match(/\s+(\d+[GT]B?)\+(\d+[GT]B?)\s*$/);
                if (capMatch) {
                    const model = text.substring(0, capMatch.index).trim();
                    return { model, capacity: capMatch[1] + '+' + capMatch[2] };
                }
                // 兼容纯 GB/G/TB/T 结尾（如 256GB, 256G, 1T, 512GB）
                const capMatch2 = text.match(/\s+(\d+[GT]B?)\s*$/);
                if (capMatch2) {
                    const model = text.substring(0, capMatch2.index).trim();
                    return { model, capacity: capMatch2[1] };
                }
                return { model: text, capacity: '' };
            }

            /**
             * 提取并格式化查询结果
             * 原始格式：
             *   查询结果
             *   产品信息
             *   机型图片仅供参考
             *   您的机型：Y300 12G+512G
             *   机型颜色：青松
             *   IMEI码：861114076902532
             *   SN码：10AG5D2A61009DK
             *   激活日期：
             *   2024年12月27日
             *   保修期至：
             *   2025年12月27日
             *
             * 目标格式：
             *   机型：Y300
             *   容量：12G+512G
             *   颜色：青松
             *   IMEI码：861114076902532
             *   SN码：10AG5D2A61009DK
             *   激活日期：2024年12月27日
             *   保修期至：2025年12月27日
             */
            function extractCleanResult(container) {
                if (!container) return '';
                const fullText = container.innerText;

                // 定位起始位置，依次尝试多个标记
                const startMarkers = ['查询结果', '产品信息', '机型图片仅供参考', '您的机型'];
                let startIdx = -1;
                for (const marker of startMarkers) {
                    startIdx = fullText.indexOf(marker);
                    if (startIdx !== -1) break;
                }
                if (startIdx === -1) return '';

                // 定位结束位置（排除底部无关文字）
                const endKeywords = [
                    '温馨提示', '以上信息仅供参考', '本查询结果仅供参考',
                    '消费者可凭有效发票', '保障服务状态', '＊查询提示',
                    '了解产品', '在线购买', '服务支持', '关于vivo',
                    '在线客服', 'Select Location', '©',
                    '工信部', '真伪查询'
                ];
                let endIdx = fullText.length;
                for (const kw of endKeywords) {
                    const idx = fullText.indexOf(kw, startIdx);
                    if (idx !== -1 && idx < endIdx) endIdx = idx;
                }

                let result = fullText.substring(startIdx, endIdx).trim();
                const lines = result.split('\n').map(l => l.trim()).filter(l => l.length > 0);

                // 跳过无关行
                const skipWords = ['查询结果', '产品信息', '外围图片市场参考', '外围图片，仅供参考'];
                const cleanLines = lines.filter(l => !skipWords.some(w => l.includes(w)));

                // 逐行处理转换
                const output = [];
                for (let i = 0; i < cleanLines.length; i++) {
                    const line = cleanLines[i];

                    // 处理「您的机型/机箱/配件：Y300 12G+512G」→ 机型 + 容量
                    if (/^您的(?:机型|机箱|配件)/.test(line)) {
                        const colonIdx = line.indexOf('：');
                        const rest = colonIdx !== -1 ? line.substring(colonIdx + 1).trim() : line.replace('您的机型', '').trim();
                        const { model, capacity } = parseModelCapacity(rest);
                        if (model) output.push(`机型：${model}`);
                        if (capacity) output.push(`容量：${capacity}`);
                        continue;
                    }

                    // 处理「机型颜色/外壳颜色：青松」→ 「颜色：青松」
                    if (/^(机型颜色|外壳颜色)/.test(line)) {
                        output.push(line.replace(/^(机型颜色|外壳颜色)/, '颜色'));
                        continue;
                    }

                    // 处理「序列号：xxx」→ 「SN码：xxx」
                    if (/^序列号/.test(line)) {
                        output.push(line.replace(/^序列号/, 'SN码'));
                        continue;
                    }

                    // 处理标签与值分行的情况（激活日期：\n2024年12月27日）
                    // 如果当前行以 ：或 : 结尾，且下一行存在且不含冒号，则合并
                    if (/[：:]\s*$/.test(line) && i + 1 < cleanLines.length) {
                        const nextLine = cleanLines[i + 1];
                        // 下一行不含冒号且不是纯数字（如日期格式）
                        if (!nextLine.includes('：') && !nextLine.includes(':') && !/^\d+$/.test(nextLine)) {
                            output.push(`${line}${nextLine}`);
                            i++; // 跳过已合并的下一行
                            continue;
                        }
                    }

                    output.push(line);
                }

                // 安全截断：只在「保修期至」行结束，后面统统不要
                const warrantyIdx = output.findIndex(l => l.startsWith('保修期至'));
                if (warrantyIdx !== -1 && warrantyIdx < output.length - 1) {
                    return output.slice(0, warrantyIdx + 1).join('\n');
                }

                return output.join('\n');
            }

            function tryExtractAndCopy() {
                if (!queried) return false;
                const card = findResultCard();
                if (!card) return false;
                const resultText = extractCleanResult(card);
                if (resultText && resultText !== lastCopied) {
                    lastCopied = resultText;
                    copyText(resultText);
                    log('已複製 VIVO 結果');
                    log('內容:\n' + resultText);
                    return true;
                }
                return false;
            }

            // 點擊「查询」按钮时重置复制状态并允许复制
            document.addEventListener('click', function(e) {
                const target = e.target.closest('button, a, span, div');
                if (target && (target.textContent.includes('查询') || target.textContent.includes('立即查询'))) {
                    log('重置複製狀態');
                    lastCopied = '';
                    queried = true;
                }
            }, true);

            // 定期轮询 + MutationObserver 双重检测
            let attempts = 0;
            const interval = setInterval(() => {
                if (tryExtractAndCopy() || ++attempts >= 60) clearInterval(interval);
            }, 1000);
            const observer = new MutationObserver(tryExtractAndCopy);
            observer.observe(document.body, { childList: true, subtree: true });
            window.addEventListener('unload', () => observer.disconnect());

            log('VIVO 監聽器已啟動');
        })();
    }
})();
