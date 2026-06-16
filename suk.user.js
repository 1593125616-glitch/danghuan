// ==UserScript==
// @name         质检选项核对横幅（全品类+剪贴板+保修区间+渠道规则）
// @namespace    http://tampermonkey.net/
// @version      1.7.73
// @description  颜色、存储容量、购买渠道、保修状态、激活状态、网络制式、型号、激活锁检测
// @author       py1998
// @match        https://yihuan.oppoer.me/*
// @match        http://yihuan.oppoer.me/static/*
// @grant        GM_getClipboard
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      cdn.jsdelivr.net
// @updateURL    https://cdn.jsdelivr.net/gh/1593125616-glitch/danghuan@main/suk.user.js
// @downloadURL  https://cdn.jsdelivr.net/gh/1593125616-glitch/danghuan@main/suk.user.js
// ==/UserScript==

(function() {
    'use strict';

    // ==================== 下拉框选中值收集模块 ====================
    const selections = {};
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
                if (text && text.length > 0 && text.length < 20) {
                    label = text;
                    break;
                }
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
        for (const key in selections) {
            delete selections[key];
        }
        Object.assign(selections, newSelections);
        window.dropdownSelections = selections;
    }

    function scheduleSync() {
        if (syncTimer) clearTimeout(syncTimer);
        syncTimer = setTimeout(syncAllSelects, 300);
    }

    document.addEventListener('click', function(e) {
        const option = e.target.closest('.el-select-dropdown__item');
        if (!option) return;
        const dropdown = option.closest('.el-select-dropdown');
        if (!dropdown) return;
        const selectEl = dropdown.closest('.el-select');
        if (!selectEl) return;
        scheduleSync();
    }, true);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(syncAllSelects, 1500);
        });
    } else {
        setTimeout(syncAllSelects, 1500);
    }

    window.dropdownSelections = selections;
    window.syncDropdownSelections = syncAllSelects;

    // ==================== 华为手表颜色规则 ====================
    const huaweiWatchColorRules = [
        // 硬性颜色规则（查询颜色包含"/"的精确映射）
        { keywords: ['曜石黑', '黑色氟橡胶表带'], expected: '曜石黑' },
        { keywords: ['银河紫', '紫色航天级钛合金表壳', '紫色素皮复合表带'], expected: '银河紫' },
        { keywords: ['钛空银', '航天级钛合金表壳', '钛金属表带'], expected: '钛空银' },
        { keywords: ['苍穹黑', '深锖色不锈钢表壳', '黑色氟橡胶表带'], expected: '苍穹黑' },
        { keywords: ['CF碳纤维红', '红色碳纤维表壳', 'CF专属红色氟橡胶表带'], expected: '朱红' },
        { keywords: ['砂砾棕', '棕色真皮表带'], expected: '砂砾棕' },
        { keywords: ['钢色不锈钢表壳', '咖色真皮表带'], expected: '钢色' },
        { keywords: ['凝霜白', '白色真皮表带'], expected: '凝霜白' },
        { keywords: ['草木绿', '绿色氟橡胶表带'], expected: '草木绿' },
        { keywords: ['山茶棕', '棕色真皮表带'], expected: '山茶棕' },
        { keywords: ['珍珠白', '白色复合素皮表带'], expected: '珍珠白' },
        { keywords: ['苍山灰', '灰色氟橡胶表带'], expected: '苍山灰' },
        { keywords: ['托帕蓝', '蓝色复合编织表带'], expected: '托帕蓝' },
        { keywords: ['冰晶蓝', '蓝色氟橡胶表带'], expected: '冰晶蓝' },
        { keywords: ['冰川白', '白色氟橡胶表带'], expected: '冰川白' },
        // 原有组合规则
        { keywords: ['航天级钛合金表壳', '钛金属表带'], expected: '火星钛' },
        { keywords: ['航天级钛合金表壳', '深棕色真皮表带'], expected: '木星棕' },
        { keywords: ['蓝色航天级钛合金表壳', '蓝色复合表带'], expected: '蔚蓝地球' },
        { keywords: ['黑色不锈钢表壳', '黑色氟橡胶表带'], expected: '幻月黑' },
        { keywords: ['钛灰色', '钛金属表带'], expected: '钛灰色' },
        { keywords: ['钢色', '棕色真皮表带'], expected: '钢色' },
        { keywords: ['钢色', '灰蓝尼龙表带'], expected: '钢色' },
        { keywords: ['钢色', '不锈钢金属表带'], expected: '钢色' },
        { keywords: ['黑色', '黑色氟橡胶表带'], expected: '黑色' },
        { keywords: ['钛金属', '浅钛色钛金属表壳', '黑色氟橡胶表带'], expected: '黑色' },
        { keywords: ['钛金属', '浅钛色钛金属表壳', '浅钛金属表带'], expected: '灰色' },
        { keywords: ['钛灰色', '棕色真皮表带'], expected: ['灰色', '钛色'] },
        { keywords: ['黑色钛金属表壳', '黑色表带'], expected: '黑色' },
        { keywords: ['幻夜黑', '黑色氟橡胶表带'], expected: '幻夜黑' },
        { keywords: ['钛金属', '浅钛色钛金属表壳', '灰色真皮表带'], expected: '灰色' },
        { keywords: ['不锈钢表壳', '褐色真皮表带'], expected: '土星褐' }
    ];

    let pageOfficialText = null;
    let pageUpdateTime = 0;
    let clipboardOfficialText = null;
    let clipboardUpdateTime = 0;
    let tableVirtualContainer = null;

    function extractField(text, fieldName) {
        const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`^[ \\t]*${escaped}[：:：][ \\t]*(.+)$`, 'im');
        const m = text.match(regex);
        return m ? m[1].trim() : '';
    }

    function parseDateLocal(dateStr) {
        if (!dateStr) return null;
        const clean = dateStr.replace(/年/g, '-').replace(/月/g, '-').replace(/日/g, '').replace(/\//g, '-').trim();
        const parts = clean.split('-');
        if (parts.length === 3) {
            const year = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1;
            const day = parseInt(parts[2], 10);
            if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
                return new Date(year, month, day);
            }
        }
        return null;
    }

    const CONFIG = {
        areaSelectors: ['.yabao-report-detail', '.report-info', '.info-content', '.right-info'],
        items: [
            {
                name: '颜色',
                labelKeywords: ['颜色', '机身颜色', '配色', '表壳外观'],
                customCheck: (officialText, selectedVal) => {
                    const brand = getInputValueByLabel('品牌');
                    const category = getInputValueByLabel('品类');
                    const normalize = s => s.replace(/曜/g, '耀').trim();
                    const normalizedSelected = normalize(selectedVal);

                    let officialColor = getOfficialColorFromDOM(officialText);
                    if (!officialColor) {
                        if (/苹果|Apple/i.test(brand)) {
                            const modelLineRegex = /(?:^[：:]*型号[：:]\s*)(.+)$/im;
                            const modelMatch = officialText.match(modelLineRegex);
                            if (modelMatch) {
                                const modelContent = modelMatch[1].trim();
                                const colorKeywords = [
                                    '深空灰色', '暗紫色', '星光色', '午夜色', '远峰蓝', '苍岭绿',
                                    '石墨色', '海蓝色', '天峰蓝', '红色', '蓝色', '绿色', '紫色',
                                    '黄色', '白色', '黑色', '粉色', '金色', '银色', '星宇橙色',
                                    '原色钛金属', '沙漠钛金属', '苍井绿色', '深蓝色', '苍岭绿色',
                                    '深紫色', '墨绿色', '珊瑚色', '亮黑色', '中国红'
                                ];
                                for (const ck of colorKeywords) {
                                    if (modelContent.includes(ck)) {
                                        officialColor = ck;
                                        break;
                                    }
                                }
                                if (!officialColor && selectedVal) {
                                    if (modelContent.toLowerCase().includes(normalizedSelected.toLowerCase())) {
                                        return null;
                                    } else {
                                        return `颜色 在型号信息中未找到所选颜色"${selectedVal}"，可能选错`;
                                    }
                                }
                            }
                        }
                        // 小米/红米手机：无颜色行时，用选中的颜色在型号和产品描述中搜索
                        if (!officialColor && /小米|Redmi|红米/i.test(brand) && category === '手机') {
                            const modelField = extractField(officialText, '型号');
                            const descField = extractField(officialText, '产品描述');
                            const searchTarget = (modelField + ' ' + descField).toLowerCase();
                            if (searchTarget.includes(normalizedSelected.toLowerCase())) {
                                return null;
                            } else {
                                return `颜色 在型号和产品描述中未找到所选颜色"${selectedVal}"，可能选错`;
                            }
                        }
                    }
                    if (!officialColor) return null;

                    const breakKeywords = ['内存', '产品描述', '网络制式', '型号', '品牌', '购买渠道', '存储容量', '容量', '激活状态', '保修'];
                    for (const kw of breakKeywords) {
                        const idx = officialColor.indexOf(kw);
                        if (idx > 0) {
                            officialColor = officialColor.substring(0, idx).trim();
                            break;
                        }
                    }

                    // 华为手表/手环颜色规则：仅当品类为智能手表或智能手环且品牌为华为时生效
                    if (/华为/i.test(brand) && (category === '智能手表' || category === '智能手环') && !/^(提示|关闭|提示关|提示关闭)$/i.test(officialColor)) {
                        const normalizedOfficial = officialColor.replace(/\s+/g, '');
                        for (const rule of huaweiWatchColorRules) {
                            const allPresent = rule.keywords.every(kw => normalizedOfficial.includes(kw));
                            if (allPresent) {
                                const expected = rule.expected;
                                const normalizedSelected = selectedVal.replace(/\s+/g, '');
                                const isCorrect = Array.isArray(expected)
                                    ? expected.some(e => e.replace(/\s+/g, '') === normalizedSelected)
                                    : expected.replace(/\s+/g, '') === normalizedSelected;
                                if (!isCorrect) {
                                    const expectedStr = Array.isArray(expected) ? expected.join('或') : expected;
                                    return `颜色 应为【${expectedStr}】，你选了【${selectedVal}】`;
                                }
                                return null;
                            }
                        }
                        return null;
                    }

                    // OPPO平板颜色规则：官方颜色含"银色(联名版定制外观)"，系统需选"艺术家限量定制版"
                    if (/OPPO/i.test(brand) && /平板/.test(category) && /银色.*联名版.*定制外观|联名版.*定制外观/i.test(officialColor)) {
                        const expected = '艺术家限量定制版';
                        if (selectedVal.replace(/\s+/g, '') !== expected.replace(/\s+/g, '')) {
                            return `颜色 应为【${expected}】，你选了【${selectedVal}】`;
                        }
                        return null;
                    }

                    if (brand === '荣耀') {
                        const skuMatch = officialText.match(/SKU型号[：:]\s*(.+?)(?:\n|$)/i);
                        if (skuMatch) {
                            if (normalize(skuMatch[1].trim()).includes(normalizedSelected)) return null;
                            return `颜色 在SKU型号中未找到"${selectedVal}"，可能选错`;
                        }
                    }

                    // Apple 笔记本：灰色 → 深空灰
                    if (/苹果|Apple/i.test(brand) && (category === '笔记本' || category === '电脑') && /^灰色$/i.test(officialColor)) {
                        if (normalizedSelected !== '深空灰') {
                            return `颜色 应为【深空灰】（官方为灰色），你选了【${selectedVal}】`;
                        }
                        return null;
                    }

                    // 小米智能手表：薄荷绿 兼容 绿色
                    if (/小米|Redmi|红米/i.test(brand) && category === '智能手表' && /薄荷绿/i.test(officialColor)) {
                        if (/^(绿色|薄荷绿)$/.test(normalizedSelected)) return null;
                        return `颜色 应为【薄荷绿或绿色】（官方为薄荷绿），你选了【${selectedVal}】`;
                    }

                    // 一加 Ace 3 原神刻晴定制机：颜色必须选"原神刻晴定制机"
                    if (/一加|OnePlus/i.test(brand) && /原神刻晴定制机/i.test(officialText)) {
                        if (normalizedSelected !== '原神刻晴定制机') {
                            return `颜色 应为【原神刻晴定制机】（该机型为定制版），你选了【${selectedVal}】`;
                        }
                        return null;
                    }

                    if (!/^(提示|关闭|提示关|提示关闭)$/i.test(officialColor)) {
                        const normOff = normalize(officialColor);
                        const normSel = normalizedSelected;
                        // 防止复合颜色名子串误匹配，例如"玫瑰金色"包含"金色"
                        const compoundColors = ['玫瑰金', '粉红', '亮黑', '中国红', '深空灰', '星光色', '午夜色', '远峰蓝', '苍岭绿', '暗紫', '石墨', '海蓝', '天峰蓝', '星宇橙'];
                        let isFP = false;
                        for (const cc of compoundColors) {
                            const selCore = normSel.replace(/色$/g, '');
                            if (normOff.includes(cc) && cc !== normSel && cc !== selCore && selCore && cc.includes(selCore)) {
                                isFP = true;
                                break;
                            }
                        }
                        if (!isFP && (normOff.includes(normSel) || normSel.includes(normOff))) return null;
                        return `颜色 应为【${officialColor}】，你选了【${selectedVal}】`;
                    }

                    if (/华为/i.test(brand)) {
                        const skuMatch = officialText.match(/SKU型号[：:]\s*(.+?)(?:\n|$)/i);
                        if (skuMatch) {
                            if (normalize(skuMatch[1].trim()).includes(normalizedSelected)) return null;
                            return `颜色 在SKU型号中未找到"${selectedVal}"，可能选错`;
                        }
                    }
                    return null;
                }
            },
            {
                name: '存储容量',
                labelKeywords: ['存储容量', '存储', '内存', '容量'],
                customCheck: (officialText, selectedVal) => {
                    const brand = getInputValueByLabel('品牌');
                    const category = getInputValueByLabel('品类');
                    if (category === '笔记本' || category === '电脑') return null;
                    if (/魅族|Meizu/i.test(brand)) return null;
                    function normalizeStorage(str) {
                        const comboMatch = str.match(/^(\d+)\s*(GB|G|TB|T)?\s*\+\s*(\d+)\s*(GB|G|TB|T)?$/i);
                        if (comboMatch) {
                            let u1 = (comboMatch[2] || 'GB').toUpperCase().replace(/^G$/, 'GB').replace(/^T$/, 'TB');
                            let u2 = (comboMatch[4] || 'GB').toUpperCase().replace(/^G$/, 'GB').replace(/^T$/, 'TB');
                            return comboMatch[1] + u1 + '+' + comboMatch[3] + u2;
                        }
                        const spaceMatch = str.match(/^(\d+)\s*(GB|G|TB|T)?\s+(\d+)\s*(GB|G|TB|T)?$/i);
                        if (spaceMatch) {
                            let u1 = (spaceMatch[2] || 'GB').toUpperCase().replace(/^G$/, 'GB').replace(/^T$/, 'TB');
                            let u2 = (spaceMatch[4] || 'GB').toUpperCase().replace(/^G$/, 'GB').replace(/^T$/, 'TB');
                            return spaceMatch[1] + u1 + '+' + spaceMatch[3] + u2;
                        }
                        const singleMatch = str.match(/^(\d+)\s*(GB|G|TB|T)$/i);
                        if (singleMatch) {
                            let u = (singleMatch[2] || 'GB').toUpperCase().replace(/^G$/, 'GB').replace(/^T$/, 'TB');
                            return singleMatch[1] + u;
                        }
                        return str.replace(/\s+/g, '').replace(/(\d+)G(?!B)/gi, '$1GB').replace(/(\d+)T(?!B)/gi, '$1TB');
                    }

                    // 优先从"容量:"字段提取
                    const capField = extractField(officialText, '容量') || extractField(officialText, '存储容量');
                    if (capField && !/定制内存|样机内存/i.test(capField)) {
                        const normalizedField = normalizeStorage(capField);
                        const stdSelected = normalizeStorage(selectedVal);
                        if (normalizedField.toLowerCase() === stdSelected.toLowerCase()) return null;
                        // 选中值是单个容量（如512G）且官方是组合值（如12GB+512GB）时，匹配组合中一部分则不提示
                        const f = normalizedField.toLowerCase(), s = stdSelected.toLowerCase();
                        if (!s.includes('+') && f.includes('+')) {
                            const parts = f.split('+');
                            if (parts.some(p => p.trim() === s)) return null;
                        }
                        return `存储容量 应为【${capField}】，你选了【${selectedVal}】`;
                    }

                    let stdSelected = normalizeStorage(selectedVal);
                    const capacityRegex = /(\d+)\s*(GB|G|TB|T)?\s*\+\s*(\d+)\s*(GB|G|TB|T)?/gi;
                    let capMatch;
                    while ((capMatch = capacityRegex.exec(officialText)) !== null) {
                        const found = capMatch[0];
                        const normalized = normalizeStorage(found);
                        if (normalized.toLowerCase() === stdSelected.toLowerCase()) return null;
                    }
                    const singleRegex = /\b(\d+)\s*(GB|G|TB|T)\b/gi;
                    while ((capMatch = singleRegex.exec(officialText)) !== null) {
                        const found = capMatch[0];
                        const normalized = normalizeStorage(found);
                        if (normalized.toLowerCase() === stdSelected.toLowerCase()) return null;
                    }
                    const variants = [stdSelected, stdSelected.replace('+', ' ')];
                    if (variants.some(v => officialText.toLowerCase().includes(v.toLowerCase()))) return null;
                    return `存储容量 在官方信息中未找到"${selectedVal}"，可能选错`;
                }
            },
            {
                name: '购买渠道',
                labelKeywords: ['购买渠道', '渠道', '国家版本', '销售地区'],
                customCheck: (officialText, selectedVal) => {
                    const getField = (name) => extractField(officialText, name);
                    const brand = getInputValueByLabel('品牌');
                    const isApple = /苹果|Apple/i.test(brand);
                    const model = getInputValueByLabel('机型') || getField('型号');

                    // 是否国行: 无 时跳过检测
                    const domesticCheck = getField('版本类型') || getField('是否国行');
                    if (domesticCheck === '无') return null;

                    if (isApple) {
                        let isDomestic = getField('版本类型');
                        if (!isDomestic) isDomestic = getField('是否国行');
                        if (!isDomestic) return null;

                        // Apple 笔记本：仅检测 大陆国行 / 非国行
                        const category = getInputValueByLabel('品类');
                        if (category === '笔记本' || category === '电脑') {
                            const expected = isDomestic === '国行' ? '大陆国行' : '非国行';
                            if (selectedVal !== expected)
                                return `购买渠道 应为【${expected}】，你选了【${selectedVal}】`;
                            return null;
                        }

                        const machineType = getField('机器类型');
                        const networkLock = getField('网络锁状态');
                        let expected = '';

                        const getExpectedForRegion = (regionText, availableOptions) => {
                            if (regionText === '美国' || regionText === '美版') {
                                const hasUSOpts = availableOptions.includes('美版-无锁') || availableOptions.includes('美版-有锁');
                                const hasNonCNOpts = availableOptions.includes('非大陆国行-无锁') || availableOptions.includes('非大陆国行-有锁');

                                if (hasUSOpts) {
                                    if (networkLock.includes('无锁')) return '美版-无锁';
                                    if (networkLock.includes('有锁')) return '美版-有锁';
                                    return ['美版-无锁', '美版-有锁'];
                                } else if (hasNonCNOpts) {
                                    if (networkLock.includes('无锁')) return '非大陆国行-无锁';
                                    if (networkLock.includes('有锁')) return '非大陆国行-有锁';
                                    return ['非大陆国行-无锁', '非大陆国行-有锁'];
                                } else {
                                    return '非国行';
                                }
                            }

                            if (regionText === '中国香港' || regionText === '中国台湾') {
                                return '港澳台版';
                            }

                            const hasNonCNOpts = availableOptions.includes('非大陆国行-无锁') || availableOptions.includes('非大陆国行-有锁');
                            if (hasNonCNOpts) {
                                if (networkLock.includes('无锁')) return '非大陆国行-无锁';
                                if (networkLock.includes('有锁')) return '非大陆国行-有锁';
                                return ['非大陆国行-无锁', '非大陆国行-有锁'];
                            }
                            return '非国行';
                        };

                        if (isDomestic === '国行') {
                            expected = '大陆国行';
                            if (machineType.includes('BS资源机')) expected = '资源机-国行';
                            else if (machineType.includes('展示机')) expected = '展示机-国行';
                            else if (machineType.includes('官换机')) expected = '官换机-国行';
                            else if (machineType.includes('官翻机')) expected = '官修机-国行';
                            else if (machineType.includes('权益机')) expected = '权益机';
                        } else if (isDomestic.includes('非国行')) {
                            const regionMatch = isDomestic.match(/^(.+?)\s*[（(]非国行[）)]/);
                            const regionText = regionMatch ? regionMatch[1].trim() : '';
                            const availableOptions = getAvailableOptions('购买渠道');
                            expected = getExpectedForRegion(regionText, availableOptions);
                        } else {
                            const regionText = isDomestic;
                            const availableOptions = getAvailableOptions('购买渠道');
                            expected = getExpectedForRegion(regionText, availableOptions);
                        }

                        if (expected) {
                            // Apple Watch: 非国行 → 非大陆国行
                            if (/苹果|Apple/i.test(brand)) {
                                const watchCategory = getInputValueByLabel('品类');
                                if (watchCategory === '智能手表' || watchCategory === '手表') {
                                    if (expected === '非国行') expected = '非大陆国行';
                                }
                            }
                            let match = false;
                            if (Array.isArray(expected)) {
                                match = expected.includes(selectedVal);
                            } else {
                                match = (selectedVal === expected);
                            }
                            if (!match) {
                                const expectedStr = Array.isArray(expected) ? expected.join(' 或 ') : expected;
                                return `购买渠道 应为【${expectedStr}】，你选了【${selectedVal}】`;
                            }
                        }
                    } else {
                        const purchaseChannel = getField('购买渠道');
                        if (purchaseChannel) {
                            if (selectedVal === purchaseChannel) return null;
                            else return `购买渠道 应为【${purchaseChannel}】，你选了【${selectedVal}】`;
                        }

                        // 三星手机购买渠道检测
                        if (/三星|Samsung/i.test(brand)) {
                            const samsungCategory = getInputValueByLabel('品类');
                            if (samsungCategory === '手机') {
                                let isDomestic = getField('是否国行');
                                if (isDomestic && isDomestic !== '无' && isDomestic.trim() !== '') {
                                    if (isDomestic === '国行') {
                                        const machineType = getField('机器类型');
                                        if (machineType && /演示机/i.test(machineType)) {
                                            if (selectedVal !== '演示机')
                                                return `购买渠道 应为【演示机】（机器类型含演示机），你选了【${selectedVal}】`;
                                            return null;
                                        }
                                    }
                                    if (/中国香港版（非国行）|中国台湾版（非国行）/.test(isDomestic)) {
                                        if (selectedVal !== '港澳台版')
                                            return `购买渠道 应为【港澳台版】（${isDomestic}），你选了【${selectedVal}】`;
                                        return null;
                                    }
                                    if (isDomestic !== '国行') {
                                        if (selectedVal !== '非国行')
                                            return `购买渠道 应为【非国行】（${isDomestic}），你选了【${selectedVal}】`;
                                        return null;
                                    }
                                }
                            }
                        }

                        // 小米/红米：国行或购买地点为 China 时，检测是否展示机
                        if (/小米|Redmi|红米/i.test(brand)) {
                            const miIsDomestic = getField('是否国行');
                            const miPurchaseLocation = getField('购买地点');
                            if ((!miIsDomestic || miIsDomestic === '国行') && miPurchaseLocation === 'China') {
                                const isShowMachine = getField('是否展示机');
                                if (isShowMachine === '是') {
                                    if (selectedVal !== '演示机')
                                        return `购买渠道 应为【演示机】（是否展示机：是），你选了【${selectedVal}】`;
                                    return null;
                                }
                            }
                        }

                        // 联想平板购买渠道检测（通过版本字段）
                        if (/联想|Lenovo/i.test(brand)) {
                            const lenovoCategory = getInputValueByLabel('品类');
                            if (lenovoCategory === '平板' || lenovoCategory === '平板电脑' || lenovoCategory === 'Pad') {
                                const versionField = getField('版本');
                                if (versionField && versionField.trim() !== '') {
                                    if (/国行/i.test(versionField)) {
                                        if (selectedVal !== '大陆国行')
                                            return `购买渠道 应为【大陆国行】（版本：${versionField}），你选了【${selectedVal}】`;
                                    } else {
                                        if (selectedVal !== '非国行')
                                            return `购买渠道 应为【非国行】（版本：${versionField}），你选了【${selectedVal}】`;
                                    }
                                    return null;
                                }
                            }
                        }

                        let isDomestic = getField('是否国行');
                        // 是否国行为无/空白时跳过
                        if (isDomestic && (isDomestic === '无' || isDomestic.trim() === '')) return null;

                        let purchaseLocation = getField('购买地点');
                        // 购买地点为无/空白时跳过
                        if (!isDomestic && purchaseLocation && (purchaseLocation === '无' || purchaseLocation.trim() === '')) return null;

                        if (isDomestic) {
                            // 明确为国行
                            if (isDomestic === '国行') {
                                const availableOptions = getAvailableOptions('购买渠道');
                                const hasDemoOption = availableOptions.includes('演示机');
                                let shouldBeDemo = false;
                                const isDemo = getField('是否样机/演示机');
                                if (isDemo === '是') {
                                    shouldBeDemo = true;
                                } else if (!isDemo) {
                                    const desc = getField('产品描述') || '';
                                    if (/零售样机/i.test(desc)) shouldBeDemo = true;
                                }
                                if (shouldBeDemo && hasDemoOption) {
                                    if (selectedVal !== '演示机')
                                        return `购买渠道 应为【演示机】（样机），你选了【${selectedVal}】`;
                                } else {
                                    if (selectedVal !== '大陆国行')
                                        return `购买渠道 应为【大陆国行】，你选了【${selectedVal}】`;
                                }
                                return null;
                            }
                            // 特定国家映射→非国行
                            if (/阿爾及利亞|英國|菲律賓/i.test(isDomestic) &&
                                selectedVal !== '非国行') {
                                return `购买渠道 应为【非国行】（${isDomestic}），你选了【${selectedVal}】`;
                            }
                            // 非国行/非大陆
                            if (isDomestic.includes('非国行') || isDomestic.includes('非大陆')) {
                                if (selectedVal !== '非国行')
                                    return `购买渠道 应为【非国行】，你选了【${selectedVal}】`;
                                return null;
                            }
                            // 其他非中国地区（中国台湾、中国香港、美国、日本等）→非国行
                            if (!/中国|国行|China/i.test(isDomestic)) {
                                const availableOptions = getAvailableOptions('购买渠道');
                                // 有港澳台版选项就选港澳台版
                                if (/中国台湾|中国香港|台湾|香港/.test(isDomestic) && availableOptions.includes('港澳台版')) {
                                    if (selectedVal !== '港澳台版')
                                        return `购买渠道 应为【港澳台版】（${isDomestic}），你选了【${selectedVal}】`;
                                } else {
                                    if (selectedVal !== '非国行')
                                        return `购买渠道 应为【非国行】（${isDomestic}），你选了【${selectedVal}】`;
                                }
                                return null;
                            }
                        }

                        // 没有是否国行字段，检查购买地点
                        if (purchaseLocation) {
                            if (purchaseLocation === 'China') {
                                const availableOptions = getAvailableOptions('购买渠道');
                                const hasDemoOption = availableOptions.includes('演示机');
                                let shouldBeDemo = false;
                                const isDemo = getField('是否样机/演示机');
                                if (isDemo === '是') {
                                    shouldBeDemo = true;
                                } else if (!isDemo) {
                                    const desc = getField('产品描述') || '';
                                    if (/零售样机/i.test(desc)) shouldBeDemo = true;
                                }
                                if (shouldBeDemo && hasDemoOption) {
                                    if (selectedVal !== '演示机')
                                        return `购买渠道 应为【演示机】（样机），你选了【${selectedVal}】`;
                                } else {
                                    if (selectedVal !== '大陆国行')
                                        return `购买渠道 应为【大陆国行】（购买地点：${purchaseLocation}），你选了【${selectedVal}】`;
                                }
                            } else {
                                if (selectedVal !== '非国行')
                                    return `购买渠道 应为【非国行】（购买地点：${purchaseLocation}），你选了【${selectedVal}】`;
                            }
                            return null;
                        }
                    }
                    return null;
                },
                requiredOfficialKeys: [],
            },
            {
                name: '保修状态',
                labelKeywords: ['保修状态', '保修', '是否在保', '保修时长', '保修剩余'],
                customCheck: (officialText, selectedVal) => {
                    const datePatterns = [
                        { regex: /保修到期时间[：:]\s*([\s\S]+?)(?:\r?\n|$)/i, handler: (m) => m[1].trim() },
                        { regex: /预估保修结束日期[：:]\s*(?:<[^>]+>)?(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/i, handler: (m) => m[1] },
                        { regex: /保修结束日期[：:]\s*(?:<[^>]+>)?(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/i, handler: (m) => m[1] },
                        { regex: /保修截止日期[：:]\s*(?:<[^>]+>)?(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/i, handler: (m) => m[1] },
                        { regex: /保修结束日期[：:]\s*(\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\s+\d{1,2}:\d{2}:\d{2})/, handler: (m) => m[1].split(' ')[0] },
                        { regex: /保修截止日期[：:]\s*(\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\s+\d{1,2}:\d{2}:\d{2})/, handler: (m) => m[1].split(' ')[0] },
                        { regex: /保修状态[：:]\s*(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/i, handler: (m) => `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}` },
                    ];
                    let endDate = null;
                    let warrantyStr = null;
                    for (const p of datePatterns) {
                        const m = officialText.match(p.regex);
                        if (m) {
                            warrantyStr = p.handler(m);
                            break;
                        }
                    }
                    // 如果找到了 warrantyStr，去掉末尾的括号备注（如"2027年10月17日（已延保）"）
                    if (warrantyStr) {
                        warrantyStr = warrantyStr.replace(/[（(].*[）)]$/, '').trim();
                    }
                    if (warrantyStr && /未激活/i.test(warrantyStr)) {
                        const actMatch = officialText.match(/激活日期[：:]\s*(?:已于\s*)?(\d{4}[-\/年]\d{1,2}[-\/月]\d{1,2})/i);
                        if (actMatch) {
                            let actDateStr = actMatch[1].replace(/年/g, '-').replace(/月/g, '-').replace(/日/g, '').replace(/\//g, '-');
                            endDate = parseDateLocal(actDateStr);
                            if (endDate) endDate.setFullYear(endDate.getFullYear() + 1);
                        }
                    } else if (warrantyStr) {
                        endDate = parseDateLocal(warrantyStr);
                    }

                    if (!endDate || isNaN(endDate)) {
                        const actMatch = officialText.match(/激活(?:日期|时间)[：:]\s*(?:已于\s*)?(\d{4}[-\/年]\d{1,2}[-\/月]\d{1,2})/i);
                        if (actMatch) {
                            let actDateStr = actMatch[1].replace(/年/g, '-').replace(/月/g, '-').replace(/日/g, '').replace(/\//g, '-');
                            endDate = parseDateLocal(actDateStr);
                            if (endDate) endDate.setFullYear(endDate.getFullYear() + 1);
                        }
                    }

                    if (!endDate || isNaN(endDate)) {
                        const warrantyStatusField = extractField(officialText, '保修状态');
                        if (warrantyStatusField && warrantyStatusField.includes('已过保')) {
                            const allLabels = document.querySelectorAll('.el-form-item__label');
                            let warrantyOptionCount = 0;
                            for (const label of allLabels) {
                                const text = label.textContent.trim();
                                if (text.includes('保修时长') || text.includes('保修剩余') || text.includes('保修状态') || text.includes('保修期')) {
                                    const content = label.nextElementSibling;
                                    if (content) {
                                        const options = content.querySelectorAll('.el-radio-button__inner');
                                        warrantyOptionCount = options.length;
                                        break;
                                    }
                                }
                            }
                            if (warrantyOptionCount === 2) {
                                let labelB = '保修时长<30天';
                                for (const l of document.querySelectorAll('.el-form-item__label')) {
                                    const t = l.textContent.trim();
                                    if (t.includes('保修时长') || t.includes('保修剩余') || t.includes('保修状态') || t.includes('保修期')) {
                                        const opts = l.nextElementSibling?.querySelectorAll('.el-radio-button__inner');
                                        if (opts && opts.length === 2) {
                                            const t0 = getCleanOptionText(opts[0]), t1 = getCleanOptionText(opts[1]);
                                            if (t0.includes('一个月') || t1.includes('一个月')) {
                                                labelB = '保修期一个月内或过保';
                                            }
                                        }
                                        break;
                                    }
                                }
                                if (selectedVal !== labelB)
                                    return `保修状态 应为【${labelB}】（已过保），你选了【${selectedVal}】`;
                                return null;
                            }
                            if (selectedVal !== '保修时长<30天')
                                return `保修状态 应为【保修时长<30天】（已过保），你选了【${selectedVal}】`;
                            return null;
                        }
                        return null;
                    }

                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const diffDays = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));

                    const allLabels = document.querySelectorAll('.el-form-item__label');
                    let warrantyOptionCount = 0;
                    for (const label of allLabels) {
                        const text = label.textContent.trim();
                        if (text.includes('保修时长') || text.includes('保修剩余') || text.includes('保修状态')) {
                            const content = label.nextElementSibling;
                            if (content) {
                                const options = content.querySelectorAll('.el-radio-button__inner');
                                warrantyOptionCount = options.length;
                                break;
                            }
                        }
                    }
                    if (warrantyOptionCount === 2) {
                        // 检测实际模板选项名称
                        let labelA = '保修时长≥30天', labelB = '保修时长<30天';
                        for (const label of document.querySelectorAll('.el-form-item__label')) {
                            const text = label.textContent.trim();
                        if (text.includes('保修时长') || text.includes('保修剩余') || text.includes('保修状态') || text.includes('保修期')) {
                                const opts = label.nextElementSibling?.querySelectorAll('.el-radio-button__inner');
                                if (opts && opts.length === 2) {
                                    const t0 = getCleanOptionText(opts[0]), t1 = getCleanOptionText(opts[1]);
                                    if (t0.includes('一个月') || t1.includes('一个月')) {
                                        labelA = '保修期一个月以上';
                                        labelB = '保修期一个月内或过保';
                                    }
                                }
                                break;
                            }
                        }
                        if (diffDays >= 30 && selectedVal !== labelA)
                            return `保修状态 应为【${labelA}】（剩余${diffDays}天），你选了【${selectedVal}】`;
                        if (diffDays < 30 && selectedVal !== labelB)
                            return `保修状态 应为【${labelB}】（剩余${diffDays}天），你选了【${selectedVal}】`;
                        return null;
                    }

                    let expectedInterval = '';
                    if (diffDays < 30) expectedInterval = '保修时长<30天';
                    else if (diffDays < 110) expectedInterval = '30天≤保修时长<110天';
                    else if (diffDays < 190) expectedInterval = '110天≤保修时长<190天';
                    else if (diffDays < 250) expectedInterval = '190天≤保修时长<250天';
                    else if (diffDays < 330) expectedInterval = '250天≤保修时长<330天';
                    else expectedInterval = '保修时长≥330天';

                    if (selectedVal !== expectedInterval)
                        return `保修状态 应为【${expectedInterval}】（剩余${diffDays}天），你选了【${selectedVal}】`;
                    return null;
                },
                requiredOfficialKeys: ['保修结束日期', '保修截止日期', '预估保修结束日期', '保修状态', '保修到期时间', '激活日期', '激活时间'],
            },
            {
                name: '激活状态',
                labelKeywords: ['激活状态', '激活', '是否激活'],
                customCheck: (officialText, selectedVal) => {
                    const lines = officialText.split('\n');
                    for (const rawLine of lines) {
                        const line = rawLine.trim();
                        if (!line) continue;
                        const m1 = line.match(/^是否激活[：:]\s*(是|否)/i);
                        if (m1) {
                            const officialVal = m1[1] === '是' ? '已激活' : '未激活';
                            return officialVal === selectedVal ? null : `激活状态 应为【${officialVal}】，你选了【${selectedVal}】`;
                        }
                        const m1b = line.match(/^是否激活[：:]\s*(已激活|未激活)/i);
                        if (m1b) {
                            const officialVal = m1b[1].trim();
                            return officialVal === selectedVal ? null : `激活状态 应为【${officialVal}】，你选了【${selectedVal}】`;
                        }
                        const m2 = line.match(/^(?:激活状态|机器状态)[：:]\s*(.+)$/i);
                        if (m2 && m2[1].trim()) {
                            const raw = m2[1].trim();
                            if (/\d{4}[年\/-]\d{1,2}[月\/-]\d{1,2}/.test(raw))
                                return selectedVal === '已激活' ? null : `激活状态 应为【已激活】，你选了【${selectedVal}】`;
                            if (/已激活|激活/.test(raw) && !/未激活/.test(raw))
                                return selectedVal === '已激活' ? null : `激活状态 应为【已激活】，你选了【${selectedVal}】`;
                            if (/未激活/.test(raw))
                                return selectedVal === '未激活' ? null : `激活状态 应为【未激活】，你选了【${selectedVal}】`;
                        }
                    }
                    return null;
                },
                requiredOfficialKeys: ['是否激活', '激活状态', '机器状态'],
            },
            {
                name: '网络制式（小米/红米仅智能手表，苹果iPad）',
                labelKeywords: ['网络制式'],
                conditionalCheck: (officialText) => {
                    const brand = getInputValueByLabel('品牌');
                    if (!brand) return null;
                    const category = getInputValueByLabel('品类');
                    const getField = (name) => extractField(officialText, name);

                    if (/小米|Redmi|红米/i.test(brand)) {
                        if (category !== '智能手表') return null;

                        let selected = '';
                        const allLabels = document.querySelectorAll('.el-form-item__label');
                        for (const label of allLabels) {
                            const labelText = label.textContent.trim();
                            if (/网络制式/.test(labelText)) {
                                const content = label.nextElementSibling;
                                if (content) {
                                    const active = content.querySelector('.el-radio-button.is-active .el-radio-button__inner');
                                    if (active) selected = getCleanOptionText(active);
                                }
                                break;
                            }
                        }
                        if (!selected || /不检测|跳过/i.test(selected)) return null;

                        let modelText = getField('型号');
                        if (!modelText) modelText = getField('型号配置');
                        const isEsimModel = /esim/i.test(modelText);
                        const expected = isEsimModel ? 'eSIM版' : '蓝牙版';

                        if (selected.toLowerCase() !== expected.toLowerCase()) {
                            return `网络制式 应为【${expected}】，你选了【${selected}】`;
                        }
                        return null;
                    }

                    // 华为平板网络制式检测：根据产品描述中的关键词自动匹配
                    if (/华为|Huawei/i.test(brand) && /平板/.test(category)) {
                        let selected = '';
                        const allLabels = document.querySelectorAll('.el-form-item__label');
                        for (const label of allLabels) {
                            const labelText = label.textContent.trim();
                            if (/网络制式/.test(labelText)) {
                                const content = label.nextElementSibling;
                                if (content) {
                                    const active = content.querySelector('.el-radio-button.is-active .el-radio-button__inner');
                                    if (active) selected = getCleanOptionText(active);
                                }
                                break;
                            }
                        }
                        if (!selected || /不检测|跳过/i.test(selected)) return null;

                        const desc = getField('产品描述');
                        if (!desc) return null;

                        // 获取当前模板实际可用的网络制式选项
                        const availableOptions = [];
                        for (const label of document.querySelectorAll('.el-form-item__label')) {
                            if (/网络制式/.test(label.textContent)) {
                                const content = label.nextElementSibling;
                                if (content) {
                                    content.querySelectorAll('.el-radio-button__inner').forEach(el => {
                                        availableOptions.push(getCleanOptionText(el));
                                    });
                                }
                                break;
                            }
                        }

                        let kind = ''; // 'wifi', '4g', '5g'
                        if (/5G版/i.test(desc)) {
                            kind = '5g';
                        } else if (/LTE版|全网通版|全网通|插卡版/i.test(desc)) {
                            kind = '4g';
                        } else if (/WIFI版|WiFi版/i.test(desc)) {
                            kind = 'wifi';
                        } else {
                            return null;
                        }

                        // 根据模板实际选项名决定 expected
                        let expected = '';
                        if (kind === '5g') {
                            expected = 'WIFI+5G版';
                        } else if (kind === '4g') {
                            const match = availableOptions.find(o => /4G版|插卡版|蜂窝版|移动网络版/i.test(o));
                            expected = match || 'WIFI+4G版';
                        } else if (kind === 'wifi') {
                            const match = availableOptions.find(o => /^WIFI版$|^WiFi版$/i.test(o.trim()));
                            expected = match || 'WIFI版';
                        }

                        if (!expected) return null;

                        // 归一化比较：插卡版↔4G版视作等价，WiFi↔WIFI不区分
                        const norm = s => s.replace(/插卡版/i, '4G版').replace(/WiFi/i, 'WIFI').toLowerCase();
                        if (norm(selected) !== norm(expected)) {
                            return `网络制式 应为【${expected}】（产品描述含关键词），你选了【${selected}】`;
                        }
                        return null;
                    }

                    // OPPO平板网络制式检测：型号含"SIM卡版"则需选 WIFI+5G版，不含则不提示
                    if (/OPPO/i.test(brand) && /平板/.test(category)) {
                        let selected = '';
                        const allLabels = document.querySelectorAll('.el-form-item__label');
                        for (const label of allLabels) {
                            const labelText = label.textContent.trim();
                            if (/网络制式/.test(labelText)) {
                                const content = label.nextElementSibling;
                                if (content) {
                                    const active = content.querySelector('.el-radio-button.is-active .el-radio-button__inner');
                                    if (active) selected = getCleanOptionText(active);
                                }
                                break;
                            }
                        }
                        if (!selected || /不检测|跳过/i.test(selected)) return null;

                        const modelField = getField('型号');
                        if (!modelField) return null;

                        if (/SIM卡版|SIM卡/i.test(modelField)) {
                            if (selected.toLowerCase() !== 'wifi+5g版') {
                                return `网络制式 应为【WIFI+5G版】（型号含"SIM卡版"），你选了【${selected}】`;
                            }
                        }
                        // 不含 SIM卡版 则不提示
                        return null;
                    }

                    if (/苹果|Apple/i.test(brand)) {
                        const model = getInputValueByLabel('机型') || getField('型号');
                        if (!model || !/iPad/i.test(model)) return null;

                        let selected = '';
                        const allLabels = document.querySelectorAll('.el-form-item__label');
                        for (const label of allLabels) {
                            const labelText = label.textContent.trim();
                            if (/网络制式/.test(labelText)) {
                                const content = label.nextElementSibling;
                                if (content) {
                                    const active = content.querySelector('.el-radio-button.is-active .el-radio-button__inner');
                                    if (active) selected = getCleanOptionText(active).trim().toLowerCase();
                                }
                                break;
                            }
                        }
                        if (!selected || /不检测|跳过/i.test(selected)) return null;

                        const wifiMobile = getField('是否WiFi+移动网络');
                        if (!wifiMobile) return null;

                        const cleanWifiMobile = wifiMobile.trim().toLowerCase();
                        if (cleanWifiMobile === '否' || cleanWifiMobile.includes('否')) {
                            if (selected !== 'wifi版') {
                                return `网络制式 应为【WIFI版】，你选了【${selected}】`;
                            }
                        } else if (cleanWifiMobile === '是' || cleanWifiMobile.includes('是')) {
                            if (selected === 'wifi版') {
                                return `网络制式 应为【WIFI+5G版或WIFI+4G版】，你选了【${selected}】`;
                            }
                        }
                    }
                    return null;
                },
            },
            {
                name: '网络制式（手机全网通检测）',
                labelKeywords: ['网络制式'],
                conditionalCheck: (officialText) => {
                    const category = getInputValueByLabel('品类');
                    if (category !== '手机') return null;

                    const modelField = extractField(officialText, '型号');
                    const networkField = extractField(officialText, '网络制式');
                    const requiresGlobal = (modelField && modelField.includes('全网通')) || (networkField && networkField.trim() === '全网通');
                    if (!requiresGlobal) return null;

                    const selectedNetwork = getSelectedValue(['网络制式']);
                    if (!selectedNetwork || /不检测|跳过/i.test(selectedNetwork)) return null;

                    if (selectedNetwork !== '全网通') {
                        const reason = [];
                        if (modelField && modelField.includes('全网通')) reason.push('型号中含"全网通"');
                        if (networkField && networkField.trim() === '全网通') reason.push('网络制式字段为"全网通"');
                        return `网络制式 应为【全网通】（${reason.join('，')}），你选了【${selectedNetwork}】`;
                    }
                    return null;
                }
            },
            {
                name: '型号（苹果手机小型号）',
                labelKeywords: ['型号'],
                conditionalCheck: (officialText) => {
                    const brand = getInputValueByLabel('品牌');
                    if (!/苹果|Apple/i.test(brand)) return null;
                    const model = getInputValueByLabel('机型') || extractField(officialText, '型号');
                    if (!model || /iPad/i.test(model)) return null;

                    let deviceModel = extractField(officialText, '机型');
                    if (!deviceModel) deviceModel = extractField(officialText, '入网型号');
                    if (!deviceModel) return null;

                    const aMatch = deviceModel.match(/A\d{4}/);
                    if (!aMatch) return null;
                    const aNumber = aMatch[0];

                    const availableOptions = getAvailableOptions('型号');
                    if (availableOptions.length === 0) return null;

                    let selected = '';
                    const allLabels = document.querySelectorAll('.el-form-item__label');
                    for (const label of allLabels) {
                        if (label.textContent.trim() === '型号') {
                            const content = label.nextElementSibling;
                            if (content) {
                                const active = content.querySelector('.el-radio-button.is-active .el-radio-button__inner');
                                if (active) selected = getCleanOptionText(active);
                            }
                            break;
                        }
                    }
                    if (!selected || /不检测|跳过/i.test(selected)) return null;

                    const matchedOption = availableOptions.find(opt => opt.includes(aNumber) && opt !== '其他型号');
                    if (matchedOption) {
                        if (selected !== matchedOption) {
                            return `型号 应为【${matchedOption}】，你选了【${selected}】`;
                        }
                    } else {
                        if (selected !== '其他型号') {
                            return `型号 应为【其他型号】（未找到${aNumber}对应选项），你选了【${selected}】`;
                        }
                    }
                    return null;
                },
            },
            {
                name: '激活锁（苹果全品类检测）',
                labelKeywords: ['账号', 'ID锁', '密码及账号'],
                conditionalCheck: (officialText) => {
                    const brand = getInputValueByLabel('品牌');
                    if (!/苹果|Apple/i.test(brand)) return null;

                    const category = getInputValueByLabel('品类');
                    if (!category) return null;

                    let activationLock = extractField(officialText, '激活锁状态');
                    if (!activationLock) {
                        activationLock = extractField(officialText, '激活锁');
                    }
                    if (!activationLock) return null;

                    if (!activationLock.includes('开启')) return null;

                    if (/^手机$/.test(category)) {
                        const selected = getSelectedValue(['账号']);
                        if (!selected || /不检测|跳过/i.test(selected)) return null;
                        if (selected !== 'iCloud无法注销') {
                            return `账号 应为【iCloud无法注销】（激活锁已开启），你选了【${selected}】`;
                        }
                    } else if (/^平板$/.test(category)) {
                        const availableOptions = getAvailableOptions('ID锁');
                        const hasSpecialTemplate = availableOptions.some(o => o.includes('ID/账户锁无法解除'));
                        const expected = hasSpecialTemplate ? 'ID/账户锁无法解除' : 'iCloud无法注销';
                        const selected = getSelectedValue(['ID锁']);
                        if (!selected || /不检测|跳过/i.test(selected)) return null;
                        if (selected !== expected) {
                            return `ID锁 应为【${expected}】（激活锁已开启），你选了【${selected}】`;
                        }
                    } else if (/^智能手表$/.test(category)) {
                        const selected = getSelectedValue(['密码及账号']);
                        if (!selected || /不检测|跳过/i.test(selected)) return null;
                        if (selected !== '有锁') {
                            return `密码及账号 应为【有锁】（激活锁已开启），你选了【${selected}】`;
                        }
                    } else if (/^(笔记本|电脑)$/.test(category)) {
                        const selected = getSelectedValue(['ID锁']);
                        if (!selected || /不检测|跳过/i.test(selected)) return null;
                        if (selected !== 'iCloud账号无法解除') {
                            return `ID锁 应为【iCloud账号无法解除】（激活锁已开启），你选了【${selected}】`;
                        }
                    }
                    return null;
                },
            },
            {
                name: '账号（小米/红米手机激活锁检测）',
                labelKeywords: ['账号'],
                conditionalCheck: (officialText) => {
                    const brand = getInputValueByLabel('品牌');
                    if (!/小米|Redmi|红米/i.test(brand)) return null;
                    const category = getInputValueByLabel('品类');
                    if (category !== '手机') return null;

                    const activationLock = extractField(officialText, '激活锁');
                    if (!activationLock || activationLock.trim() !== '开启') return null;

                    let selected = getSelectedValue(['账号']);
                    if (!selected || /不检测|跳过/i.test(selected)) return null;
                    if (selected !== 'ID/账户锁无法解除') {
                        return `账号 应为【ID/账户锁无法解除】（激活锁已开启），你选了【${selected}】`;
                    }
                    return null;
                },
            },
            {
                name: '连接',
                labelKeywords: ['连接', '连接项'],
                conditionalCheck: (officialText) => {
                    const brand = getInputValueByLabel('品牌');
                    const category = getInputValueByLabel('品类');
                    if (!/苹果|Apple/i.test(brand) || category !== '智能手表') return null;
                    const text = officialText + ' ' + (document.body.textContent || '');
                    let expected = '';
                    if (/GPS\s*\+\s*移动网络/.test(text)) {
                        expected = 'GPS+蜂窝网络';
                    } else if (/\bGPS\b/.test(text)) {
                        expected = 'GPS';
                    }
                    if (!expected) return null;
                    const selected = getSelectedValue(['连接', '连接项']);
                    if (!selected || /不检测|跳过/i.test(selected)) return null;
                    if (selected !== expected) {
                        return `连接 应为【${expected}】，你选了【${selected}】`;
                    }
                    return null;
                },
            },
            {
                name: '内存',
                labelKeywords: ['内存'],
                conditionalCheck: (officialText) => {
                    const brand = getInputValueByLabel('品牌');
                    const category = getInputValueByLabel('品类');
                    if (!/华为|荣耀/i.test(brand) || !(category === '笔记本' || category === '电脑')) return null;
                    const src = extractField(officialText, '容量') || extractField(officialText, '产品描述');
                    if (!src) return null;
                    const m = src.match(/(\d+)\s*G(?:B)?\s*\+/i);
                    if (!m) return null;
                    const value = parseInt(m[1]);
                    const options = getAvailableOptions('内存');
                    if (!options.length) return null;
                    let expected = '';
                    const exact = options.find(o => {
                        const n = parseInt(o);
                        return !isNaN(n) && n === value;
                    });
                    if (exact) {
                        expected = exact;
                    } else {
                        const range = options.find(o => {
                            const p = o.match(/(\d+)\s*G(?:B)?\s*-\s*(\d+)\s*G(?:B)?/i);
                            return p && value >= parseInt(p[1]) && value <= parseInt(p[2]);
                        });
                        if (range) expected = range;
                    }
                    if (!expected) return null;
                    const selected = getSelectedValue(['内存']);
                    if (!selected || /不检测|跳过/i.test(selected)) return null;
                    if (selected !== expected) {
                        return `内存 应为【${expected}】（${m[0]}），你选了【${selected}】`;
                    }
                    return null;
                },
            },
            {
                name: '固态硬盘',
                labelKeywords: ['固态硬盘'],
                conditionalCheck: (officialText) => {
                    const brand = getInputValueByLabel('品牌');
                    const category = getInputValueByLabel('品类');
                    if (!/华为|荣耀/i.test(brand) || !(category === '笔记本' || category === '电脑')) return null;
                    const src = extractField(officialText, '容量') || extractField(officialText, '产品描述');
                    if (!src) return null;
                    const m = src.match(/\+\s*(\d+)\s*(G(?:B)?|T(?:B)?)/i);
                    if (!m) return null;
                    const value = parseInt(m[1]);
                    const rawUnit = m[2].toUpperCase().replace(/^G$/, 'GB').replace(/^T$/, 'TB');
                    const valueGB = rawUnit.startsWith('T') ? value * 1024 : value;
                    const options = getAvailableOptions('固态硬盘');
                    if (!options.length) return null;
                    const selected = getSelectedValue(['固态硬盘']);
                    if (!selected || /不检测|跳过/i.test(selected)) return null;
                    if (/不含固态硬盘/.test(selected)) return null;
                    let expected = '';
                    const exact = options.find(o => {
                        const n = o.match(/(?:固态硬盘)?\s*(\d+)\s*(?:G(?:B)?|T(?:B)?)/i);
                        return n && parseInt(n[1]) === value && (o.includes('固态硬盘') || !o.includes('-'));
                    });
                    if (exact) {
                        expected = exact;
                    } else {
                        const range = options.find(o => {
                            const p = o.match(/固态硬盘\s*(\d+)\s*G(?:B)?\s*-\s*(\d+)\s*G(?:B)?/i);
                            if (!p) {
                                const pt = o.match(/固态硬盘\s*([\d.]+)\s*T(?:B)?\s*-\s*([\d.]+)\s*T(?:B)?/i);
                                if (pt) {
                                    const minTB = parseFloat(pt[1]) * 1024;
                                    const maxTB = parseFloat(pt[2]) * 1024;
                                    return valueGB >= minTB && valueGB <= maxTB;
                                }
                                return false;
                            }
                            return valueGB >= parseInt(p[1]) && valueGB <= parseInt(p[2]);
                        });
                        if (range) expected = range;
                    }
                    if (!expected) return null;
                    if (selected !== expected) {
                        return `固态硬盘 应为【${expected}】（${m[0]}），你选了【${selected}】`;
                    }
                    return null;
                },
            },
            {
                name: '显卡',
                labelKeywords: ['显卡'],
                conditionalCheck: (officialText) => {
                    const brand = getInputValueByLabel('品牌');
                    const category = getInputValueByLabel('品类');
                    if (!/华为|荣耀/i.test(brand) || !(category === '笔记本' || category === '电脑')) return null;
                    const desc = extractField(officialText, '产品描述');
                    if (!desc || !/集显|集成显卡/i.test(desc)) return null;
                    const selected = getSelectedValue(['显卡']);
                    if (!selected || /不检测|跳过/i.test(selected)) return null;
                    // 过滤显卡功能状态类选项（功能正常/功能异常），非显卡类型选择
                    if (/功能正常|功能异常|异常|良好|检测/i.test(selected)) return null;
                    if (selected !== '核芯/集成显卡') {
                        return `显卡 应为【核芯/集成显卡】（产品描述含集显），你选了【${selected}】`;
                    }
                    return null;
                },
            },
            {
                name: '网络制式（vivo智能手表）',
                labelKeywords: ['网络制式'],
                conditionalCheck: (officialText) => {
                    const brand = getInputValueByLabel('品牌');
                    if (!/vivo|VIVO|iQOO|IQOO/i.test(brand)) return null;
                    const category = getInputValueByLabel('品类');
                    if (category !== '智能手表') return null;
                    let model = extractField(officialText, '型号');
                    if (!model) model = extractField(officialText, '机型');
                    if (!model) return null;
                    const isEsim = /eSIM版/i.test(model);
                    const isBt = /蓝牙版/i.test(model);
                    if (!isEsim && !isBt) return null;
                    const expected = isEsim ? 'eSIM版' : '蓝牙版';
                    const selected = getSelectedValue(['网络制式']);
                    if (!selected || /不检测|跳过/i.test(selected)) return null;
                    if (selected !== expected) {
                        return `网络制式 应为【${expected}】（${model}含"${expected}"），你选了【${selected}】`;
                    }
                    return null;
                },
            },
            {
                name: '表盘尺寸（智能手表）',
                labelKeywords: ['表盘尺寸'],
                conditionalCheck: (officialText) => {
                    const category = getInputValueByLabel('品类');
                    if (category !== '智能手表') return null;
                    let model = extractField(officialText, '型号');
                    if (!model) model = extractField(officialText, '机型');
                    let mmMatch = null;
                    if (model) {
                        const clean = model.replace(/[""]/g, '');
                        mmMatch = clean.match(/(\d{2})\s*mm/i);
                    }
                    if (!mmMatch) {
                        mmMatch = officialText.match(/(\d{2})\s*mm/i);
                    }
                    if (!mmMatch) return null;
                    const expected = mmMatch[1] + '毫米';
                    const selected = getSelectedValue(['表盘尺寸']);
                    if (!selected || /不检测|跳过/i.test(selected)) return null;
                    if (selected !== expected) {
                        return `表盘尺寸 应为【${expected}】（信息含"${mmMatch[0]}"），你选了【${selected}】`;
                    }
                    return null;
                },
            },
            {
                name: '版本（OPPO智能手表）',
                labelKeywords: ['版本'],
                conditionalCheck: (officialText) => {
                    const brand = getInputValueByLabel('品牌');
                    if (!/OPPO/i.test(brand)) return null;
                    const category = getInputValueByLabel('品类');
                    if (category !== '智能手表') return null;
                    let model = extractField(officialText, '型号');
                    if (!model) model = extractField(officialText, '机型');
                    if (!model) return null;
                    const suffixMap = {
                        '理想汽车定制版': '理想汽车商城专供版',
                        'ECG版': 'ECG版',
                        '名侦探柯南限定版': '名侦探柯南限定版',
                        '精钢版': '精钢版',
                        '故宫新禧版': '故宫新禧版',
                        '英雄联盟限定版': '英雄联盟限定版',
                        'EVA限定版': 'EVA限定版',
                        'NFC版': 'NFC版',
                        '高尔夫定制版': '高尔夫定制版',
                        'MG汽车定制版': 'MG汽车定制版',
                    };
                    let matched = null;
                    for (const [suffix, expected] of Object.entries(suffixMap)) {
                        if (model.includes(suffix)) {
                            matched = expected;
                            break;
                        }
                    }
                    if (!matched) matched = '标准版';
                    const selected = getSelectedValue(['版本']);
                    if (!selected || /不检测|跳过/i.test(selected)) return null;
                    if (selected !== matched) {
                        if (matched === '标准版') {
                            return `版本 应为【标准版】（型号无定制版后缀），你选了【${selected}】`;
                        }
                        return `版本 应为【${matched}】（型号含"${matched}"），你选了【${selected}】`;
                    }
                    return null;
                },
            },
            {
                name: '网络制式（OPPO智能手表）',
                labelKeywords: ['网络制式'],
                conditionalCheck: (officialText) => {
                    const brand = getInputValueByLabel('品牌');
                    if (!/OPPO/i.test(brand)) return null;
                    const category = getInputValueByLabel('品类');
                    if (category !== '智能手表') return null;
                    let model = extractField(officialText, '型号');
                    if (!model) model = extractField(officialText, '机型');
                    if (!model) return null;
                    const isEsim = /\beSIM\b/i.test(model) || /[（(]\s*eSIM\s*[）)]/i.test(model);
                    const isBt = /蓝牙/i.test(model);
                    if (!isEsim && !isBt) return null;
                    const expected = isEsim ? 'eSIM版' : '蓝牙版';
                    const selected = getSelectedValue(['网络制式']);
                    if (!selected || /不检测|跳过/i.test(selected)) return null;
                    if (selected !== expected) {
                        return `网络制式 应为【${expected}】（${model}含"${expected}"），你选了【${selected}】`;
                    }
                    return null;
                },
            },
            {
                name: '网络制式（三星智能手表）',
                labelKeywords: ['网络制式'],
                conditionalCheck: (officialText) => {
                    const brand = getInputValueByLabel('品牌');
                    if (!/三星|Samsung/i.test(brand)) return null;
                    const category = getInputValueByLabel('品类');
                    if (category !== '智能手表') return null;
                    let model = extractField(officialText, '型号');
                    if (!model) model = extractField(officialText, '机型');
                    if (!model) return null;
                    const isLte = /LTE/i.test(model);
                    const isBt = /蓝牙/i.test(model);
                    if (!isLte && !isBt) return null;
                    const expected = isLte ? 'LTE版' : '蓝牙版';
                    const selected = getSelectedValue(['网络制式']);
                    if (!selected || /不检测|跳过/i.test(selected)) return null;
                    if (selected !== expected) {
                        return `网络制式 应为【${expected}】（${model}含"${expected}"），你选了【${selected}】`;
                    }
                    return null;
                },
            },
            {
                name: '网络制式（三星平板）',
                labelKeywords: ['网络制式'],
                conditionalCheck: (officialText) => {
                    const brand = getInputValueByLabel('品牌');
                    if (!/三星|Samsung/i.test(brand)) return null;
                    const category = getInputValueByLabel('品类');
                    if (category !== '平板') return null;
                    let model = extractField(officialText, '型号');
                    if (!model) model = extractField(officialText, '机型');
                    if (!model) return null;
                    const has5g = /\b5G\b/i.test(model);
                    const hasLte = /\bLTE\b/i.test(model);
                    const hasWifi = /Wi[-\s]?Fi|WiFi/i.test(model);
                    const has3g = /3G版/i.test(model);
                    const has4g = /\b4G\b/i.test(model);
                    if (!has5g && !hasLte && !hasWifi && !has3g && !has4g) return null;
                    const expected = has5g ? 'WIFI+5G版' : (hasLte || has3g || has4g) ? 'WIFI+4G版' : 'WIFI版';
                    const selected = getSelectedValue(['网络制式']);
                    if (!selected || /不检测|跳过/i.test(selected)) return null;
                    if (selected !== expected) {
                        return `网络制式 应为【${expected}】（${model}含对应关键词），你选了【${selected}】`;
                    }
                    return null;
                },
            },
            {
                name: '网络制式（小米平板）',
                labelKeywords: ['网络制式'],
                conditionalCheck: (officialText) => {
                    const brand = getInputValueByLabel('品牌');
                    if (!/小米|Xiaomi|Redmi|红米/i.test(brand)) return null;
                    const category = getInputValueByLabel('品类');
                    if (category !== '平板') return null;
                    let model = extractField(officialText, '型号');
                    if (!model) model = extractField(officialText, '机型');
                    if (!model) return null;
                    const has5g = /\b5G\b/i.test(model);
                    const hasLte = /\bLTE\b/i.test(model);
                    const has4g = /\b4G\b/i.test(model);
                    const expected = has5g ? 'WIFI+5G版' : (hasLte || has4g) ? 'WIFI+4G版' : 'WIFI版';
                    const selected = getSelectedValue(['网络制式']);
                    if (!selected || /不检测|跳过/i.test(selected)) return null;
                    if (selected !== expected) {
                        return `网络制式 应为【${expected}】（小米平板），你选了【${selected}】`;
                    }
                    return null;
                },
            },
        ],
        bannerStyle: `position:fixed; top:0; left:50%; transform:translateX(-50%); z-index:99999; background:#d93025; color:#fff; padding:11px 16px; font-size:14px; font-weight:bold; text-align:center; border-radius:0 0 6px 6px; box-shadow:0 2px 8px rgba(0,0,0,0.3); white-space:nowrap;`,
        minOfficialLength: 30,
        maxRetries: 20,
        retryInterval: 500,
        bannerDuration: 120000,
    };

    let retryCount = 0;

    function getPageText() {
        let container = findPageContainer();
        return container ? container.textContent.trim() : '';
    }

    function findPageContainer() {
        for (const s of CONFIG.areaSelectors) {
            const e = document.querySelector(s);
            if (e && e.textContent.trim().length >= CONFIG.minOfficialLength) return e;
        }
        const tableContainer = findOfficialTableContainer();
        if (tableContainer) return tableContainer;
        return null;
    }

    function parseTableToText(tableEl) {
        const rows = tableEl.querySelectorAll('tr');
        let text = '';
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length === 2) {
                const field = cells[0].textContent.trim();
                const value = cells[1].textContent.trim();
                if (field && value) {
                    text += `${field}: ${value}\n`;
                }
            }
        });
        return text.trim();
    }

    function findOfficialTableContainer() {
        if (tableVirtualContainer && document.contains(tableVirtualContainer)) {
            return tableVirtualContainer;
        }
        // IMEI 表格仅当页面含"保修机"时才启用
        if (/物品30天内在库质检报告/.test(document.body.textContent) && !/保修机/.test(document.body.textContent)) {
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
                    container.id = 'official-table-container';
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

    function getOfficialColorFromDOM(officialText) {
        const lines = officialText.split('\n');
        for (const line of lines) {
            const m = line.match(/^(?:颜色|机身颜色|表壳外观)[：:]\s*(.+)$/);
            if (m && m[1].trim() && !/^(提示|关闭|提示关|提示关闭)$/i.test(m[1].trim())) {
                let color = m[1].trim();
                const breakKeywords = ['内存', '产品描述', '网络制式', '型号', '品牌', '购买渠道', '存储容量', '容量', '激活状态', '保修'];
                for (const kw of breakKeywords) {
                    const idx = color.indexOf(kw);
                    if (idx > 0) {
                        color = color.substring(0, idx).trim();
                        break;
                    }
                }
                return color;
            }
        }
        const mTable = officialText.match(/^颜色[：:]\s*(.+)$/m);
        if (mTable) {
            let color = mTable[1].trim();
            const breakKeywords = ['内存', '产品描述', '网络制式', '型号', '品牌', '购买渠道', '存储容量', '容量', '激活状态', '保修'];
            for (const kw of breakKeywords) {
                const idx = color.indexOf(kw);
                if (idx > 0) {
                    color = color.substring(0, idx).trim();
                    break;
                }
            }
            return color;
        }
        return null;
    }

    function getInputValueByLabel(lbl) {
        if ((lbl === '品类' || lbl === '品牌' || lbl === '机型') && window.dropdownSelections && window.dropdownSelections[lbl]) {
            return window.dropdownSelections[lbl].trim();
        }
        const ls = document.querySelectorAll('.el-form-item__label');
        for (const l of ls) {
            if (l.textContent.trim() === lbl) {
                const inp = l.nextElementSibling?.querySelector('.el-input__inner');
                return inp ? inp.value.trim() : '';
            }
        }
        return '';
    }

    function getAvailableOptions(labelName) {
        const options = [];
        const allLabels = document.querySelectorAll('.el-form-item__label');
        for (const label of allLabels) {
            if (label.textContent.trim() === labelName) {
                const content = label.nextElementSibling;
                if (content) {
                    const inners = content.querySelectorAll('.el-radio-button__inner');
                    inners.forEach(inner => options.push(getCleanOptionText(inner)));
                }
                break;
            }
        }
        return options;
    }

    function getOfficialText() {
        const now = Date.now();
        const currentPageText = getPageText();
        if (currentPageText.length >= CONFIG.minOfficialLength && currentPageText !== pageOfficialText) {
            pageOfficialText = currentPageText;
            pageUpdateTime = now;
        }

        // 剪贴板优先
        if (clipboardOfficialText && clipboardOfficialText.length >= CONFIG.minOfficialLength) {
            return clipboardOfficialText.trim();
        }

        let bestText = null;
        let bestTime = 0;

        if (pageOfficialText && pageUpdateTime > bestTime) {
            bestText = pageOfficialText;
            bestTime = pageUpdateTime;
        }
        if (clipboardOfficialText && clipboardUpdateTime > bestTime) {
            bestText = clipboardOfficialText;
            bestTime = clipboardUpdateTime;
        }

        if (bestText && bestText.length < CONFIG.minOfficialLength) {
            const otherText = bestText === pageOfficialText ? clipboardOfficialText : pageOfficialText;
            const otherTime = bestText === pageOfficialText ? clipboardUpdateTime : pageUpdateTime;
            if (otherText && otherText.length >= CONFIG.minOfficialLength) {
                bestText = otherText;
            } else {
                bestText = null;
            }
        }

        return bestText ? bestText.trim() : '';
    }

    function hasField(t, k) { return k.some(kw => t.includes(kw)); }

    function getCleanOptionText(el) {
        const f = el.querySelector(':scope > span');
        let txt = '';
        if (f) txt = f.textContent.trim();
        else txt = el.textContent || '';
        const tips = el.querySelector('.radio-tips');
        if (tips) txt = txt.replace(tips.textContent, '').trim();
        txt = txt.replace(/准新品|99新|95新|9新|7新及以下/g, '').trim();
        return txt;
    }

    function getSelectedValue(kw) {
        const ls = document.querySelectorAll('.el-form-item__label');
        for (const l of ls) {
            if (kw.some(k => l.textContent.trim() === k || l.textContent.trim().startsWith(k + '：') || l.textContent.trim().includes(k))) {
                const a = l.nextElementSibling?.querySelector('.el-radio-button.is-active .el-radio-button__inner');
                if (a) return getCleanOptionText(a);
            }
        }
        return '';
    }

    let bannerEl = null, hideTimer = null;

    function showInlineErrors(errMap) {
        document.querySelectorAll('.suk-err-tip').forEach(el => el.remove());
        if (!Object.keys(errMap).length) return;
        for (const [itemName, errMsg] of Object.entries(errMap)) {
            const item = CONFIG.items.find(it => it.name === itemName);
            const kws = item ? item.labelKeywords : [itemName];
            for (const kw of kws) {
                let found = false;
                for (const label of document.querySelectorAll('.el-form-item__label')) {
                    if (label.textContent.trim().includes(kw)) {
                        const content = label.nextElementSibling;
                        if (content) {
                            const tip = document.createElement('div');
                            tip.className = 'suk-err-tip';
                            tip.textContent = '⚠ ' + errMsg;
                            tip.style.cssText = 'color:#d93025; font-size:16px; font-weight:bold; white-space:nowrap; line-height:1.3; padding:1px 0;';
                            content.insertBefore(tip, content.firstChild);
                            found = true;
                        }
                        break;
                    }
                }
                if (found) break;
            }
        }
    }

    function showBanner(errs) {
        if (!errs.length) return hideBanner();
        if (!bannerEl) {
            bannerEl = document.createElement('div');
            bannerEl.style = CONFIG.bannerStyle;
            document.body.appendChild(bannerEl);
            hideTimer = setTimeout(hideBanner, CONFIG.bannerDuration);
        }
        bannerEl.innerHTML = '⚠️ ' + errs.join('；');
        bannerEl.style.whiteSpace = 'nowrap';
        bannerEl.style.width = 'auto';
    }

    function showBottomPopup(errMap) {
        const existing = document.querySelector('.suk-bottom-popup');
        if (existing) existing.remove();
        const names = Object.keys(errMap);
        if (!names.length) return;
        const text = names.join('-');
        const popup = document.createElement('div');
        popup.className = 'suk-bottom-popup';
        popup.textContent = '⚠【' + text + '】可能选错';
        popup.style.cssText = 'position:fixed; bottom:7cm; left:20px; z-index:100000; background:#d93025; color:#fff; padding:6px 8px; border-radius:6px; font-size:14px; font-weight:bold; box-shadow:0 4px 12px rgba(0,0,0,0.3); max-width:3.5cm; line-height:1.3; white-space:normal; overflow-wrap:break-word;';
        document.body.appendChild(popup);
    }

    function hideBanner() {
        if (bannerEl) { bannerEl.remove(); bannerEl = null; }
        clearTimeout(hideTimer);
        document.querySelectorAll('.suk-err-tip').forEach(el => el.remove());
        document.querySelectorAll('.suk-bottom-popup').forEach(el => el.remove());
    }

    function check(force = false) {
        try {
            const txt = getOfficialText();
            if (!txt || txt.length < CONFIG.minOfficialLength) {
                if (force && retryCount < CONFIG.maxRetries) {
                    retryCount++;
                    setTimeout(() => check(true), CONFIG.retryInterval);
                } else hideBanner();
                return;
            }
            retryCount = 0;

            const brand = getInputValueByLabel('品牌');
            const category = getInputValueByLabel('品类');
            // 品牌或品类为空时等待异步渲染完成
            if (force && (!brand || !category) && retryCount < CONFIG.maxRetries) {
                retryCount++;
                setTimeout(() => check(true), CONFIG.retryInterval);
                return;
            }
            retryCount = 0;
            // 如果黑机遮罩存在但当前数据不是黑机，清除
            if (document.querySelector('.qc-black-machine')) {
                if (!brand || !/苹果|Apple/i.test(brand) || !/是否(?:置换机器\/)?黑机[：:]\s*是/i.test(txt)) {
                    document.querySelector('.qc-black-machine').remove();
                    window._qcBlackMachineTime = 0;
                }
            }
            // 黑机检测：同时支持"是否置换机器/黑机: 是"和"是否黑机: 是"两种格式
            if (brand && /苹果|Apple/i.test(brand) && /是否(?:置换机器\/)?黑机[：:]\s*是/i.test(txt)) {
                if (document.querySelector('.qc-black-machine')) return;
                if (window._qcBlackMachineTime && Date.now() - window._qcBlackMachineTime < CONFIG.bannerDuration) return;
                window._qcBlackMachineTime = Date.now();
                const overlay = document.createElement('div');
                overlay.className = 'qc-black-machine';
                overlay.textContent = '该机器是黑机需要打掉';
                overlay.style.cssText = 'position:fixed; top:4cm; left:50%; transform:translateX(-50%); z-index:999999; background:#d93025; color:#fff; padding:15px 30px; font-size:1cm; font-weight:bold; text-align:center; border-radius:8px; box-shadow:0 4px 20px rgba(0,0,0,0.5);';
                document.body.appendChild(overlay);
                setTimeout(() => document.querySelector('.qc-black-machine')?.remove(), CONFIG.bannerDuration);
                return;
            }

            const inlineErrs = {};
            let hasActiveCheck = false;
            for (const it of CONFIG.items) {
                if (it.conditionalCheck) {
                    const sel = it.labelKeywords && it.labelKeywords.length ? getSelectedValue(it.labelKeywords) : null;
                    if (sel && /不涉及|不检测|跳过/i.test(sel)) continue;
                    const e = it.conditionalCheck(txt);
                    if (e) { inlineErrs[it.name] = e; }
                    hasActiveCheck = true;
                    continue;
                }
                let sel = getSelectedValue(it.labelKeywords);
                if (!sel || /不检测|不涉及|跳过/i.test(sel)) continue;
                hasActiveCheck = true;
                if (it.customCheck) {
                    if (it.requiredOfficialKeys && it.requiredOfficialKeys.length > 0 && !hasField(txt, it.requiredOfficialKeys)) continue;
                    const e = it.customCheck(txt, sel);
                    if (e) inlineErrs[it.name] = e;
                    continue;
                }
                if (it.requiredOfficialKeys && it.requiredOfficialKeys.length > 0 && !hasField(txt, it.requiredOfficialKeys)) continue;
                let terms = it.searchTransform ? (Array.isArray(it.searchTransform(sel)) ? it.searchTransform(sel) : [it.searchTransform(sel)]) : [sel];
                if (!terms.some(t => txt.toLowerCase().includes(t.toLowerCase()))) {
                    inlineErrs[it.name] = `${it.name} 在官方信息中未找到"${sel}"，可能选错`;
                }
            }
            const prevErrs = window._sukPrevInlineErrs || {};
            if (JSON.stringify(prevErrs) !== JSON.stringify(inlineErrs)) {
                if (hasActiveCheck) {
                    window._sukPrevInlineErrs = inlineErrs;
                    Object.keys(inlineErrs).length ? showInlineErrors(inlineErrs) : document.querySelectorAll('.suk-err-tip').forEach(el => el.remove());
                }
            } else if (hasActiveCheck && !Object.keys(inlineErrs).length && document.querySelector('.suk-err-tip')) {
                document.querySelectorAll('.suk-err-tip').forEach(el => el.remove());
            }
            showBottomPopup(inlineErrs);
            if (hasActiveCheck && Object.keys(inlineErrs).length) {
                showErrorModal(inlineErrs);
            }
            if (hasActiveCheck && clipboardOfficialText) {
                Object.keys(inlineErrs).length === 0 ? showNoAnomalyMessage() : hideNoAnomalyMessage();
            }
        } catch (e) {
            console.error('[质检] check 异常:', e);
        }
    }

    function addClipboardButton() {
        const readBtn = document.createElement('button');
        readBtn.textContent = '📋 读取剪贴板';
        readBtn.style.cssText = 'position:fixed; top:4cm; right:10px; z-index:100000; height:1.3cm; min-width:2.5cm; padding:0 0.2cm; background:#007aff; color:#fff; border:none; border-radius:0.3cm; cursor:pointer; font-size:0.3cm; line-height:1.3cm; box-shadow:0 2px 6px rgba(0,0,0,0.2); white-space:nowrap;';
        readBtn.onclick = async () => {
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
                    alert('无法读取剪贴板，请确保已授予权限。');
                    return;
                }
            }
            if (!text || text.trim().length < CONFIG.minOfficialLength) {
                alert('剪贴板内容太短，可能不是有效的查询信息。');
                return;
            }
            clipboardOfficialText = text.trim();
            clipboardUpdateTime = Date.now();
            retryCount = 0;
            check(true);
            showTemporaryMessage('✅ 已读取剪贴板信息，正在对比');
        };
        document.body.appendChild(readBtn);
    }

    function showTemporaryMessage(msg) {
        const div = document.createElement('div');
        div.textContent = msg;
        div.style.cssText = 'position:fixed; top:50px; right:10px; z-index:100001; padding:8px 12px; background:#333; color:#fff; border-radius:4px; font-size:14px; box-shadow:0 2px 6px rgba(0,0,0,0.3); opacity:0; transition:opacity 0.3s;';
        document.body.appendChild(div);
        requestAnimationFrame(() => div.style.opacity = '1');
        setTimeout(() => {
            div.style.opacity = '0';
            setTimeout(() => div.remove(), 300);
        }, 2000);
    }

    let acknowledgedErrors = [];

    function showErrorModal(errMap) {
        const allNames = Object.keys(errMap);
        if (!allNames.length) return;
        const newNames = allNames.filter(n => !acknowledgedErrors.includes(n));
        if (!newNames.length) return;
        document.querySelectorAll('.suk-error-modal-overlay').forEach(el => el.remove());
        const overlay = document.createElement('div');
        overlay.className = 'suk-error-modal-overlay';
        overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:999999; display:flex; justify-content:center; align-items:center;';
        const box = document.createElement('div');
        box.style.cssText = 'background:#fff; border-radius:8px; padding:24px; min-width:300px; max-width:450px; box-shadow:0 4px 20px rgba(0,0,0,0.3); text-align:center;';
        const title = document.createElement('div');
        title.textContent = '以下功能选错了，请检查：';
        title.style.cssText = 'font-size:16px; font-weight:bold; color:#d93025; margin-bottom:16px;';
        box.appendChild(title);
        const list = document.createElement('div');
        list.style.cssText = 'text-align:left; font-size:14px; color:#333; margin-bottom:16px;';
        for (const name of allNames) {
            const item = document.createElement('div');
            item.textContent = '• ' + name + '选错了';
            item.style.cssText = 'padding:4px 0;';
            list.appendChild(item);
        }
        box.appendChild(list);
        const confirmBtn = document.createElement('button');
        confirmBtn.textContent = '确认';
        confirmBtn.style.cssText = 'padding:8px 32px; background:#007aff; color:#fff; border:none; border-radius:4px; font-size:14px; cursor:pointer;';
        confirmBtn.onclick = () => {
            acknowledgedErrors.push(...allNames);
            overlay.remove();
        };
        box.appendChild(confirmBtn);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
    }

    function showNoAnomalyMessage() {
        hideNoAnomalyMessage();
        const div = document.createElement('div');
        div.className = 'suk-no-anomaly';
        div.textContent = '✅ 对比无异常';
        div.style.cssText = 'position:fixed; top:80px; right:10px; z-index:100001; padding:8px 12px; background:#34c759; color:#fff; border-radius:4px; font-size:14px; box-shadow:0 2px 6px rgba(0,0,0,0.3);';
        document.body.appendChild(div);
    }

    function hideNoAnomalyMessage() {
        document.querySelectorAll('.suk-no-anomaly').forEach(el => el.remove());
    }

    // ==================== 监听"开始检测"或"提交"按钮，清空所有对比缓存 ====================
    document.addEventListener('click', function(e) {
        const btn = e.target.closest('button');
        if (!btn) return;
        const span = btn.querySelector('span');
        if (!span) return;
        const btnText = span.textContent.trim();
        if (btnText === '开始检测' || btnText === '提交') {
            pageOfficialText = null;
            pageUpdateTime = 0;
            clipboardOfficialText = null;
            clipboardUpdateTime = 0;
            if (tableVirtualContainer && document.contains(tableVirtualContainer)) {
                tableVirtualContainer.remove();
            }
            tableVirtualContainer = null;
            hideBanner();
            hideNoAnomalyMessage();
            acknowledgedErrors = [];
            retryCount = 0;
            console.log('[质检高亮] 已清空对比数据，等待新查询结果');
        }
    });

    // ==================== 凌晨3点强刷 ====================
    function checkAutoRefresh() {
        const now = new Date();
        const hours = now.getHours();
        const today = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
        const refreshKey = 'qc_auto_refresh_date';

        if (hours < 3) return;
        if (localStorage.getItem(refreshKey) === today) return;

        localStorage.setItem(refreshKey, today);
        console.log(`[质检高亮] 凌晨${hours}:${now.getMinutes()} 触发强刷`);
        location.reload(true);
    }

    const refreshInterval = setInterval(checkAutoRefresh, 60 * 1000);
    window.addEventListener('unload', () => clearInterval(refreshInterval));
    checkAutoRefresh();

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            checkAutoRefresh();
        }
    });
    // ==================== 凌晨强刷结束 ====================

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        addClipboardButton();
    } else {
        window.addEventListener('DOMContentLoaded', addClipboardButton);
    }

    check(true);

    let checkTimer = null;
    const obs = new MutationObserver(() => {
        clearTimeout(checkTimer);
        checkTimer = setTimeout(() => { try { check(true); } catch (e) { console.error('[质检] observer check 异常:', e); } }, 300);
    });
    if (document.body) {
        obs.observe(document.body, {
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'aria-checked']
        });
    }
    window.addEventListener('unload', () => {
        obs.disconnect();
        clearTimeout(checkTimer);
    });
    window.addEventListener('load', () => setTimeout(() => { try { check(true); } catch (e) { console.error('[质检] load check 异常:', e); } }, 800));

    // ========== 自动检测更新（每6小时，刷新不重置计时） ==========
    const SUK_CK_KEY = 'suk_last_update_check';
    const SUK_CK_INTERVAL = 6 * 60 * 60 * 1000;
    const SUK_URL = 'https://cdn.jsdelivr.net/gh/1593125616-glitch/danghuan@main/suk.user.js';

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
        return Date.now() - GM_getValue(key, 0) >= SUK_CK_INTERVAL;
    }
    function markDone(key) { if (typeof GM_setValue !== 'undefined') GM_setValue(key, Date.now()); }

    function checkSukUpdate() {
        if (!shouldCheck(SUK_CK_KEY) || typeof GM_xmlhttpRequest === 'undefined') return;
        GM_xmlhttpRequest({
            method: 'GET', url: SUK_URL,
            onload: (resp) => {
                markDone(SUK_CK_KEY);
                const m = resp.responseText.match(/@version\s+(\S+)/);
                if (!m) return;
                if (isNewerVer(m[1], GM_info.script.version)) {
                    console.warn(`[质检] 发现新版本 ${m[1]}（当前 ${GM_info.script.version}）`);
                    if (confirm(`功能脚本发现新版本 ${m[1]}（当前 ${GM_info.script.version}），是否前往更新？`)) {
                        window.location.href = SUK_URL;
                    }
                }
            }
        });
    }
    checkSukUpdate();
    setInterval(checkSukUpdate, SUK_CK_INTERVAL);
})();
