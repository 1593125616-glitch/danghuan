// ==UserScript==
// @name         质检选项核对横幅（型号对比专用）
// @namespace    http://tampermonkey.net/
// @version      1.2.38
// @description  质检核对：去除查询型号中的 AI版/AI 版 + 修复WiFi版残留版字 + 华为耳机/平板映射
// @author       py1998
// @match        https://yihuan.oppoer.me/*
// @match        http://yihuan.oppoer.me/static/*
// @grant        GM_getClipboard
// @updateURL    https://cdn.jsdelivr.net/gh/1593125616-glitch/danghuan@main/jixing.user.js
// @downloadURL  https://cdn.jsdelivr.net/gh/1593125616-glitch/danghuan@main/jixing.user.js
// ==/UserScript==

(function() {
    'use strict';

    // ========== 每天凌晨 3:00 自动刷新页面 ==========
    (function scheduleDailyReload() {
        const now = new Date();
        const reloadTime = new Date(now);
        reloadTime.setHours(3, 0, 0, 0);
        if (now >= reloadTime) reloadTime.setDate(reloadTime.getDate() + 1);
        setTimeout(() => location.reload(), reloadTime - now);
    })();

    // ========== 下拉选择同步模块 ==========
    const modelSelections = {};
    const selectLabelMap = new WeakMap();
    let syncTimer = null;

    function getSelectLabel(selectEl) {
        if (selectLabelMap.has(selectEl)) return selectLabelMap.get(selectEl);
        let label = '';
        const formItem = selectEl.closest('.el-form-item');
        if (formItem) {
            const labelEl = formItem.querySelector('.el-form-item__label');
            if (labelEl) label = labelEl.textContent.trim();
        }
        if (!label) {
            let prev = selectEl.previousElementSibling;
            while (prev) {
                const text = prev.textContent.trim();
                if (text && text.length > 0 && text.length < 20) { label = text; break; }
                prev = prev.previousElementSibling;
            }
        }
        if (!label) {
            const input = selectEl.querySelector('.el-input__inner');
            if (input && input.placeholder) label = input.placeholder;
        }
        if (!label) {
            const allSelects = [...document.querySelectorAll('.el-select')];
            const idx = allSelects.indexOf(selectEl);
            label = '下拉框' + (idx + 1);
        }
        selectLabelMap.set(selectEl, label);
        return label;
    }

    function syncAllSelects() {
        const allSelects = document.querySelectorAll('.el-select');
        const newSelections = {};
        allSelects.forEach(function(selectEl) {
            const input = selectEl.querySelector('.el-input__inner');
            if (input && input.value.trim() !== '') {
                const label = getSelectLabel(selectEl);
                newSelections[label] = input.value.trim();
            }
        });
        for (const key in modelSelections) delete modelSelections[key];
        Object.assign(modelSelections, newSelections);
        window.modelDropdownSelections = modelSelections;
    }

    function scheduleSync() {
        if (syncTimer) clearTimeout(syncTimer);
        syncTimer = setTimeout(() => {
            syncAllSelects();
            setTimeout(() => checkModel(true), 100);
        }, 300);
    }

    document.addEventListener('click', function(e) {
        const option = e.target.closest('.el-select-dropdown__item');
        if (!option) return;
        scheduleSync();
    }, true);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(syncAllSelects, 1500);
        });
    } else {
        setTimeout(syncAllSelects, 1500);
    }
    window.modelDropdownSelections = modelSelections;
    window.syncModelDropdownSelections = syncAllSelects;

    // ========== 数据源管理 (时间戳机制) ==========
    let pageText = null;
    let pageTime = 0;
    let clipboardText = null;
    let clipboardTime = 0;
    let imeiTableText = null;
    let imeiTableTime = 0;
    let tableVirtualContainer = null;
    let lastPageText = null;

    // ========== iPad 映射表 ==========
    const iPadModelMapping = {
        'ipad air 11寸 (m4)': 'iPad Air M4 11英寸 2026款', 'ipad air 13寸 (m4)': 'iPad Air M4 13英寸 2026款',
        'ipad air 11寸 (m3)': 'iPad Air M3 11英寸 2025款', 'ipad air 13寸 (m3)': 'iPad Air M3 13英寸 2025款',
        'ipad air 11寸 (m2)': 'iPad Air M2 11英寸 2024款', 'ipad air 13寸 (m2)': 'iPad Air M2 13英寸 2024款',
        'ipad pro 11寸 (m5)': 'iPad Pro 11英寸 2025款', 'ipad pro 13寸 (m5)': 'iPad Pro 13英寸 2025款',
        'ipad pro 13寸 (m4)': 'iPad Pro 13英寸 2024款', 'ipad pro 11寸 (m4)': 'iPad Pro 11英寸 2024款',
        'ipad pro, 11寸 (第4代)': 'iPad Pro 11英寸 4代 2022款',
        'ipad pro 11寸 (第4代)': 'iPad Pro 11英寸 4代 2022款',
        'ipad pro, 12.9寸 (第6代)': 'iPad Pro 12.9英寸 6代 2022款',
        'ipad pro 11寸 (2代)': 'iPad Pro 11英寸 2代 2020款',
        'ipad pro 12.9in 5g': 'iPad Pro 12.9英寸 5代 2021款',
        'ipad (第7代)': 'iPad 7代 2019款',
        'ipad (第10代)': 'iPad 10代 2022款',
        'ipad (第9代)': 'iPad 9代 2021款',
        'ipad (a16)': 'iPad 11代 2025款',
        'ipad air 4': 'iPad Air4',
        'ipad air (第5代)': 'iPad Air5',
        'ipad mini (a17 pro)': 'iPad mini7',
        'ipad air (第1代)': 'iPad Air1',
        'ipad air (第2代)': 'iPad Air2',
        'ipad air (第3代)': 'iPad Air3',
        'ipad 2': 'iPad 2代',
        'ipad (第3代)': 'iPad 3代（New iPad）',
        'ipad (第4代)': 'iPad 4代 (Retina屏)',
        'ipad (第5代)': 'iPad 5代 2017款',
        'ipad (第6代)': 'iPad 6代 2018款',
        'ipad (第8代)': 'iPad 8代 2020款',
        'ipad air': 'iPad Air',
        'ipad mini 2': 'iPad mini2',
        'ipad mini 3': 'iPad mini3',
        'ipad mini 4': 'iPad mini4',
        'ipad mini 5': 'iPad mini5',
        'ipad mini (5代)': 'iPad mini5',
        'ipad mini (第6代)': 'iPad mini6',
        'ipad pro 11寸': 'iPad Pro 11英寸 1代 2018款',
        'ipad pro 12.9寸 (第2代)': 'iPad Pro 12.9英寸 2代 2017款',
        'ipad pro 10.5寸': 'iPad Pro 10.5英寸 2017款',
        'ipad pro 9.7寸': 'iPad Pro 9.7英寸 2016款',
        'ipad pro 11寸 (第2代)': 'iPad Pro 11英寸 2代 2020款',
        'ipad pro, 11寸 (第3代)': 'iPad Pro 11英寸 3代 2021款',
        'ipad pro 12.9寸 (3代)': 'iPad Pro 12.9英寸 3代 2018款',
        'ipad pro 12.9寸 (4代)': 'iPad Pro 12.9英寸 4代 2020款',
        'ipad pro, 12.9寸 (第5代)': 'iPad Pro 12.9英寸 5代 2021款',
    };

    // ========== 华为平板映射表 ==========
    const huaweiPadModelMapping = {
        'matepad 10.4英寸 2020款': '华为 MatePad 10.4英寸',
        'matepad 10.4英寸 2021款': '华为 MatePad 10.4英寸',
        'matepad 5g 10.4英寸 2020款 5g版': '华为 MatePad 10.4英寸（5G版）',
        'matepad 10.8吋': '华为 MatePad 10.8英寸',
        'matepad 10.8英寸 2020款': '华为 MatePad 10.8英寸',
        'matepad 11.0英寸 2023款': '华为 MatePad 11英寸 2023',
        'matepad 11.0英寸 2023款 柔光版': '华为 MatePad 11英寸 2023（柔光版）',
        'matepad 11.5"s 灵动款': '华为 MatePad 11.5S 2024款（灵动版）',
        'matepad 11.5 s 2025款 灵动款': '华为 MatePad 11.5S 2025款（灵动版）',
        'matepad 11.5英寸 柔光版': '华为 MatePad 11.5英寸 2023（柔光版）',
        'matepad 11.5 2024款 柔光版': '华为 MatePad 11.5英寸 2024（柔光版）',
        'matepad 11.5英寸': '华为 MatePad 11.5英寸 2023',
        'matepad 11.5 2024款': '华为 MatePad 11.5英寸 2024',
        'matepad 11.5 2025款': '华为 MatePad 11.5英寸 2025',
        'matepad 11.5"s 柔光版': '华为 MatePad 11.5S 2024款（柔光版）',
        'matepad 11.5"s': '华为 MatePad 11.5S 2024款（标准版）',
        'matepad 11.5"s 2025款': '华为 MatePad 11.5S 2025款（标准版）',
        'matepad air 11.5英寸 2023款': '华为 MatePad Air 11.5英寸',
        'matepad air 11.5英寸 2023款 柔光版': '华为 MatePad Air 11.5英寸（柔光版）',
        'matepad air 12英寸 2024款': '华为 MatePad Air 12英寸 2024款',
        'matepad air 12英寸 2024款 柔光版': '华为 MatePad Air 12英寸 2024款（柔光版）',
        'matepad air 12英寸 2025款': '华为 MatePad Air 12英寸 2025款',
        'matepad air 12英寸 2025款 柔光版': '华为 MatePad Air 12英寸 2025款（柔光版）',
        'matepad pro 10.8英寸 2019款': '华为 MatePad Pro 10.8英寸 2019款',
        'matepad pro 10.8英寸 2021款': '华为 MatePad Pro 10.8英寸 2021款',
        'matepad pro 10.8英寸 2020款': '华为 MatePad Pro 10.8英寸 2020款',
        'matepad pro 11英寸 2022款 性能版': '华为 MatePad Pro 11英寸 2022款 性能版',
        'matepad pro 11英寸 2022款': '华为 MatePad Pro 11英寸 2022款',
        'matepad pro 11英寸 2024款': '华为 MatePad Pro 11英寸 2024款',
        'matepad pro 12.2英寸 2024款': '华为 MatePad Pro 12.2英寸 2024款',
        'matepad pro 12.2英寸 2024款 柔光版': '华为 MatePad Pro 12.2英寸 2024款 柔光版',
        'matepad pro 12.2英寸 2025款': '华为 MatePad Pro 12.2英寸 2025款',
        'matepad pro 12.6英寸 2021款': '华为 MatePad Pro 12.6英寸 2021款',
        'matepad pro 12.6英寸 2022款': '华为 MatePad Pro 12.6英寸 2022款',
        'matepad pro 13.2英寸 2023款': '华为 MatePad Pro 13.2英寸 2023款',
        'matepad pro 13.2英寸 2025款 柔光版': '华为 MatePad Pro 13.2英寸 2025款（柔光版）',
        'matepad pro 13.2英寸 2025款': '华为 MatePad Pro 13.2英寸 2025款',
        'matepad pro 13.2英寸 2025款 典藏版': '华为 MatePad Pro 13.2英寸 典藏版',
        'matepad mini 8.8英寸 柔光版': '华为 MatePad Mini（柔光版）',
        'matepad mini 8.8英寸': '华为 MatePad Mini',
        'matepad mini 悦读版 8.8英寸': '华为 MatePad Mini 悦读版',
        'matepad mini 悦读版 8.8英寸 柔光版': '华为 MatePad Mini 悦读版（柔光版）',
    };

    // ========== Apple Watch 映射表 ==========
    const appleWatchModelMapping = {
        'watch sport 第1代': 'Apple Watch Series 1',
        'watch 第1代': 'Apple Watch Series 1',
        'watch series 2': 'Apple Watch Series 2',
        'watch series 2 nike': 'Apple Watch Nike+（Series 2）',
        'watch series 3 nike': 'Apple Watch Nike+（Series 3）',
        'watch series 4 nike': 'Apple Watch Nike+（Series 4）',
        'watch series 5 nike': 'Apple Watch Nike（Series 5）',
        'watch series 6 nike': 'Apple Watch Nike（Series 6）',
        'watch series 7 nike': 'Apple Watch Nike（Series 7）',
        'watch se nike': 'Apple Watch Nike SE',
        'watch se 第2代': 'Apple Watch SE 2',
        'watch se 第3代': 'Apple Watch SE 3',
    };

    // ========== Apple MacBook 映射表 ==========
    const appleMacBookModelMapping = {
        'macbook pro retina, 13寸, early 2015': '苹果 15年 13寸 MacBook Pro',
        'macbook pro 16寸, 2019': '苹果 19年 16寸 MacBook Pro',
        'macbook pro 13寸, m1, 2020': '苹果 20年 13寸 MacBook Pro M1',
        'macbook pro 13寸, 2019, t3': '苹果 19年 13寸 MacBook Pro',
        'macbook pro 13寸, 2017, t3': '苹果 17年 13寸 MacBook Pro',
        'macbook pro retina, 13寸, mid 2012': '苹果 12年 13寸 MacBook Pro',
        'macbook pro 13寸, 2018, t3': '苹果 18年 13寸 MacBook Pro',
        'macbook pro 13寸, 2020, t3': '苹果 20年 13寸 MacBook Pro',
        'macbook pro 13寸, m2, 2022': '苹果 22年 13寸 MacBook Pro',
        'macbook air 13寸, m4, 2025': '苹果 25年 13寸 MacBook Air',
        'macbook air 13寸, 2017': '苹果 17年 13寸 MacBook Air',
        'macbook air 13寸, early 2015': '苹果 15年 13寸 MacBook Air',
        'macbook air 13寸, early 2014': '苹果 14年 13寸 MacBook Air',
        'macbook air 13寸, m3, 2024': '苹果 24年 13寸 MacBook Air',
        'macbook air 13寸, mid 2012': '苹果 12年 13寸 MacBook Air',
        'macbook air 13寸, mid 2013': '苹果 13年 13寸 MacBook Air',
        'macbook air 11寸, early 2014': '苹果 14年 11寸 MacBook Air',
        'macbook air 11寸, early 2015': '苹果 15年 11寸 MacBook Air',
        'macbook air 11寸, mid 2013': '苹果 13年 11寸 MacBook Air',
        'macbook air 11寸, late 2010': '苹果 10年 11寸 MacBook Air',
        'macbook air 11寸, mid 2011': '苹果 11年 11寸 MacBook Air',
        'macbook pro 14寸, m4, 2024': '苹果 24年 14寸 MacBook Pro',
        'macbook pro 14寸, m4 pro/max, 2024': '苹果 24年 14寸 MacBook Pro',
        'macbook pro 14寸, m3 pro/max, nov 2023': '苹果 23年 14寸 MacBook Pro M3',
        'macbook pro 14寸, m3, nov 2023': '苹果 23年 14寸 MacBook Pro M3',
        'macbook pro 14寸, m2 pro/max, nov 2023': '苹果 23年 14寸 MacBook Pro M2',
        'macbook retina, 12寸, early 2016': '苹果 16年 12寸 MacBook',
    };

    // ========== Apple AirPods 映射表 ==========
    const appleAirPodsModelMapping = {
        'airpods 4 anc': '苹果 AirPods 4代（支持主动降噪）',
        'airpods 4': '苹果 AirPods 4代（不支持主动降噪）',
    };

    // ========== 三星平板映射表 ==========
    const samsungTabletModelMapping = {
        'galaxy tab s6 lite 10.4英寸': '三星 Galaxy Tab S6 Lite',
        'galaxy tab a7': '三星 Galaxy Tab A7 10.4 2020款',
    };

    const lenovoTabletModelMapping = {
        '小新pad plus': '联想 小新 Pad Plus 11英寸',
        '小新pad pro 2020': '联想 小新 Pad Pro 11.5英寸 2020款',
        '小新pad pro 12.7骁龙版': '联想 小新 Pad Pro 12.7英寸2023（骁龙版）',
        '小新pad 2022': '联想 小新 Pad 10.6英寸 2022款',
        '小新pad pro 12.7天玑版': '联想 小新 Pad Pro 12.7英寸 2023（天玑版）',
        '小新pad pro 12.7二代': '联想 小新 Pad Pro 12.7英寸 2025款',
        '拯救者 y700 超控版': '联想 拯救者 Y700 三代 8.8英寸 2025款（超控版）',
    };

    const lenovoInternalModelMapping = {
        'tb-j716f': '联想 小新 Pad Pro 11.5英寸 2021款',
        'tb-j716n': '联想 小新 Pad Pro 12.6英寸 2021款',
    };

    const lenovoProductDescMapping = {
        'tb321fu': '联想 拯救者 Y700 三代 8.8英寸 2025款',
        'tb-9707f': '联想 拯救者 Y700 8.8英寸 2022款',
        'tb320fc': '联想 拯救者 Y700 8.8英寸 2023款',
        'tb322fc': '联想 拯救者 Y700 四代 8.8英寸',
        'tb323fu': '联想 拯救者 Y700 五代 8.8英寸',
    };

    function mapLenovoTabletModel(cleanedModel, officialText) {
        const key = cleanedModel.toLowerCase().replace(/\s+/g, '').trim();
        for (const [kw, mapped] of Object.entries(lenovoTabletModelMapping)) {
            const kwClean = kw.replace(/\s+/g, '');
            if (key.includes(kwClean)) return mapped;
            const segments = kw.toLowerCase().split(/\s+/).filter(Boolean);
            if (segments.length > 1 && segments.every(s => key.includes(s))) return mapped;
        }
        const descLine = extractInfoLine(officialText, '产品描述') || '';
        const descLower = descLine.toLowerCase();
        // 拯救者 Y700：先确认型号含"拯救者y700"或"拯救者平板y700"，再根据产品描述中的 TB 代码区分代际
        if (key.includes('拯救者y700') || key.includes('拯救者平板y700')) {
            for (const [code, mapped] of Object.entries(lenovoProductDescMapping)) {
                if (descLower.includes(code)) return mapped;
            }
        }
        // 小新 Pad Pro 2021：先确认型号含"小新padpro2021"，再根据产品描述中的 TB 代码区分
        if (key.includes('小新padpro2021')) {
            for (const [code, mapped] of Object.entries(lenovoInternalModelMapping)) {
                if (descLower.includes(code)) return mapped;
            }
        }
        return null;
    }

    function isStrictProductDescBrand(brand) {
        return /OPPO|一加|真我|realme/i.test(brand);
    }

    function cleanAppleWatchModel(str) {
        let hasNike = /Nike/i.test(str);
        let cleaned = str
            .replace(/[（(]\s*GPS\b.*$/gi, '')
            .replace(/\bGPS\b.*$/gi, '')
            .replace(/[（(]\s*(?:Alum|SS)\s*[）)]/gi, '')
            .replace(/[（(]\s*移动网络\s*[）)]/gi, '')
            .replace(/\s+/g, ' ').trim();
        if (hasNike && !/Nike/i.test(cleaned)) {
            cleaned += ' Nike';
        }
        return cleaned;
    }

    function cleanAppleAirPodsModel(str) {
        return str
            .replace(/with\s+Wireless\s+Charging\s+Case/gi, '')
            .replace(/电版/gi, '')
            .replace(/代/gi, '')
            .replace(/\(\s*USB-C\s*\)/gi, '')
            .replace(/\s+/g, ' ').trim();
    }

    // ========== 页面选中颜色/存储获取 ==========
    function getSelectedColor() {
        return getInputValueByLabel('颜色') || getInputValueByLabel('配色') || getInputValueByLabel('表壳外观') || '';
    }
    function getSelectedStorage() {
        return getInputValueByLabel('存储容量') || getInputValueByLabel('存储') || getInputValueByLabel('内存') || '';
    }

    function normalizeStorage(str) {
        if (!str) return '';
        return str.replace(/(\d+)\s*G(?!B)/gi, '$1GB')
                  .replace(/(\d+)\s*T(?!B)/gi, '$1TB')
                  .replace(/\s+/g, '');
    }

    function removeColorAndStorage(modelRaw, color, storage) {
        if (!modelRaw) return '';
        let cleaned = modelRaw;
        if (color) {
            const escapedColor = color.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            cleaned = cleaned.replace(new RegExp(escapedColor, 'gi'), '').replace(/\s+/g, ' ').trim();
        }
        if (storage) {
            const normStorage = normalizeStorage(storage);
            if (normStorage) {
                const patterns = [
                    normStorage,
                    normStorage.replace(/GB|TB/gi, ''),
                    normStorage.replace(/(\d+).*/, '$1'),
                    storage.trim().replace(/\s+/g, '')
                ];
                patterns.forEach(p => {
                    if (p) cleaned = cleaned.replace(new RegExp(p, 'gi'), '').replace(/\s+/g, ' ').trim();
                });
            }
        }
        return cleaned;
    }

    function extractColorAndStorage(text) {
        const result = { color: '', storage: '' };
        const colorMatch = text.match(/^颜色[：:]\s*(.+)$/im);
        if (colorMatch) result.color = colorMatch[1].trim();
        const storageMatch = text.match(/^存储容量[：:]\s*(.+)$/im);
        if (storageMatch) result.storage = storageMatch[1].trim();
        return result;
    }

    // ========== 清洗用户选择的型号 ==========
    function cleanSelectedModel(val, brand, category) {
        if (!val) return '';
        let cleaned = val;
        cleaned = cleaned.replace(/触控笔/gi, '');
        cleaned = cleaned.replace(/无线充|无线耳机|有线充|移动定制|联通定制|电信定制|艺术定制版|中文版|高配版|耳夹耳机|SIM卡版|艺术家联名版|二手机|真无线降噪耳机|开放式耳机|键盘式双面保护壳/gi, ' ');
        cleaned = cleaned.replace(/\(\s*USB-C\s*\)/gi, ' ');
        cleaned = cleaned.replace(/全网通/gi, '');
        cleaned = cleaned.replace(/[（(]\s*[54]G\s*[）)]/gi, ' ');
        cleaned = cleaned.replace(/\b[54]G\b/gi, ' ');
        // 去除 AI版（含空格或不含空格）
        cleaned = cleaned.replace(/AI\s*版/gi, ' ');
        // 去除 WiFi版 / WIFI版 / Wi-Fi版（含空格或不含空格）
        cleaned = cleaned.replace(/(?:Wi-Fi|WIFI|WiFi|wifi)\s*版/gi, ' ');
        cleaned = cleaned.replace(/细闪|素皮|无充电器版|广东|陶瓷|冠军版深|虎年礼盒|龙鳞纤维版|公开版/gi, ' ');
        if (/苹果|Apple/i.test(brand) && (category === '手表' || category === '智能手表')) {
            cleaned = cleanAppleWatchModel(cleaned);
        }
        if (/苹果|Apple/i.test(brand) && (category === '耳机' || category === '耳機' || category === '音频设备' || category === '音频')) {
            cleaned = cleanAppleAirPodsModel(cleaned);
        }
        return cleaned.replace(/\s+/g, ' ').trim();
    }

    function replaceChineseNumerals(str) {
        const map = { '一': '1', '二': '2', '三': '3' };
        return str.replace(/[一二三]/g, ch => map[ch] || ch);
    }

    function normalizeModelForCompare(str) {
        if (!str) return '';
        let t = str.replace(/[（(]/g, '').replace(/[）)]/g, '');
        t = t.replace(/款/g, '版');
        t = replaceChineseNumerals(t);
        // 平板 等同于 Pad
        t = t.replace(/平板/gi, 'Pad');
        t = t.replace(/^(苹果|apple|华为|huawei|小米|xiaomi|红米|redmi|三星|samsung|oppo|vivo|真我|realme|一加|oneplus|荣耀|honor|魅族|meizu|努比亚|nubia|联想|lenovo|摩托罗拉|motorola|索尼|sony|谷歌|google|诺基亚|nokia)\s*/i, '');
        // Nubia = 努比亚, Red Magic = 红魔
        t = t.replace(/nubia/gi, '努比亚');
        t = t.replace(/red\s*magic/gi, '红魔');
        // 盖乐世 等同于 Galaxy
        t = t.replace(/盖乐世/gi, 'Galaxy');
        // 至尊 等同于 至尊版
        t = t.replace(/至尊(?!版)/g, '至尊版');
        t = t.replace(/\s+/g, '');
        return t;
    }

    // 用于华为特殊规则的标准化（处理括号、空格）
    function normalizeForSpecialCompare(str) {
        return str.replace(/^华为\s*/i, '')
                  .replace(/\s+/g, '')
                  .replace(/[（]/g, '(')
                  .replace(/[）]/g, ')')
                  .toLowerCase();
    }

    // ========== 华为平板：从产品描述提取型号 ==========
    function extractHuaweiPadFromDesc(officialText) {
        const descLine = extractInfoLine(officialText, '产品描述') || extractInfoLine(officialText, 'Product Description') || '';
        if (!descLine) return null;

        let extracted = descLine;

        // 去除颜色和存储（从表单中获取）
        const color = getSelectedColor();
        const storage = getSelectedStorage();
        extracted = removeColorAndStorage(extracted, color, storage);

        // 如果表单中没获取到颜色/存储，尝试从官方文本中提取
        if (!color || !storage) {
            const cs = extractColorAndStorage(officialText);
            if (!color && cs.color) extracted = removeColorAndStorage(extracted, cs.color, '');
            if (!storage && cs.storage) extracted = removeColorAndStorage(extracted, '', cs.storage);
        }

        // 去除 WiFi版 / LTE版 / 演示样机
        extracted = extracted.replace(/(?:Wi-Fi|WIFI|WiFi|wifi)\s*版/gi, ' ');
        extracted = extracted.replace(/LTE版/gi, ' ');
        extracted = extracted.replace(/演示样机/gi, ' ');

        // 使用现有清洁函数
        extracted = cleanModelString(extracted);
        extracted = extracted.replace(/\s+/g, ' ').trim();

        return extracted || null;
    }

    // ========== 辅助：从文本中提取字段 ==========
    function extractInfoLine(text, key) {
        const regex = new RegExp(`^${key}[：:]\\s*(.+)$`, 'im');
        const match = text.match(regex);
        return match ? match[1].trim() : null;
    }

    const CONFIG = {
        areaSelectors: ['.yabao-report-detail', '.report-info', '.info-content', '.right-info'],
        items: [
            {
                name: '机型',
                labelKeywords: ['机型'],
                selectedFn: () => getInputValueByLabel('机型'),
                customCheck: (officialText, selectedVal) => {
                    if (!selectedVal) return null;
                    const brand = getInputValueByLabel('品牌');
                    const category = getInputValueByLabel('品类') || '';
                    const originalSelectedVal = selectedVal;
                    selectedVal = cleanSelectedModel(selectedVal, brand, category);

                    let officialModelClean = null;
                    if (clipboardText && officialText === clipboardText) {
                        const color = getSelectedColor(), storage = getSelectedStorage();
                        let modelMatch = null;
                        if (/努比亚|Nubia|红魔|Redmagic/i.test(brand)) {
                            modelMatch = officialText.match(/^机器名称[：:]\s*(.+)$/im) || officialText.match(/^机型名称[：:]\s*(.+)$/im);
                        }
                        if (!modelMatch) modelMatch = officialText.match(/^:?型号[：:]\s*(.+)$/im) || officialText.match(/^机型[：:]\s*(.+)$/im);
                        if (modelMatch && modelMatch[1].trim()) {
                            let raw = modelMatch[1].trim();
                            if (/努比亚|Nubia|红魔|Redmagic/i.test(brand)) {
                                raw = raw.replace(/\bNubia\b/gi, '努比亚').replace(/\bRed\s*Magic\b/gi, '红魔').replace(/\bREDMAGIC\b/gi, '红魔');
                            }
                            raw = forceTruncateAtKeywords(raw);
                            if (/小米|Xiaomi|Redmi|红米/i.test(brand) && (category === '手表' || category === '智能手表')) {
                                const mmTrunc = raw.match(/^(.+?\d+\s*mm)/i);
                                if (mmTrunc) raw = mmTrunc[1];
                            }
                            raw = cleanModelString(raw);
                            if (/苹果|Apple/i.test(brand) && (category === '笔记本' || category === '电脑')) {
                                const lastParen = raw.lastIndexOf(')');
                                if (lastParen !== -1) raw = raw.substring(0, lastParen + 1).trim();
                            }
                            if (/苹果|Apple/i.test(brand) && (category === '手表' || category === '智能手表')) {
                                raw = cleanAppleWatchModel(raw);
                            }
                            if (/OPPO/i.test(brand) && (category === '手表' || category === '智能手表')) {
                                raw = raw.replace(/ECG版|理想汽车定制版|名侦探柯南限定版|精钢版|故宫新禧版|英雄联盟限定版|EVA限定版|NFC版|高尔夫定制版|MG汽车定制版/gi, ' ').replace(/\s+/g, ' ').trim();
                            }
                            if (/三星|Samsung/i.test(brand) && (category === '手表' || category === '智能手表')) {
                                raw = raw.replace(/Bespoke\s*蓝牙\/?/gi, ' ').replace(/\s*版\s*/gi, ' ').replace(/\s+/g, ' ').trim();
                            }
                            if (/三星|Samsung/i.test(brand) && (category === '平板' || category === '平板电脑' || category === 'Pad')) {
                                raw = raw.replace(/盖乐世/gi, 'Galaxy').replace(/WLAN/gi, ' ').replace(/[（(]\s*[）)]/gi, ' ').replace(/3G版/gi, ' ').replace(/\s+/g, ' ').trim();
                            }
                            if (/联想|Lenovo/i.test(brand) && (category === '平板' || category === '平板电脑' || category === 'Pad')) {
                                raw = raw.replace(/[（(][^）)]*[）)]/gi, ' ').replace(/\s+/g, ' ').trim();
                            }
                            if (/小米|Xiaomi|Redmi|红米/i.test(brand)) {
                                raw = raw.replace(/双卫星通信|3\.2GHz|12\.4|12\.5/gi, ' ').replace(/\s+/g, ' ').trim();
                            }
                            if (/苹果|Apple/i.test(brand) && (category === '耳机' || category === '耳機' || category === '音频设备' || category === '音频')) {
                                raw = cleanAppleAirPodsModel(raw);
                            }
                            raw = removeColorAndStorage(raw, color, storage);
                            if (!color || !storage) {
                                const extracted = extractColorAndStorage(officialText);
                                if (!color && extracted.color) raw = removeColorAndStorage(raw, extracted.color, '');
                                if (!storage && extracted.storage) raw = removeColorAndStorage(raw, '', extracted.storage);
                            }
                            officialModelClean = raw || null;
                        }
                    } else {
                        officialModelClean = extractOfficialModel(officialText, brand, category);
                        if (officialModelClean && /苹果|Apple/i.test(brand) && (category === '笔记本' || category === '电脑')) {
                            const lastParen = officialModelClean.lastIndexOf(')');
                            if (lastParen !== -1) officialModelClean = officialModelClean.substring(0, lastParen + 1).trim();
                        }
                        if (officialModelClean && /苹果|Apple/i.test(brand) && (category === '手表' || category === '智能手表')) {
                            officialModelClean = cleanAppleWatchModel(officialModelClean);
                        }
                        if (officialModelClean && /三星|Samsung/i.test(brand) && (category === '手表' || category === '智能手表')) {
                            officialModelClean = officialModelClean.replace(/Bespoke\s*蓝牙\/?/gi, ' ').replace(/\s*版\s*/gi, ' ').replace(/\s+/g, ' ').trim();
                        }
                        if (officialModelClean && /三星|Samsung/i.test(brand) && (category === '平板' || category === '平板电脑' || category === 'Pad')) {
                            officialModelClean = officialModelClean.replace(/盖乐世/gi, 'Galaxy').replace(/WLAN/gi, ' ').replace(/[（(]\s*[）)]/gi, ' ').replace(/3G版/gi, ' ').replace(/\s+/g, ' ').trim();
                        }
                        if (officialModelClean && /联想|Lenovo/i.test(brand) && (category === '平板' || category === '平板电脑' || category === 'Pad')) {
                            officialModelClean = officialModelClean.replace(/[（(][^）)]*[）)]/gi, ' ').replace(/\s+/g, ' ').trim();
                        }
                        if (officialModelClean && /小米|Xiaomi|Redmi|红米/i.test(brand)) {
                            officialModelClean = officialModelClean.replace(/双卫星通信|3\.2GHz|12\.4|12\.5/gi, ' ').replace(/\s+/g, ' ').trim();
                        }
                        if (officialModelClean && /苹果|Apple/i.test(brand) && (category === '耳机' || category === '耳機' || category === '音频设备' || category === '音频')) {
                            officialModelClean = cleanAppleAirPodsModel(officialModelClean);
                        }
                    }

                    if (!officialModelClean) return null;

                    // 华为/荣耀笔记本：去除"款"和"版"
                    if ((/华为|Huawei/i.test(brand) || /荣耀|Honor/i.test(brand)) && (category === '笔记本' || category === '电脑')) {
                        officialModelClean = officialModelClean.replace(/[款版]/g, '').trim();
                    }

                    // ========== 华为耳机特殊规则 ==========
                    if (brand === '华为' && (category === '耳机' || category === '耳機' || category === '音频设备' || category === '音频')) {
                        if (/freebuds\s*4e/i.test(officialText)) {
                            const expected = '华为FreeBuds4E2024款';
                            const userNorm = normalizeModelForCompare(originalSelectedVal).toLowerCase();
                            const expectedNorm = normalizeModelForCompare(expected).toLowerCase();
                            if (userNorm !== expectedNorm) {
                                return `机型 应为【${expected}】，你选了【${originalSelectedVal}】`;
                            }
                            return null;
                        }
                    }

                    // ========== 华为平板特殊规则（优先使用产品描述 + 映射表） ==========
                    if (brand === '华为' && (category === '平板' || category === '平板电脑' || category === 'Pad')) {
                        // 尝试从产品描述提取型号
                        const descModel = extractHuaweiPadFromDesc(officialText);
                        if (descModel) {
                            const key = descModel.toLowerCase().replace(/\s+/g, ' ');
                            let expected = huaweiPadModelMapping[key];

                            // 未命中映射时尝试去掉"款"再查
                            if (!expected) {
                                const keyNoSuffix = key.replace(/款/g, '').trim();
                                expected = huaweiPadModelMapping[keyNoSuffix];
                            }

                            if (!expected) {
                                // 不在映射表内，走通用规则：产品描述提取值 + 华为前缀
                                expected = `华为 ${descModel}`;
                            }

                            const userNorm = normalizeModelForCompare(originalSelectedVal).toLowerCase();
                            const expectedNorm = normalizeModelForCompare(expected).toLowerCase();
                            if (userNorm !== expectedNorm) {
                                return `机型 应为【${expected}】，你选了【${originalSelectedVal}】`;
                            }
                            return null;
                        }
                        // 如果没有产品描述字段，继续走下面的通用规则
                    }

                    // ========== 华为特殊规则（手机版） ==========
                    if (brand === '华为' && officialModelClean) {
                        const huaweiSpecialModels = [
                            { pattern: /\bmate\s*30\b(?!\s*pro)/i, type: 'versioned' },
                            { pattern: /mate\s*30\s*pro/i, type: 'versioned' },
                            { pattern: /mate\s*40\s*e/i, type: 'versioned' },
                            { pattern: /p40\b/i, type: 'versioned' },
                            { pattern: /mate\s*40\s*pro/i, type: 'versioned' },
                            { pattern: /p50\s*pro/i, type: 'p50pro' }
                        ];
                        for (const rule of huaweiSpecialModels) {
                            if (rule.pattern.test(officialModelClean)) {
                                const expected = resolveHuaweiExpected(officialText, officialModelClean, rule.type);
                                if (expected) {
                                    const userNorm = normalizeForSpecialCompare(originalSelectedVal);
                                    const expectedNorm = normalizeForSpecialCompare(expected);
                                    if (userNorm !== expectedNorm) {
                                        return `机型 应为【${expected}】，你选了【${originalSelectedVal}】`;
                                    }
                                    return null;
                                }
                                break;
                            }
                        }
                    }

                    // ========== Apple Watch 硬性型号映射 ==========
                    if (/苹果|Apple/i.test(brand) && (category === '手表' || category === '智能手表')) {
                        const key = officialModelClean.toLowerCase().replace(/\s+/g, ' ').trim().replace(/[（()）]/g, '').replace(/[，、]/g, ',').replace(/,\s*/g, ', ');
                        const mapped = appleWatchModelMapping[key];
                        if (mapped) {
                            if (normalizeModelForCompare(mapped).toLowerCase() === normalizeModelForCompare(selectedVal).toLowerCase()) return null;
                            return `机型 应为【${mapped}】，你选了【${selectedVal}】`;
                        }
                    }

                    // ========== Apple MacBook 硬性型号映射 ==========
                    if (/苹果|Apple/i.test(brand) && (category === '笔记本' || category === '电脑')) {
                        const key = officialModelClean.toLowerCase().replace(/\s+/g, ' ').trim().replace(/[（()）]/g, '').replace(/[，、]/g, ',').replace(/,\s*/g, ', ');
                        const mapped = appleMacBookModelMapping[key];
                        if (mapped) {
                            if (normalizeModelForCompare(mapped).toLowerCase() === normalizeModelForCompare(selectedVal).toLowerCase()) return null;
                            return `机型 应为【${mapped}】，你选了【${selectedVal}】`;
                        }
                    }

                    // ========== Apple AirPods 硬性型号映射 ==========
                    if (/苹果|Apple/i.test(brand) && (category === '耳机' || category === '耳機' || category === '音频设备' || category === '音频')) {
                        const key = officialModelClean.toLowerCase().replace(/\s+/g, ' ').trim().replace(/[（()）]/g, '').replace(/[，、]/g, ',').replace(/,\s*/g, ', ');
                        const mapped = appleAirPodsModelMapping[key];
                        if (mapped) {
                            if (normalizeModelForCompare(mapped).toLowerCase() === normalizeModelForCompare(selectedVal).toLowerCase()) return null;
                            return `机型 应为【${mapped}】，你选了【${selectedVal}】`;
                        }
                    }

                    // ========== 华为/荣耀笔记本特殊规则 ==========
                    if ((/华为|Huawei/i.test(brand) || /荣耀|Honor/i.test(brand)) && (category === '笔记本' || category === '电脑') && officialModelClean) {
                        let modelForMatch = officialModelClean;
                        const desc = (extractInfoLine(officialText, '产品描述') || '').toLowerCase();
                        const prodCode = (extractInfoLine(officialText, '产品代码') || '').toLowerCase();
                        let expected = null;

                        if (/华为|Huawei/i.test(brand)) {
                            if (/matebook\s*e/i.test(modelForMatch)) {
                                if (/drc-w5[68]|drc-w38|drc-w76/i.test(prodCode)) expected = '华为 MateBook E 系列 2022年';
                                else if (/pak-al09|pak-w09/i.test(prodCode)) expected = '华为 MateBook E 系列 2019年';
                                else if (/bl-w0[9]|bl-w19/i.test(prodCode)) expected = '华为 MateBook E 系列 2017年';
                                else if (/drr-w5[68]|drr-w76/i.test(prodCode)) expected = '华为 MateBook E 系列 2023年';
                            }
                            if (!expected && /matebook\s*13s/i.test(modelForMatch) && /2021/.test(modelForMatch)) {
                                expected = '华为 MateBook 13s（触控屏）';
                            }
                            if (!expected && /matebook\s*13(?!s)/i.test(modelForMatch) && /2020/.test(modelForMatch)) {
                                expected = desc.includes('触屏') ? '华为 MateBook 13 2020款（触控屏）' : '华为 MateBook 13 2020款（非触控屏）';
                            }
                            if (!expected && /matebook\s*13(?!s)/i.test(modelForMatch) && /2021/.test(modelForMatch)) {
                                expected = '华为 MateBook 13 系列';
                            }
                            if (!expected && /matebook\s*13(?!s)/i.test(modelForMatch) && /2019/.test(modelForMatch)) {
                                expected = '华为 MateBook 13 系列';
                            }
                            if (!expected && /matebook\s*d\s*14/i.test(modelForMatch) && /2022/.test(modelForMatch) && /se/i.test(modelForMatch)) {
                                expected = '华为 MateBook D 14 SE 2022';
                            }
                            if (!expected && /matebook\s*14(?!s)/i.test(modelForMatch) && /2019/.test(modelForMatch)) {
                                expected = '华为 MateBook 14 2019款';
                            }
                            if (!expected && /matebook\s*14(?!s)/i.test(modelForMatch) && /2020/.test(modelForMatch)) {
                                expected = desc.includes('触屏') ? '华为 MateBook 14 2020款（触控屏）' : '华为 MateBook 14 2020款（非触控屏）';
                            }
                            if (!expected && /matebook\s*d\s*14/i.test(modelForMatch) && /2022/.test(modelForMatch)) {
                                expected = '华为 MateBook D 14 2022';
                            }
                        }

                        if (/荣耀|Honor/i.test(brand)) {
                            const yearMatch = modelForMatch.match(/(20[0-4]\d)/);
                            if (yearMatch) {
                                const idx = modelForMatch.indexOf(yearMatch[1]);
                                if (idx !== -1) modelForMatch = modelForMatch.substring(0, idx + 4).trim();
                            }
                            const hmLower = modelForMatch.toLowerCase();
                            if (/magicbook/i.test(hmLower) && /2019/.test(hmLower) && !/15/.test(hmLower)) {
                                expected = '荣耀 MagicBook 2019 14寸';
                            } else if (/magicbook\s*x\s*16\s*pro/i.test(hmLower) && /2024/.test(hmLower)) {
                                expected = '荣耀 MagicBook X 16 Pro 2024';
                            } else if (/magicbook\s*14/i.test(hmLower) && /2021/.test(hmLower)) {
                                expected = '荣耀 MagicBook 14 2021款';
                            } else if (/magicbook\s*15/i.test(hmLower) && /2019/.test(hmLower)) {
                                expected = '荣耀 MagicBook 15';
                            } else {
                                expected = modelForMatch;
                            }
                        }

                        if (expected) {
                            const userNorm = normalizeModelForCompare(originalSelectedVal).toLowerCase();
                            const expectedNorm = normalizeModelForCompare(expected).toLowerCase();
                            if (userNorm !== expectedNorm) {
                                return `机型 应为【${expected}】，你选了【${originalSelectedVal}】`;
                            }
                            return null;
                        }
                    }

                    // ========== VIVO 手机 4G/5G 型号区分（根据内部型号）==========
                    if ((/vivo|iQOO/i.test(brand) && category === '手机') && officialModelClean) {
                        const innerModel = extractInfoLine(officialText, '内部型号');
                        if (innerModel) {
                            const modelLower = officialModelClean.toLowerCase();
                            const innerUpper = innerModel.trim().toUpperCase();
                            let expected = null;

                            if (/y33s/i.test(modelLower)) {
                                if (innerUpper === 'V2166A') expected = 'vivo Y33s（5G）';
                                else if (innerUpper === 'V2109A') expected = 'vivo Y33s（4G）';
                            } else if (/y55s/i.test(modelLower)) {
                                if (innerUpper === 'V2164A') expected = 'vivo Y55s（5G）';
                                else if (innerUpper === 'V2058A') expected = 'vivo Y55s（4G）';
                            }

                            if (expected) {
                                const userNorm = normalizeModelForCompare(originalSelectedVal).toLowerCase();
                                const expectedNorm = normalizeModelForCompare(expected).toLowerCase();
                                if (userNorm !== expectedNorm) {
                                    return `机型 应为【${expected}】，你选了【${originalSelectedVal}】`;
                                }
                                return null;
                            }
                            // 有内部型号字段但没匹配到规则，不走通用逻辑？不，继续往下走
                        }
                    }

                    // ========== OPPO 手机 4G/5G/海外版 区分（根据产品描述）==========
                    if (/OPPO/i.test(brand) && category === '手机' && officialModelClean) {
                        const desc = (extractInfoLine(officialText, '产品描述') || '').toLowerCase();
                        const modelLower = officialModelClean.toLowerCase();
                        let expected = null;

                        if (/a53\b/i.test(modelLower) && !/a533g|a535g/i.test(modelLower)) {
                            if (desc.includes('海外版') || desc.includes('海外')) expected = 'OPPO A53（海外版）';
                            else if (desc.includes('5g')) expected = 'OPPO A53（5G）';
                            else expected = 'OPPO A53（4G）';
                        } else if (/reno\s*4\s*pro/i.test(modelLower)) {
                            if (desc.includes('5g')) expected = 'OPPO Reno4 Pro（5G）';
                            else expected = 'OPPO Reno4 Pro（4G）';
                        } else if (/a72\b/i.test(modelLower)) {
                            if (desc.includes('5g')) expected = 'OPPO A72（5G）';
                            else expected = 'OPPO A72（4G）';
                        } else if (/a57\b/i.test(modelLower)) {
                            if (desc.includes('5g')) expected = 'OPPO A57（2022 5G）';
                            else if (desc.includes('海外版') || desc.includes('海外')) expected = 'OPPO A57（2022 4G）';
                            else expected = 'OPPO A57（2016）';
                        }

                        if (expected) {
                            const userNorm = normalizeModelForCompare(originalSelectedVal).toLowerCase();
                            const expectedNorm = normalizeModelForCompare(expected).toLowerCase();
                            if (userNorm !== expectedNorm) {
                                return `机型 应为【${expected}】，你选了【${originalSelectedVal}】`;
                            }
                            return null;
                        }
                    }

                    // 其他品牌规则
                    if (/苹果|Apple/i.test(brand) && (category === '平板' || category === 'iPad')) {
                        const mapped = mapiPadModel(officialModelClean);
                        if (mapped) {
                            if (normalizeModelForCompare(mapped).toLowerCase() === normalizeModelForCompare(selectedVal).toLowerCase()) return null;
                            return `机型 应为【${mapped}】，你选了【${selectedVal}】`;
                        }
                    }

                    // 三星平板特殊型号映射
                    if (/三星|Samsung/i.test(brand) && (category === '平板' || category === '平板电脑' || category === 'Pad')) {
                        const key = officialModelClean.toLowerCase().replace(/\s+/g, ' ').trim();
                        const mapped = samsungTabletModelMapping[key];
                        if (mapped) {
                            if (normalizeModelForCompare(mapped).toLowerCase() === normalizeModelForCompare(selectedVal).toLowerCase()) return null;
                            return `机型 应为【${mapped}】，你选了【${selectedVal}】`;
                        }
                    }

                    // 联想平板特殊型号映射
                    if (/联想|Lenovo/i.test(brand) && (category === '平板' || category === '平板电脑' || category === 'Pad')) {
                        const mapped = mapLenovoTabletModel(officialModelClean, officialText);
                        if (mapped) {
                            if (normalizeModelForCompare(mapped).toLowerCase() === normalizeModelForCompare(selectedVal).toLowerCase()) return null;
                            return `机型 应为【${mapped}】，你选了【${selectedVal}】`;
                        }
                    }

                    if (/苹果|Apple/i.test(brand) && category === '手机') {
                        const normalizeApple = (s) => s.toLowerCase().replace(/苹果|apple/gi, '').replace(/[（(]\s*[54]G\s*[）)]/gi, '').replace(/\s+/g, '');
                        if (normalizeApple(officialModelClean) === normalizeApple(selectedVal)) return null;
                    }
                    if (/三星/i.test(brand)) {
                        const normalize = (s) => s.toLowerCase().replace(/盖乐世/gi, 'Galaxy').replace(/三星商城专属(颜色)?/gi, '').replace(/三星|samsung/gi, '').replace(/[（(]\s*[54]G\s*[）)]/gi, '').replace(/\s+/g, '');
                        if (normalize(officialModelClean) === normalize(selectedVal)) return null;
                    }
                    if (/真我|realme/i.test(brand)) {
                        const normalizeRealme = (s) => s.toLowerCase().replace(/真我|realme/gi, '').replace(/[（(]\s*[54]G\s*[）)]/gi, '').replace(/\s+/g, '');
                        if (normalizeRealme(officialModelClean) === normalizeRealme(selectedVal)) return null;
                    }
                    if (/一加|oneplus/i.test(brand)) {
                        const normalizeOneplus = (s) => s.toLowerCase().replace(/一加|oneplus/gi, '').replace(/\s+/g, '');
                        if (normalizeOneplus(officialModelClean) === normalizeOneplus(selectedVal)) return null;
                    }
                    if (/小米|Xiaomi|Redmi/i.test(brand) && category === '手机') {
                        const normalizeXiaomi = (s) => s.toLowerCase().replace(/小米|xiaomi|红米|redmi/gi, '').replace(/[（(]\s*[54]G\s*[）)]/gi, '').replace(/\s+/g, '');
                        if (normalizeXiaomi(officialModelClean) === normalizeXiaomi(selectedVal)) return null;
                    }
                    if (category === '手表' || category === '智能手表') {
                        const normalizeWatch = (s) => {
                            let t = s.toLowerCase();
                            t = t.replace(/小米|xiaomi|华为|huawei|红米|redmi/gi, '');
                            t = t.replace(/\|/g, ' ');
                            t = t.replace(/保时捷设计(款)?/g, '保时捷');
                            t = t.replace(/(保时捷)\s*(?=\1)/g, '');
                            t = t.replace(/[（(]\s*[54]G\s*[）)]/gi, '');
                            t = t.replace(/[（()）{}【】\[\]]/g, '');
                            t = t.replace(/\s*[款版]\s*/g, '');
                            t = t.replace(/\b\d+mm\b/gi, '');
                            t = t.replace(/\besim\b\s*版?/gi, '');
                            t = t.replace(/\s+/g, '');
                            return t;
                        };
                        if (normalizeWatch(officialModelClean) === normalizeWatch(selectedVal)) return null;
                    }

                    // 通用对比
                    const offNorm = normalizeModelForCompare(officialModelClean).toLowerCase();
                    const selNorm = normalizeModelForCompare(selectedVal).toLowerCase();
                    if (offNorm === selNorm) return null;

                    const displayModel = finalDisplayFallback(officialModelClean);
                    return `机型 应为【${displayModel}】，你选了【${selectedVal}】`;
                }
            },
        ],
        bannerStyle: `position:fixed; top:0; left:50%; transform:translateX(-50%); z-index:100000; background:#d93025; color:#fff; padding:8px 20px; font-size:0.5cm; font-weight:bold; text-align:center; border-radius:0 0 6px 6px; box-shadow:0 2px 12px rgba(0,0,0,0.35); white-space:nowrap;`,
        minOfficialLength: 30, maxRetries: 20, retryInterval: 500, bannerDuration: 120000,
    };

    // ========== 华为特殊型号解析 ==========
    function resolveHuaweiExpected(officialText, baseModel, type) {
        if (type === 'versioned') {
            const netVer = extractInfoLine(officialText, '网络版本');
            if (!netVer) return null;
            if (/5G/i.test(netVer)) {
                return `华为 ${baseModel}（5G）`;
            } else if (/4G/i.test(netVer)) {
                return `华为 ${baseModel}（4G）`;
            }
            return null;
        } else if (type === 'p50pro') {
            const desc = extractInfoLine(officialText, '产品描述');
            if (desc && desc.includes('典藏版')) {
                return '华为 P50 Pro 典藏版';
            }
            const netVer = extractInfoLine(officialText, '网络版本');
            if (netVer) {
                if (netVer.includes('麒麟9000')) {
                    return '华为 P50 Pro 麒麟版';
                } else if (netVer.includes('高通骁龙888')) {
                    return '华为 P50 Pro 骁龙版';
                }
            }
            return null;
        }
        return null;
    }

    // ========== 型号提取辅助函数 ==========
    function forceTruncateAtKeywords(raw) {
        const kw = [
            '零件描述', '颜色', '内存', '配置', '入网型号', '设备类型', '是否空中激活',
            '购买国家', '激活状态', '激活锁', '激活日期', 'SKU型号', 'skuId', '品牌',
            '供应型号', '支持网络', '是否激活', '维修记录', '华为官翻机', '官翻机',
            '官换机', '全成色', '成色', '网络锁', '国家版本', '是否自营渠道购买'
        ];
        for (const k of kw) { const i = raw.indexOf(k); if (i !== -1) return raw.substring(0, i).trim(); }
        return raw;
    }

    function cleanModelString(raw) {
        if (!raw) return '';
        const original = raw;
        // 去除 /WCDMA、64MB+、32MB+、8MB+
        raw = raw.replace(/\/WCDMA/gi, ' ');
        raw = raw.replace(/64MB\+/gi, ' ');
        raw = raw.replace(/32MB\+/gi, ' ');
        raw = raw.replace(/8MB\+/gi, ' ');
        raw = raw.replace(/\b(VIN|OBS|CELL),?\s*/gi, ' ');
        // 先吞掉 "WiFi版/WIFI版/Wi-Fi版"（含中间空格），避免留下孤立的 "版"
        raw = raw.replace(/(?:Wi-Fi|WIFI|WiFi|wifi)\s*版/gi, ' ');
        // 原有的 WiFi 各写法替换
        raw = raw.replace(/Wi-Fi\s*\+\s*移动网络/gi, ' ');
        raw = raw.replace(/\+ 移动网络/gi, ' ');
        raw = raw.replace(/Wi-Fi/gi, ' ');
        raw = raw.replace(/WIFI/gi, ' ');
        raw = raw.replace(/移动网络/gi, ' ');
        raw = raw.replace(/eSIM\s*版/gi, ' ').replace(/[（(]\s*LTE\s*[）)]/gi, ' ').replace(/[（(]\s*eSIM\s*[）)]/gi, ' ').replace(/[（(]\s*蓝牙\s*[）)]/gi, ' ').replace(/\bLTE\b/gi, ' ').replace(/\b(esim|eSim|lte|wifi|wi-fi)\b/gi, ' ');
        raw = raw.replace(/鸿蒙NEXT先锋版|先锋版|NEXT先锋版/gi, ' ');
        raw = raw.replace(/\b\d+mm\b/gi, ' ');
        raw = raw.replace(/\d+\s*(GB|TB)\s*\+\s*\d+\s*(GB|TB)/gi, ' ').replace(/\d+\s*(GB|TB)\s+\d+\s*(GB|TB)/gi, ' ').replace(/\d+\s*(GB|TB)\s*/gi, ' ');
        raw = raw.replace(/\d+(\.\d+)?\s*吋/gi, ' ');
        raw = raw.replace(/\s*星宇橙色\s*/gi, ' ').replace(/\s*钛金属\s*/gi, ' ');
        const colorPattern = /[\s]*(?:黑色|白色|蓝色|金色|银色|绿色|红色|紫色|灰色|粉色|棕色|曜石黑|亮黑色|星河银|魅影黑|雅黑色|月光白|星野黑|远峰蓝|苍岭绿|暗紫色|深空黑色|银色|金色|远峰蓝色|蓝色|绿色|红色|紫色|灰色|粉色|棕色|曜金黑|石墨烯•夜|大溪地灰|羽砂黑|翡冷翠|羽砂白|樱粉金|可可茶金|釉白色|丹霞橙|青山黛|赤茶橘|雪域白|月光香槟|星夜银|薄荷青|原色|沙漠色|雾|薰衣草|鼠尾草|黑配碳|白配银|珊瑚色|玫瑰金色|暗夜|海蓝色|远峰|深空)\s*/gi;
        raw = raw.replace(colorPattern, ' ');
        raw = raw.replace(/华为官翻机|官翻机|官换机/gi, ' ').replace(/全成色|成色/gi, ' ').replace(/\b激活锁\b/g, ' ');
        raw = raw.replace(/\s*素皮版\s*/g, ' ').replace(/\s*昆仑玻璃\s*/g, ' ').replace(/\s*三星商城专属颜色\s*/gi, ' ').replace(/\s*蓝牙版\s*/gi, ' ').replace(/\s*乐臻版\s*/gi, ' ').replace(/\s*小米折叠屏手机\s*/gi, ' ');
        raw = raw.replace(/[（(]\s*[54]G\s*[）)]/gi, ' ');
        raw = raw.replace(/\b[54]G\b/gi, ' ');
        raw = raw.replace(/全网通/gi, ' ');
        // 去除 AI版（含空格或不含空格）
        raw = raw.replace(/AI\s*版/gi, ' ');
        raw = raw.replace(/细闪|素皮|无充电器版|广东|陶瓷|冠军版深|虎年礼盒|龙鳞纤维版|公开版/gi, ' ');
        raw = raw.replace(/无线充|无线耳机|有线充|移动定制|联通定制|电信定制|艺术定制版|原神刻晴定制机|中文版|高配版|耳夹耳机|SIM卡版|艺术家联名版|二手机|真无线降噪耳机|开放式耳机|键盘式双面保护壳/gi, ' ');
        raw = raw.replace(/\(\s*USB-C\s*\)/gi, ' ');
        const fns = ['SKU型号', 'skuId', '品牌', '入网型号', '供应型号', '支持网络', '是否激活', '维修记录', '是否演示机', '是否官方二手机', '是否官翻机', '是否零售机', '是否购买了华为care', '是否空中激活', '激活日期', '国家版本', '是否在保', '保修模式', '保修结束日期', '是否官换机', '是否个性化定制', '屏幕尺寸', 'CPU', '商品属性', '是否自营渠道购买', '内存', '颜色', '零件描述'];
        for (const f of fns) { const i = raw.indexOf(f); if (i !== -1) { raw = raw.substring(0, i).trim(); break; } }
        raw = raw.replace(/[：:].*$/, '').replace(/[-\s]+$/, '').trim();
        raw = raw.replace(/\s+/g, ' ').trim();
        return raw || original.split(/[\s]+/).slice(0, 2).join(' ').trim();
    }

    function mapiPadModel(cleanedModel) {
        if (!cleanedModel) return null;
        const key = cleanedModel.toLowerCase().replace(/\s+/g, ' ').trim();
        if (iPadModelMapping[key]) return iPadModelMapping[key];
        const key2 = key.replace(/\bwifi\b|\bwi-fi\b|\b3g\b|\bcell\b|\bobs\b|\bvin\b/gi, '').replace(/\s+/g, ' ').trim();
        if (iPadModelMapping[key2]) return iPadModelMapping[key2];
        const parts = key.split(',');
        for (const part of parts) {
            const p = part.trim();
            if (iPadModelMapping[p]) return iPadModelMapping[p];
        }
        return null;
    }

    function extractOfficialModel(text, brand, category) {
        let modelMatch = null;
        if (/努比亚|Nubia|红魔|Redmagic/i.test(brand)) {
            modelMatch = text.match(/^机器名称[：:]\s*(.+)$/im) || text.match(/^机型名称[：:]\s*(.+)$/im);
        }
        if (!modelMatch) modelMatch = text.match(/^机型[：:]\s*(.+)$/im);
        if (!modelMatch) modelMatch = text.match(/^:?型号[：:]\s*(.+)$/im);
        if (modelMatch && modelMatch[1].trim()) {
            let raw = modelMatch[1].trim();
            if (/努比亚|Nubia|红魔|Redmagic/i.test(brand)) {
                raw = raw.replace(/\bNubia\b/gi, '努比亚').replace(/\bRed\s*Magic\b/gi, '红魔').replace(/\bREDMAGIC\b/gi, '红魔');
            }
            raw = forceTruncateAtKeywords(raw);
            if (/小米|Xiaomi|Redmi|红米/i.test(brand) && (category === '手表' || category === '智能手表')) {
                const mmTrunc = raw.match(/^(.+?\d+\s*mm)/i);
                if (mmTrunc) raw = mmTrunc[1];
            }
            raw = cleanModelString(raw);
            if (/苹果|Apple/i.test(brand) && (category === '手表' || category === '智能手表')) {
                raw = cleanAppleWatchModel(raw);
            }
            if (/OPPO/i.test(brand) && (category === '手表' || category === '智能手表')) {
                raw = raw.replace(/ECG版|理想汽车定制版|名侦探柯南限定版|精钢版|故宫新禧版|英雄联盟限定版|EVA限定版|NFC版|高尔夫定制版|MG汽车定制版/gi, ' ').replace(/\s+/g, ' ').trim();
            }
            if (/三星|Samsung/i.test(brand) && (category === '手表' || category === '智能手表')) {
                raw = raw.replace(/Bespoke\s*蓝牙\/?/gi, ' ').replace(/\s*版\s*/gi, ' ').replace(/\s+/g, ' ').trim();
            }
            if (/三星|Samsung/i.test(brand) && (category === '平板' || category === '平板电脑' || category === 'Pad')) {
                raw = raw.replace(/盖乐世/gi, 'Galaxy').replace(/WLAN/gi, ' ').replace(/[（(]\s*[）)]/gi, ' ').replace(/3G版/gi, ' ').replace(/\s+/g, ' ').trim();
            }
            if (/联想|Lenovo/i.test(brand) && (category === '平板' || category === '平板电脑' || category === 'Pad')) {
                raw = raw.replace(/[（(][^）)]*[）)]/gi, ' ').replace(/\s+/g, ' ').trim();
            }
            if (/小米|Xiaomi|Redmi|红米/i.test(brand)) {
                raw = raw.replace(/双卫星通信|3\.2GHz|12\.4|12\.5/gi, ' ').replace(/\s+/g, ' ').trim();
            }
            return raw || null;
        }
        return null;
    }

    function extractOfficialModelShort(text, brand, category) {
        return extractOfficialModel(text, brand, category);
    }

    function finalDisplayFallback(str) { return str && str.length > 0 ? str : '型号未提取到'; }

    // ========== 页面原始文本获取 ==========
    function getPageText() {
        for (const s of CONFIG.areaSelectors) {
            const e = document.querySelector(s);
            if (e && e.textContent.trim().length >= CONFIG.minOfficialLength) return e.textContent.trim();
        }
        return '';
    }

    // ========== 表格解析 (用于IMEI表格，使用唯一ID) ==========
    function parseTableToText(tableEl) {
        const rows = tableEl.querySelectorAll('tr');
        let text = '';
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length === 2) {
                const field = cells[0].textContent.trim();
                const value = cells[1].textContent.trim();
                if (field && value) text += `${field}: ${value}\n`;
            }
        });
        return text.trim();
    }

    function findOfficialTableContainer() {
        if (tableVirtualContainer && document.contains(tableVirtualContainer)) {
            return tableVirtualContainer;
        }
        // IMEI 表格仅当页面含"保修机"时才启用
        const bodyText = document.body.textContent || '';
        if (/物品30天内在库质检报告/.test(bodyText) && !/保修机/.test(bodyText)) {
            return null;
        }
        const tables = document.querySelectorAll('table');
        for (const table of tables) {
            const cells = table.querySelectorAll('td');
            let hasModel = false, hasColor = false;
            cells.forEach(cell => {
                const text = cell.textContent.trim();
                if (text === '机型') hasModel = true;
                if (text === '颜色') hasColor = true;
            });
            if (hasModel && hasColor) {
                const formattedText = parseTableToText(table);
                if (formattedText.length >= CONFIG.minOfficialLength) {
                    const container = document.createElement('div');
                    container.id = 'model-official-table-container';
                    container.style.display = 'none';
                    container.textContent = formattedText;
                    document.body.appendChild(container);
                    tableVirtualContainer = container;
                    return container;
                }
            }
        }
        return null;
    }

    function createVirtualContainer(text) {
        let container = document.getElementById('model-virtual-official-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'model-virtual-official-container';
            container.style.display = 'none';
            document.body.appendChild(container);
        }
        container.textContent = text;
        return container;
    }

    // ========== 获取最新信息的统一入口 ==========
    function getOfficialText() {
        const now = Date.now();

        const currentPage = getPageText();
        if (currentPage && currentPage !== pageText) {
            pageText = currentPage;
            pageTime = now;
        }

        const tableContainer = findOfficialTableContainer();
        if (tableContainer) {
            const tableText = tableContainer.textContent.trim();
            if (tableText && tableText !== imeiTableText) {
                imeiTableText = tableText;
                imeiTableTime = now;
            }
        } else {
            if (imeiTableText) {
                imeiTableText = null;
                imeiTableTime = 0;
            }
        }

        // 剪贴板优先
        if (clipboardText && clipboardText.length >= CONFIG.minOfficialLength) {
            return clipboardText.trim();
        }

        const sources = [
            { text: pageText, time: pageTime },
            { text: clipboardText, time: clipboardTime },
            { text: imeiTableText, time: imeiTableTime }
        ];

        let best = null;
        for (const src of sources) {
            if (src.text && src.text.length >= CONFIG.minOfficialLength) {
                if (!best || src.time > best.time) {
                    best = src;
                }
            }
        }

        return best ? best.text : '';
    }

    function getInputValueByLabel(lbl) {
        if (lbl === '机型' || lbl === '品牌' || lbl === '品类') {
            const ls = document.querySelectorAll('.el-form-item__label');
            for (const l of ls) {
                if (l.textContent.trim() === lbl) {
                    const inp = l.nextElementSibling?.querySelector('.el-input__inner');
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
        if (modelSelections[lbl]) return modelSelections[lbl];
        const ls = document.querySelectorAll('.el-form-item__label');
        for (const l of ls) {
            if (l.textContent.trim() === lbl) {
                const inp = l.nextElementSibling?.querySelector('.el-input__inner');
                return inp ? inp.value.trim() : '';
            }
        }
        return '';
    }

    function getSelectedValue(kw) {
        const ls = document.querySelectorAll('.el-form-item__label');
        for (const l of ls) {
            if (kw.some(k => l.textContent.trim() === k || l.textContent.trim().startsWith(k + '：') || l.textContent.trim().includes(k))) {
                const a = l.nextElementSibling?.querySelector('.el-radio-button.is-active .el-radio-button__inner');
                if (a) return a.textContent.replace(/准新品|99新|95新|9新|7新及以下/g, '').trim();
            }
        }
        return '';
    }

    // ========== 横幅管理 ==========
    let bannerEl = null, bannerTimer = null;
    function showBanner(errs) {
        if (!errs.length) return hideBanner();
        if (!bannerEl) {
            bannerEl = document.createElement('div');
            bannerEl.style = CONFIG.bannerStyle;
            document.body.appendChild(bannerEl);
            bannerTimer = setTimeout(hideBanner, CONFIG.bannerDuration);
        }
        bannerEl.innerHTML = '⚠️ ' + errs.join('；');
    }
    function hideBanner() {
        if (bannerEl) { bannerEl.remove(); bannerEl = null; }
        clearTimeout(bannerTimer);
    }

    function resetAllSources() {
        pageText = null;
        pageTime = 0;
        clipboardText = null;
        clipboardTime = 0;
        imeiTableText = null;
        imeiTableTime = 0;
        tableVirtualContainer = null;
        const v = document.getElementById('model-virtual-official-container');
        if (v) v.remove();
        const t = document.getElementById('model-official-table-container');
        if (t) t.remove();
        hideBanner();
    }

    function checkPageSwitch() {
        const currentPage = getPageText();
        if (lastPageText !== null && currentPage !== lastPageText && currentPage.length > 0) {
            resetAllSources();
        }
        lastPageText = currentPage;
    }

    let retryCount = 0;
    function checkModel(force = false) {
        try {
            checkPageSwitch();
            const txt = getOfficialText();
            if (!txt || txt.length < CONFIG.minOfficialLength) {
                if (force && retryCount < CONFIG.maxRetries) {
                    retryCount++;
                    setTimeout(() => checkModel(true), CONFIG.retryInterval);
                } else hideBanner();
                return;
            }
            retryCount = 0;
            const brand = getInputValueByLabel('品牌');
            const category = getInputValueByLabel('品类');
            // 品牌或品类为空时等待异步渲染完成
            if (force && (!brand || !category) && retryCount < CONFIG.maxRetries) {
                retryCount++;
                setTimeout(() => checkModel(true), CONFIG.retryInterval);
                return;
            }
            retryCount = 0;
            const errs = [];
            let hasSelection = false;
            for (const it of CONFIG.items) {
                let sel = it.selectedFn ? it.selectedFn() : getSelectedValue(it.labelKeywords);
                if (!sel || /不检测|不涉及|跳过/i.test(sel)) continue;
                hasSelection = true;
                const e = it.customCheck(txt, sel);
                if (e) errs.push(e);
            }
            if (hasSelection) {
                errs.length > 0 ? showBanner(errs) : hideBanner();
            }
        } catch (e) {
            console.error('[型号] checkModel 异常:', e);
        }
    }

    // ========== 监听另一个脚本的"读取剪贴板"按钮 ==========
    function watchClipboardButton() {
        document.addEventListener('click', async (e) => {
            const btn = e.target.closest('button');
            if (btn && /读取剪贴板/.test(btn.textContent)) {
                console.log('[型号脚本] 检测到剪贴板按钮点击');
                let text = '';
                try {
                    text = await Promise.race([
                        new Promise((resolve, reject) => {
                            if (typeof GM_getClipboard === 'undefined') return reject(new Error('GM_getClipboard 不可用'));
                            GM_getClipboard((clipText) => {
                                clipText ? resolve(clipText) : reject(new Error('GM_getClipboard 为空'));
                            });
                        }),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('GM_getClipboard 超时')), 500))
                    ]);
                } catch {
                    try {
                        text = await navigator.clipboard.readText();
                    } catch {
                        console.error('[型号脚本] 读取剪贴板失败');
                        return;
                    }
                }
                if (text && text.trim().length >= CONFIG.minOfficialLength) {
                    clipboardText = text.trim();
                    clipboardTime = Date.now();
                    retryCount = 0;
                    checkModel(true);
                    showTempMsg('型号脚本已读取剪贴板');
                } else {
                    console.warn('[型号脚本] 剪贴板内容太短');
                }
            }
        });
    }

    function watchStartDetectionButton() {
        document.addEventListener('click', function(e) {
            const target = e.target.closest('button');
            if (target && target.textContent.includes('开始检测')) {
                console.log('[型号脚本] 检测到"开始检测"按钮点击，清空所有数据源');
                resetAllSources();
                setTimeout(() => checkModel(true), 1500);
            }
        }, true);
    }

    // ========== 监听"提交"按钮 ==========
    function watchSubmitButton() {
        document.addEventListener('click', function(e) {
            const target = e.target.closest('button');
            if (target && target.textContent.includes('提交')) {
                console.log('[型号脚本] 检测到"提交"按钮点击，清空所有数据源');
                resetAllSources();
                setTimeout(() => checkModel(true), 1500);
            }
        }, true);
    }

    function showTempMsg(msg) {
        const div = document.createElement('div');
        div.textContent = msg;
        div.style.cssText = 'position:fixed; top:50px; right:10px; z-index:100001; padding:6px 10px; background:#333; color:#fff; border-radius:4px; font-size:12px;';
        document.body.appendChild(div);
        setTimeout(() => div.remove(), 2000);
    }

    // ========== 初始化 ==========
    resetAllSources();
    watchClipboardButton();
    watchStartDetectionButton();
    watchSubmitButton();
    setTimeout(() => { syncAllSelects(); checkModel(true); }, 2000);

    let modelCheckTimer = null;
    const obs = new MutationObserver(() => {
        clearTimeout(modelCheckTimer);
        modelCheckTimer = setTimeout(() => { try { checkModel(true); } catch (e) { console.error('[型号] observer checkModel 异常:', e); } }, 300);
    });
    if (document.body) {
        obs.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class', 'aria-checked'] });
    }
    window.addEventListener('unload', () => {
        obs.disconnect();
        clearTimeout(modelCheckTimer);
    });
    window.addEventListener('load', () => setTimeout(() => { try { checkModel(true); } catch (e) { console.error('[型号] load checkModel 异常:', e); } }, 800));
})();
