import yaml from 'js-yaml';
import { clashFix } from '../../../utils/format-utils.js';
import { normalizeUnifiedTemplateModel } from '../template-model.js';
import { DNS_PROXY_GROUP, resolveSafeDnsConfig } from '../safe-dns.js';
import { applyMihomoChainProxy } from '../mihomo-chain-proxy.js';

function mapGroupType(type) {
    const normalized = String(type || '')
        .trim()
        .toLowerCase();
    if (
        normalized === 'url-test' ||
        normalized === 'fallback' ||
        normalized === 'load-balance' ||
        normalized === 'select'
    ) {
        return normalized;
    }
    return 'select';
}

function filterAutoSelectMembers(group) {
    const type = mapGroupType(group.type);
    const members = Array.isArray(group.members) ? group.members.filter(Boolean) : [];
    if (!['url-test', 'fallback', 'load-balance'].includes(type)) {
        return members;
    }
    return members.filter(
        (member) =>
            !['DIRECT', 'REJECT', 'REJECT-DROP', 'PASS'].includes(String(member).toUpperCase())
    );
}

const ACL4SSR_IPCIDR_PROVIDER_FILES = new Set([
    'amazonip',
    'chinacompanyip',
    'chinaip',
    'chinaipv6',
    'netflixip',
]);

function getRuleProviderOptions(pathname, nameHint) {
    if (/\.(list|txt)$/i.test(pathname)) return { behavior: 'classical', format: 'text' };
    if (/\.mrs$/i.test(pathname)) {
        return { behavior: /\/geoip\//i.test(pathname) ? 'ipcidr' : 'domain', format: 'mrs' };
    }
    return { behavior: ACL4SSR_IPCIDR_PROVIDER_FILES.has(nameHint) ? 'ipcidr' : 'classical' };
}

function mapRule(rule, ruleProviderMap) {
    const type = String(rule.type || '').toUpperCase();
    if (!type) return null;
    if (type === 'MATCH' || type === 'FINAL') return `MATCH,${rule.policy}`;
    const value = type === 'RULE-SET' ? ruleProviderMap.get(rule.value) || rule.value : rule.value;
    return [type, value, rule.policy, ...(rule.extras || [])].join(',');
}

export function renderClashFromTemplateModel(model) {
    const normalizedModel = normalizeUnifiedTemplateModel(model);

    // 所有客户端都保留链式策略组；仅 Mihomo/Meta 展开节点级 dialer-proxy。
    if (Array.isArray(normalizedModel.extras?.chainProxy)) {
        applyMihomoChainProxy(normalizedModel, {
            enableDialerProxy: Boolean(normalizedModel.meta?.isMeta),
        });
    }

    const ruleProviders = {};
    const ruleProviderMap = new Map();
    normalizedModel.rules.forEach((rule) => {
        const type = String(rule.type || '').toUpperCase();
        const providerUrl = rule.value;
        if (type !== 'RULE-SET' || !/^https?:\/\//i.test(providerUrl)) return;
        if (ruleProviderMap.has(providerUrl)) return;

        const { pathname } = new URL(providerUrl);
        const fileName = pathname
            .split('/')
            .pop()
            .replace(/\.(ya?ml|list|txt|conf|mrs)$/i, '');
        const nameHint = fileName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase() || 'rs';
        const providerName = `${nameHint}_${ruleProviderMap.size}`;
        ruleProviderMap.set(providerUrl, providerName);
        const options = getRuleProviderOptions(pathname, nameHint);
        ruleProviders[providerName] = {
            type: 'http',
            ...options,
            url: providerUrl,
            path: `./ruleset/${providerName}.${options.format === 'text' ? 'list' : options.format || 'yaml'}`,
            interval: 86400,
        };
    });

    const config = {
        'mixed-port': 7890,
        'allow-lan': false,
        'bind-address': '127.0.0.1',
        ipv6: false,
        mode: 'rule',
        'log-level': 'info',
        'external-controller': '127.0.0.1:9090',
        dns: resolveSafeDnsConfig(normalizedModel.settings?.customDnsOverride, {
            mode: normalizedModel.settings?.dnsMode,
            proxyGroup: DNS_PROXY_GROUP,
        }),
        proxies: normalizedModel.proxies.map(({ metadata, ...proxy }) => proxy),
        'proxy-groups': normalizedModel.groups
            .filter(
                (group) =>
                    (Array.isArray(group.members) && group.members.length > 0) ||
                    (Array.isArray(group.filters) && group.filters.length > 0)
            )
            .map((group) => {
                return {
                    name: group.name,
                    type: mapGroupType(group.type),
                    proxies: filterAutoSelectMembers(group),
                    filter:
                        Array.isArray(group.filters) && group.filters.length > 0
                            ? group.filters.join('|')
                            : undefined,
                    ...group.options,
                };
            }),
        'rule-providers': Object.keys(ruleProviders).length > 0 ? ruleProviders : undefined,
        rules: normalizedModel.rules.map((rule) => mapRule(rule, ruleProviderMap)).filter(Boolean),
        profile: {
            'store-selected': true,
            'subscription-url': normalizedModel.settings.managedConfigUrl || '',
        },
    };

    let yamlStr = yaml.dump(config, {
        indent: 2,
        lineWidth: -1,
        noRefs: true,
        quotingType: '"',
        forceQuotes: false,
    });
    yamlStr = clashFix(yamlStr);
    return yamlStr;
}
