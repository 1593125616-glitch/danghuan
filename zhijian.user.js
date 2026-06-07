// ==UserScript==
// @name         质检选项核对横幅（全功能）
// @namespace    http://tampermonkey.net/
// @version      1.0.0.80
// @description  质检核对：保修、延保、网络锁（仅非国行）、单卡强制、开卡槽、存储、颜色等（不含型号对比）
// @author       py1998
// @match        https://yihuan.oppoer.me/*
// @grant        none
// @updateURL    https://raw.gitcode.com/py1998/danghuan/raw/main/zhijian.user.js
// @downloadURL  https://raw.gitcode.com/py1998/danghuan/raw/main/zhijian.user.js
// ==/UserScript==

(function() {
    'use strict';

    const forceSingleSimModels = [
        'iphone12mini', 'iphone13mini',
        '三星galaxyzflip4g', '三星galaxyzflip5g', '三星galaxyzflip35g', '三星galaxyzflip3奥运纪念版',
        '三星galaxyzflip45g', '三星w23flip5g', '三星galaxyzflip55g', '三星w24flip5g'
    ];

    function isForceSingleSimModel(modelStr) {
        const normalized = modelStr.toLowerCase().replace(/\s+/g, '').replace(/[（()）{}【】\[\]]/g, '');
        return forceSingleSimModels.some(target => normalized.includes(target) || target.includes(normalized));
    }

    // 华为手表颜色映射规则
    const huaweiWatchColorRules = [
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
        { keywords: ['钛空银', '钛金属表带'], expected: '钛空银' },
        { keywords: ['不锈钢表壳', '褐色真皮表带'], expected: '土星褐' }
    ];

    const CONFIG = {
        areaSelectors: ['.yabao-report-detail', '.report-info', '.info-content', '.right-info'],
        items: [
            {
                name: 'SIM卡',
                labelKeywords: ['SIM卡'],
                conditionalCheck: () => {
                    const model = getInputValueByLabel('机型');
                    if (!model) return null;
                    if (!isForceSingleSimModel(model)) return null;
                    let simSelection = '';
                    const allLabels = document.querySelectorAll('.el-form-item__label');
                    for (const label of allLabels) {
                        if (/^SIM卡\s*[:：]?\s*$/.test(label.textContent.trim())) {
                            const content = label.nextElementSibling;
                            if (content) {
                                const active = content.querySelector('.el-radio-button.is-active .el-radio-button__inner');
                                if (active) simSelection = getCleanOptionText(active);
                            }
                            break;
                        }
                    }
                    if (simSelection !== '单卡') {
                        return `该机型必须选择单卡，当前为【${simSelection || '未选择'}】`;
                    }
                    return null;
                }
            },
            {
                name: '颜色',
                labelKeywords: ['颜色', '机身颜色', '配色'],
                customCheck: (officialText, selectedVal) => {
                    const category = getInputValueByLabel('品类');
                    const brand = getInputValueByLabel('品牌');

                    if (category === '智能手表') {
                        if (/小米|Redmi|红米/i.test(brand)) return null;

                        let officialColor = getOfficialColorFromDOM();
                        if (!officialColor) {
                            const m = officialText.match(/颜色[：:]\s*(.+?)(?:\n|$)/i);
                            if (m) officialColor = m[1].trim();
                        }
                        if (!officialColor) return null;

                        if (/华为/i.test(brand)) {
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

                        const normalize = s => s.replace(/曜/g, '耀').trim();
                        const normalizedSelected = normalize(selectedVal);
                        const normalizedOfficial = normalize(officialColor);
                        if (normalizedOfficial.includes(normalizedSelected) || normalizedSelected.includes(normalizedOfficial)) {
                            return null;
                        }
                        return `颜色 应为【${officialColor}】，你选了【${selectedVal}】`;
                    }

                    const normalize = s => s.replace(/曜/g, '耀').trim();
                    const normalizedSelected = normalize(selectedVal);

                    if (brand === '荣耀') {
                        const skuMatch = officialText.match(/SKU型号[：:]\s*(.+?)(?:\n|$)/i);
                        if (skuMatch) {
                            if (normalize(skuMatch[1].trim()).includes(normalizedSelected)) return null;
                            return `颜色 在SKU型号中未找到"${selectedVal}"，可能选错`;
                        }
                    }

                    let officialColor = getOfficialColorFromDOM();
                    if (!officialColor) {
                        const m = officialText.match(/(?:颜色|机身颜色)[：:]\s*(\S+)/);
                        if (m) officialColor = m[1].trim();
                    }

                    if ((!officialColor || /^(提示|关闭|提示关|提示关闭)$/i.test(officialColor)) && brand === '华为') {
                        const skuMatch = officialText.match(/SKU型号[：:]\s*(.+?)(?:\n|$)/i);
                        if (skuMatch) {
                            if (normalize(skuMatch[1].trim()).includes(normalizedSelected)) return null;
                            return `颜色 在SKU型号中未找到"${selectedVal}"，可能选错`;
                        }
                    }

                    if (!officialColor || /^(提示|关闭|提示关|提示关闭)$/i.test(officialColor)) return null;

                    if (normalize(officialColor).includes(normalizedSelected) || normalizedSelected.includes(normalize(officialColor))) return null;
                    return `颜色 应为【${officialColor}】，你选了【${selectedVal}】`;
                }
            },
            {
                name: '存储容量',
                labelKeywords: ['存储容量', '存储', '内存', '容量'],
                customCheck: (officialText, selectedVal) => {
                    function normalizeStorage(str) {
                        const m = str.match(/^(\d+)\s*(GB|G|TB|T)?\s*\+\s*(\d+)\s*(GB|G|TB|T)?$/i);
                        if (m) {
                            let u1 = (m[2] || 'GB').toUpperCase().replace(/^G$/, 'GB').replace(/^T$/, 'TB');
                            let u2 = (m[4] || 'GB').toUpperCase().replace(/^G$/, 'GB').replace(/^T$/, 'TB');
                            return m[1] + u1 + '+' + m[3] + u2;
                        }
                        const m2 = str.match(/^(\d+)\s*(GB|G|TB|T)?\s+(\d+)\s*(GB|G|TB|T)?$/i);
                        if (m2) {
                            let u1 = (m2[2] || 'GB').toUpperCase().replace(/^G$/, 'GB').replace(/^T$/, 'TB');
                            let u2 = (m2[4] || 'GB').toUpperCase().replace(/^G$/, 'GB').replace(/^T$/, 'TB');
                            return m2[1] + u1 + '+' + m2[3] + u2;
                        }
                        return str.replace(/\s+/g, '').replace(/(\d+)G(?!B)/gi, '$1GB').replace(/(\d+)T(?!B)/gi, '$1TB');
                    }
                    let stdSelected = normalizeStorage(selectedVal);
                    const capacityRegex = /(\d+)\s*(GB|G|TB|T)?\s*\+\s*(\d+)\s*(GB|G|TB|T)?/gi;
                    let capMatch;
                    while ((capMatch = capacityRegex.exec(officialText)) !== null) {
                        const found = capMatch[0];
                        const normalized = normalizeStorage(found);
                        if (normalized.toLowerCase() === stdSelected.toLowerCase()) return null;
                    }
                    const variants = [stdSelected, stdSelected.replace('+', ' ')];
                    if (variants.some(v => officialText.toLowerCase().includes(v.toLowerCase()))) return null;
                    const storagePatterns = [
                        /(\d+)\s*\+\s*(\d+)\s*(?:GB|G|gb|g)?/gi,
                        /(\d+)\s*G(?:B)?\s*\+\s*(\d+)\s*G(?:B)?/gi,
                    ];
                    for (const p of storagePatterns) {
                        let m;
                        while ((m = p.exec(officialText)) !== null) {
                            const officialCapacity = m[1] + 'GB+' + m[2] + 'GB';
                            if (officialCapacity.toLowerCase() === stdSelected.toLowerCase()) return null;
                        }
                    }
                    return `存储容量 在官方信息中未找到"${selectedVal}"，可能选错`;
                }
            },
            {
                name: '购买渠道',
                labelKeywords: ['购买渠道', '渠道', '国家版本', '销售地区'],
                customCheck: (officialText, selectedVal) => {
                    if (/非国行/.test(officialText)) {
                        return selectedVal === '非国行' ? null : `购买渠道 应为【非国行】，你选了【${selectedVal}】`;
                    }
                    const patterns = [
                        /国家版本(?:（中文）)?[：:]\s*(.+?)(?:\n|$)/ig,
                        /购买国家(?:（中文）)?[：:]\s*(.+?)(?:\n|$)/ig,
                        /国家版本（英文）[：:]\s*(.+?)(?:\n|$)/ig
                    ];
                    let version = null;
                    for (const p of patterns) {
                        let m;
                        while ((m = p.exec(officialText)) !== null) {
                            if (m[1].trim()) { version = m[1].trim(); break; }
                        }
                        if (version) break;
                        p.lastIndex = 0;
                    }
                    if (!version) return null;
                    if (/^国行|China|中国$/.test(version)) {
                        return selectedVal === '国行' ? null : `购买渠道 应为【国行】，你选了【${selectedVal}】`;
                    }
                    return null;
                },
                requiredOfficialKeys: ['国家版本', '购买国家'],
            },
            {
                name: '保修状态',
                labelKeywords: ['保修状态', '保修', '是否在保'],
                customCheck: (officialText, selectedVal) => {
                    if (/非国行/.test(officialText)) {
                        return selectedVal === '已过保' ? null : `保修状态 应为【已过保】（非国行），你选了【${selectedVal}】`;
                    }
                    const datePatterns = [
                        /预估保修结束日期[：:]\s*(?:<[^>]+>)?(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/i,
                        /保修结束日期[：:]\s*(?:<[^>]+>)?(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/i,
                        /保修截止日期[：:]\s*(?:<[^>]+>)?(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/i,
                        /保修结束日期[：:]\s*(\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\s+\d{1,2}:\d{2}:\d{2})/,
                        /保修截止日期[：:]\s*(\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\s+\d{1,2}:\d{2}:\d{2})/,
                        /保修状态[：:]\s*(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/i,
                    ];
                    for (const p of datePatterns) {
                        const m = officialText.match(p);
                        if (m) {
                            let endDate;
                            if (m.length === 4) {
                                const year = parseInt(m[1]);
                                const month = parseInt(m[2]);
                                const day = parseInt(m[3]);
                                endDate = new Date(year, month - 1, day);
                            } else if (m[1]) {
                                endDate = new Date(m[1].replace(/\//g, '-'));
                            }
                            if (endDate && !isNaN(endDate)) {
                                if (checkExtendedWarranty(officialText)) {
                                    endDate = new Date(endDate.getTime() - 365 * 24 * 60 * 60 * 1000);
                                }
                                const threshold = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                                const officialVal = endDate > threshold ? '未过保' : '已过保';
                                return officialVal === selectedVal ? null : `保修状态 应为【${officialVal}】，你选了【${selectedVal}】`;
                            }
                        }
                    }
                    return null;
                },
                requiredOfficialKeys: ['保修结束日期', '保修截止日期', '预估保修结束日期', '保修状态'],
            },
            {
                name: '激活状态',
                labelKeywords: ['激活状态', '激活', '是否激活'],
                customCheck: (officialText, selectedVal) => {
                    const container = findOfficialContainer();
                    const text = container ? container.innerText : officialText;
                    const lines = text.split('\n');
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
                            if (/\d{4}[年\/-]\d{1,2}[月\/-]\d{1,2}/.test(raw)) {
                                return selectedVal === '已激活' ? null : `激活状态 应为【已激活】，你选了【${selectedVal}】`;
                            }
                            if (/已激活|激活/.test(raw) && !/未激活/.test(raw)) {
                                return selectedVal === '已激活' ? null : `激活状态 应为【已激活】，你选了【${selectedVal}】`;
                            }
                            if (/未激活/.test(raw)) {
                                return selectedVal === '未激活' ? null : `激活状态 应为【未激活】，你选了【${selectedVal}】`;
                            }
                        }
                    }
                    return null;
                },
                requiredOfficialKeys: ['是否激活', '激活状态', '机器状态'],
            },
            {
                name: '主板维修',
                labelKeywords: ['主板维修'],
                conditionalCheck: (officialText) => {
                    const brand = getInputValueByLabel('品牌');
                    const model = getInputValueByLabel('机型');
                    if (!brand || !model) return null;
                    const isApple = /苹果|Apple/i.test(brand);
                    const iPhoneMatch = model.match(/iPhone\s*(\d+)/i);
                    if (!isApple || !iPhoneMatch || parseInt(iPhoneMatch[1]) < 14) return null;
                    if (!/非国行/.test(officialText)) return null;
                    let simSelection = '';
                    document.querySelectorAll('.el-form-item__label').forEach(label => {
                        if (/^SIM卡\s*[:：]?\s*$/.test(label.textContent.trim())) {
                            const active = label.nextElementSibling?.querySelector('.el-radio-button.is-active .el-radio-button__inner');
                            if (active) simSelection = getCleanOptionText(active);
                        }
                    });
                    if (/不涉及|不检测|跳过/i.test(simSelection)) return null;
                    const selected = getSelectedValue(['主板维修']);
                    if (!selected || /不涉及|不检测|跳过/i.test(selected)) return null;

                    if (simSelection === '单卡') {
                        let countryVersion = '';
                        const patterns = [
                            /国家版本(?:（中文）)?[：:]\s*(.+?)(?:\n|$)/ig,
                            /国家版本（英文）[：:]\s*(.+?)(?:\n|$)/ig
                        ];
                        for (const p of patterns) {
                            let m;
                            while ((m = p.exec(officialText)) !== null) {
                                if (m[1].trim()) { countryVersion = m[1].trim(); break; }
                            }
                            if (countryVersion) break;
                            p.lastIndex = 0;
                        }

                        const isUSA = /美国|United States/i.test(countryVersion);
                        const expected = isUSA ? '开卡槽' : '未检出维修痕迹';
                        const tip = isUSA ? '' : '（欧版单卡自带卡槽）';
                        return selected === expected ? null : `主板维修 应为【${expected}】${tip}，你选了【${selected}】`;
                    } else {
                        return selected === '开卡槽' ? null : `主板维修 应为【开卡槽】，你选了【${selected}】`;
                    }
                },
            },
            {
                name: '通话功能',
                labelKeywords: [],
                conditionalCheck: (officialText) => {
                    if (!/非国行/.test(officialText)) return null;
                    const lockedMatch = officialText.match(/网络锁[：:]\s*有锁\s*(?:\(Locked\))?/i)
                                    || officialText.match(/是否有锁机[：:]\s*有锁/i);
                    const unlockedMatch = officialText.match(/网络锁[：:]\s*无锁\s*(?:\(Unlocked\))?/i)
                                      || officialText.match(/是否有锁机[：:]\s*无锁/i);
                    if (!lockedMatch && !unlockedMatch) return null;
                    const expectedOption = lockedMatch ? '有运营商锁' : '正常';
                    const callSection = findCallFunctionSection();
                    if (!callSection) return null;
                    const radioGroups = callSection.querySelectorAll('.el-radio-group');
                    const wrongItems = [];
                    radioGroups.forEach(group => {
                        const options = Array.from(group.querySelectorAll('.el-radio-button__inner'));
                        const hasNormal = options.some(inner => getCleanOptionText(inner) === '正常');
                        const hasCarrierLock = options.some(inner => getCleanOptionText(inner) === '有运营商锁');
                        if (!hasNormal || !hasCarrierLock) return;
                        const activeRadio = group.querySelector('.el-radio-button.is-active');
                        if (!activeRadio) return;
                        const activeInner = activeRadio.querySelector('.el-radio-button__inner');
                        if (!activeInner) return;
                        const activeText = getCleanOptionText(activeInner);
                        if (/不涉及|不检测|跳过/i.test(activeText)) return;
                        if (activeText !== expectedOption) {
                            const formItem = group.closest('.el-form-item');
                            let itemName = '';
                            if (formItem) {
                                const label = formItem.querySelector('.el-form-item__label');
                                if (label) itemName = label.textContent.trim();
                            }
                            if (!itemName) itemName = '未知项';
                            wrongItems.push(`${itemName}（选了"${activeText}"）`);
                        }
                    });
                    if (wrongItems.length > 0) {
                        const lockType = lockedMatch ? '有锁' : '无锁';
                        return `网络锁${lockType}，通话相关SIM卡须选"${expectedOption}"，以下项未正确：${wrongItems.join('、')}`;
                    }
                    return null;
                },
            },
            {
                name: 'SIM/eSIM',
                labelKeywords: ['SIM/eSIM'],
                conditionalCheck: (officialText) => {
                    const brand = getInputValueByLabel('品牌');
                    const category = getInputValueByLabel('品类');
                    if (!brand || !category) return null;
                    if (!/小米|Redmi|红米/i.test(brand)) return null;
                    if (category !== '智能手表') return null;

                    let selected = '';
                    const allLabels = document.querySelectorAll('.el-form-item__label');
                    for (const label of allLabels) {
                        const labelText = label.textContent.trim();
                        if (/SIM[\/\\]eSIM/.test(labelText)) {
                            const content = label.nextElementSibling;
                            if (content) {
                                const active = content.querySelector('.el-radio-button.is-active .el-radio-button__inner');
                                if (active) selected = getCleanOptionText(active);
                            }
                            break;
                        }
                    }

                    if (!selected || /不检测|跳过/i.test(selected)) return null;

                    const modelMatch = officialText.match(/型号配置[：:]\s*(.+?)(?:\n|$)/i);
                    const modelConfig = modelMatch ? modelMatch[1].trim() : '';

                    const hasEsim = /esim/i.test(modelConfig) || /Xiaomi\s*Watch\s*S4\s*Sport/i.test(modelConfig);

                    const expected = hasEsim ? '正常' : '不涉及';
                    if (selected !== expected) {
                        return `SIM/eSIM 应为【${expected}】，你选了【${selected}】`;
                    }
                    return null;
                },
            },
            {
                name: '尾插螺丝',
                labelKeywords: [],
                conditionalCheck: () => {
                    const brand = getInputValueByLabel('品牌');
                    const category = getInputValueByLabel('品类');
                    if (!brand || !category) return null;
                    if (/苹果|Apple/i.test(brand) && category === '手机') return null;
                    if (category !== '手机' && category !== '平板') return null;

                    const allLabels = document.querySelectorAll('.el-form-item__label');
                    for (const label of allLabels) {
                        if (label.textContent.trim().includes('尾插螺丝')) {
                            return '检查是否有尾插螺丝';
                        }
                    }
                    return null;
                },
            },
        ],
        bannerStyle: `position:fixed; top:0; left:50%; transform:translateX(-50%); z-index:99999; background:#d93025; color:#fff; padding:8px 16px; font-size:14px; font-weight:bold; text-align:center; border-radius:0 0 6px 6px; box-shadow:0 2px 8px rgba(0,0,0,0.3); white-space:nowrap;`,
        minOfficialLength: 30,
        maxRetries: 20,
        retryInterval: 500,
        bannerDuration: 120000,
    };

    let retryCount = 0;

    function checkExtendedWarranty(t) {
        return /是否购买了华为care[：:]\s*有|是否购买care[：:]\s*有|是否购买延保[：:]\s*是|延保[：:]\s*生效中|是否购买AC[：:]\s*是/i.test(t);
    }

    function findOfficialContainer() {
        for (const s of CONFIG.areaSelectors) {
            const e = document.querySelector(s);
            if (e && e.textContent.trim().length >= CONFIG.minOfficialLength) return e;
        }
        return null;
    }

    function getOfficialColorFromDOM() {
        const a = findOfficialContainer();
        if (!a) return null;
        const ss = a.querySelectorAll('span');
        for (let i = 0; i < ss.length; i++) {
            const t = ss[i].textContent.trim();
            if (/^(颜色|机身颜色)[：:]\s*$/.test(t) || t === '颜色' || t === '机身颜色') {
                const n = ss[i + 1];
                if (n && !/提示|关闭/.test(n.textContent.trim())) return n.textContent.trim();
            }
            const m = t.match(/^(?:颜色|机身颜色)[：:]\s*(.+)$/);
            if (m && m[1].trim() && !/^(提示|关闭|提示关|提示关闭)$/i.test(m[1].trim())) return m[1].trim();
        }
        return null;
    }

    function getInputValueByLabel(lbl) {
        const ls = document.querySelectorAll('.el-form-item__label');
        for (const l of ls) {
            if (l.textContent.trim() === lbl) {
                const inp = l.nextElementSibling?.querySelector('.el-input__inner');
                return inp ? inp.value.trim() : '';
            }
        }
        return '';
    }

    function getOfficialText() {
        const c = findOfficialContainer();
        return c ? c.textContent.trim() : '';
    }

    function hasField(t, k) { return k.some(kw => t.includes(kw)); }

    function getCleanOptionText(el) {
        const f = el.querySelector(':scope > span');
        let txt = '';
        if (f) {
            txt = f.textContent.trim();
        } else {
            txt = el.textContent || '';
        }
        const tips = el.querySelector('.radio-tips');
        if (tips) {
            txt = txt.replace(tips.textContent, '').trim();
        }
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

    function findCallFunctionSection() {
        const hs = document.querySelectorAll('h4');
        for (const h of hs) {
            if (h.textContent.trim() === '通话功能') return h.parentElement;
        }
        return null;
    }

    let bannerEl = null, hideTimer = null;

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

    function hideBanner() {
        if (bannerEl) { bannerEl.remove(); bannerEl = null; }
        clearTimeout(hideTimer);
    }

    function check(force = false) {
        const txt = getOfficialText();
        if (!txt || txt.length < CONFIG.minOfficialLength) {
            if (force && retryCount < CONFIG.maxRetries) {
                retryCount++;
                setTimeout(() => check(true), CONFIG.retryInterval);
            } else {
                hideBanner();
            }
            return;
        }
        retryCount = 0;

        const brand = getInputValueByLabel('品牌');
        if (brand && /苹果|Apple/i.test(brand) && /是否置换机器\/黑机[：:]\s*是/i.test(txt)) {
            showBanner(['该机型是黑机需要打掉']);
            return;
        }

        const errs = [];
        for (const it of CONFIG.items) {
            if (it.conditionalCheck) {
                const sel = it.labelKeywords && it.labelKeywords.length ? getSelectedValue(it.labelKeywords) : null;
                if (sel && /不涉及|不检测|跳过/i.test(sel)) continue;
                const e = it.conditionalCheck(txt);
                if (e) errs.push(e);
                continue;
            }
            let sel = getSelectedValue(it.labelKeywords);
            if (!sel || /不检测|不涉及|跳过/i.test(sel)) continue;
            if (it.customCheck) {
                if (it.requiredOfficialKeys && !hasField(txt, it.requiredOfficialKeys)) continue;
                const e = it.customCheck(txt, sel);
                if (e) errs.push(e);
                continue;
            }
            if (it.requiredOfficialKeys && !hasField(txt, it.requiredOfficialKeys)) continue;
            let terms = it.searchTransform ? (Array.isArray(it.searchTransform(sel)) ? it.searchTransform(sel) : [it.searchTransform(sel)]) : [sel];
            if (!terms.some(t => txt.toLowerCase().includes(t.toLowerCase()))) {
                errs.push(`${it.name} 在官方信息中未找到"${sel}"，可能选错`);
            }
        }
        errs.length > 0 ? showBanner(errs) : hideBanner();
    }

    check(true);

    const obs = new MutationObserver(() => {
        clearTimeout(window.__checkTimer);
        window.__checkTimer = setTimeout(() => check(true), 300);
    });
    obs.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'aria-checked']
    });
    window.addEventListener('load', () => setTimeout(() => check(true), 800));
})();
