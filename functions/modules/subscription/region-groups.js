import { extractNodeRegion, getRegionMatchName } from '../utils/geo-utils.js';

// 地区展示配置：包含 Emoji 和标准中文名称
const REGION_DISPLAY_CONFIG = {
    香港: { flag: '🇭🇰', name: '香港节点' },
    台湾: { flag: '🇹🇼', name: '台湾节点' },
    日本: { flag: '🇯🇵', name: '日本节点' },
    新加坡: { flag: '🇸🇬', name: '狮城节点' },
    美国: { flag: '🇺🇸', name: '美国节点' },
    韩国: { flag: '🇰🇷', name: '韩国节点' },
    英国: { flag: '🇬🇧', name: '英国节点' },
    德国: { flag: '🇩🇪', name: '德国节点' },
    法国: { flag: '🇫🇷', name: '法国节点' },
    加拿大: { flag: '🇨🇦', name: '加拿大节点' },
    澳大利亚: { flag: '🇦🇺', name: '澳洲节点' },
    巴西: { flag: '🇧🇷', name: '巴西节点' },
    西班牙: { flag: '🇪🇸', name: '西班牙节点' },
    荷兰: { flag: '🇳🇱', name: '荷兰节点' },
    俄罗斯: { flag: '🇷🇺', name: '俄国节点' },
    印度: { flag: '🇮🇳', name: '印度节点' },
    土耳其: { flag: '🇹🇷', name: '土耳其节点' },
};

function normalizeRegionOverrides(overrides = []) {
    if (!Array.isArray(overrides)) return [];
    return overrides
        .map((rule) => {
            if (!rule || !rule.pattern || !rule.region) return null;
            try {
                return {
                    pattern: new RegExp(rule.pattern, rule.flags || 'i'),
                    region: String(rule.region).trim(),
                };
            } catch {
                return null;
            }
        })
        .filter(Boolean);
}

export function groupNodeLinesByRegion(nodes = [], options = {}) {
    const groups = new Map();
    const regionOverrides = normalizeRegionOverrides(options.regionOverrides);

    nodes.forEach((node) => {
        const tagName = node.tag || node.name;
        let region = '其他';
        const override = regionOverrides.find((rule) =>
            rule.pattern.test(getRegionMatchName(tagName))
        );

        // 1. 用户自定义规则优先，用于修正自动地区识别误判
        if (override) {
            region = override.region;
        } else if (node.metadata && node.metadata.region && node.metadata.region !== '其他') {
            // 2. 使用预提取的元数据
            region = node.metadata.region;
        } else {
            // 3. 与节点元数据共用地区识别规则。
            region = extractNodeRegion(tagName);
        }

        // 4. 构造标准的展示组名
        const config = REGION_DISPLAY_CONFIG[region] || { flag: '🌍', name: `${region}节点` };
        const groupName = `${config.flag} ${config.name}`;

        if (!groups.has(groupName)) {
            groups.set(groupName, []);
        }
        groups.get(groupName).push(node);
    });

    const result = [];
    groups.forEach((matchedNodes, name) => {
        result.push({
            name,
            tags: matchedNodes.map((item) => item.tag || item.name),
            nodes: matchedNodes,
            count: matchedNodes.length,
            selectorTag: `${name} 选择`,
            urltestTag: `${name} 测速`,
            fallbackTag: `${name} 兜底`,
        });
    });

    return result;
}
