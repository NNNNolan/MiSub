import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import yaml from 'js-yaml';
import { generateBuiltinClashConfig } from '../../functions/modules/subscription/builtin-clash-generator.js';
import {
    ProcessorService,
    isClashYamlProfileTemplate,
    isIniTemplateSource,
} from '../../functions/services/processor-service.js';

vi.mock('../../functions/modules/subscription/builtin-clash-generator.js', { spy: true });

const NODE_LIST = 'trojan://pass@1.1.1.1:443#HK-01';

const YAML_CHAIN_TEMPLATE = `
mode: rule
proxy-groups:
  - name: 🔗 链式前置
    type: select
    include-all-proxies: true
  - name: 🔗 链式落地
    type: select
    proxies: []
x-misub-chain-proxy:
  - landing-group: 🔗 链式落地
    entry-group: 🔗 链式前置
    clone-prefix: "🔗 链式落地|"
rules:
  - MATCH,🔗 链式落地
`;
const TWO_NODE_LIST = [
    'trojan://pass@1.1.1.1:443#HK-01',
    'trojan://pass@example.test:443#DE-01',
].join('\n');

describe('ProcessorService.renderOutput', () => {
    const storageAdapter = {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn(),
    };

    beforeEach(() => {
        vi.stubGlobal(
            'fetch',
            vi.fn(
                async () =>
                    new Response(
                        `
[Proxy Group]
MyGroup = select, HK-01, DIRECT

[Rule]
MATCH,MyGroup
`,
                        { status: 200 }
                    )
            )
        );
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it('recognizes remote ini templates with query strings', async () => {
        expect(
            isIniTemplateSource({
                kind: 'remote',
                value: 'https://example.com/template.ini?token=abc',
            })
        ).toBe(true);

        const result = await ProcessorService.renderOutput({
            targetFormat: 'clash',
            combinedNodeList: NODE_LIST,
            subName: 'Demo',
            config: { UpdateInterval: 86400 },
            builtinOptions: { ruleLevel: 'std', enableUdp: true, skipCertVerify: false },
            templateSource: { kind: 'remote', value: 'https://example.com/template.ini?token=abc' },
            managedConfigUrl: 'https://example.com/sub',
            storageAdapter,
        });

        expect(result.contentType).toBe('application/x-yaml; charset=utf-8');
        expect(result.content).toContain('name: MyGroup');
        expect(result.content).toContain('MATCH,MyGroup');
        expect(generateBuiltinClashConfig).not.toHaveBeenCalled();
    });

    it.each([
        ['empty response', ''],
        ['HTML response', '<!doctype html><pre>\n[Rule]\nMATCH,DIRECT\n</pre>'],
        ['groups without rules', '[custom]\ncustom_proxy_group=Proxy`select`.*'],
        ['invalid ruleset', '[custom]\nruleset=DIRECT,'],
        [
            'invalid source before FINAL',
            '[custom]\nruleset=DIRECT,not-a-url\nruleset=DIRECT,[]FINAL',
        ],
    ])('rejects a remote INI with %s instead of returning a different config', async (_, text) => {
        fetch.mockResolvedValueOnce(new Response(text, { status: 200 }));

        await expect(
            ProcessorService.renderOutput({
                targetFormat: 'clash',
                combinedNodeList: NODE_LIST,
                config: {},
                templateSource: { kind: 'remote', value: 'https://example.com/template.ini' },
                storageAdapter,
            })
        ).rejects.toThrow(/invalid remote INI template/i);
    });

    it('preserves node options and the Stash subscription URL with an INI template', async () => {
        const result = await ProcessorService.renderOutput({
            targetFormat: 'clash',
            combinedNodeList: NODE_LIST,
            config: {},
            builtinOptions: { enableTfo: true, addFlagEmoji: false, userAgent: 'Stash/2.5.3' },
            templateSource: { kind: 'remote', value: 'https://example.com/template.ini' },
            managedConfigUrl: 'https://example.com/sub',
            storageAdapter,
        });

        expect(result.content.split('\n')[0]).toBe('#SUBSCRIBED https://example.com/sub');
        expect(yaml.load(result.content).proxies[0]).toMatchObject({ name: 'HK-01', tfo: true });
    });

    it('uses builtin rendering when templateSource is omitted', async () => {
        const result = await ProcessorService.renderOutput({
            targetFormat: 'clash',
            combinedNodeList: NODE_LIST,
            subName: 'Demo',
            config: {},
            builtinOptions: { ruleLevel: 'base' },
            managedConfigUrl: 'https://example.com/sub',
            storageAdapter,
        });

        expect(result.contentType).toBe('application/x-yaml; charset=utf-8');
        expect(result.content).toContain('proxies:');
        expect(fetch).not.toHaveBeenCalled();
        expect(generateBuiltinClashConfig).toHaveBeenCalledTimes(1);
    });

    it.each(['base64', 'unsupported'])(
        'skips configured templates for %s',
        async (targetFormat) => {
            const result = await ProcessorService.renderOutput({
                targetFormat,
                combinedNodeList: NODE_LIST,
                config: {},
                templateSource: { kind: 'remote', value: 'https://example.com/template.ini' },
                storageAdapter,
            });

            expect(atob(result.content)).toBe(NODE_LIST);
            expect(fetch).not.toHaveBeenCalled();
        }
    );

    it('does not disguise empty output from a supported generator as Base64', async () => {
        generateBuiltinClashConfig.mockReturnValueOnce('');
        await expect(
            ProcessorService.renderOutput({ targetFormat: 'clash', combinedNodeList: NODE_LIST })
        ).rejects.toThrow('No clash configuration was generated');
    });

    it('applies the selected INI to versioned Surge requests', async () => {
        const result = await ProcessorService.renderOutput({
            targetFormat: 'surge&ver=5',
            combinedNodeList: NODE_LIST,
            config: {},
            templateSource: { kind: 'remote', value: 'https://example.com/template.ini' },
            storageAdapter,
        });

        expect(result.content).toContain('FINAL,MyGroup');
    });

    it('renders remote Clash YAML profile templates by injecting MiSub nodes locally', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(
                async () =>
                    new Response(
                        `
mode: rule
mixed-port: 7890
proxy-groups:
  - name: 🚀 节点选择
    type: select
    proxies:
      - 🇭🇰 香港
      - DIRECT
  - name: 🇭🇰 香港
    type: url-test
    include-all: true
    filter: (?i)港|hk|hong ?kong|🇭🇰
rule-providers:
  AI:
    type: http
    behavior: domain
    format: mrs
    url: https://example.com/ai.mrs
rules:
  - RULE-SET,AI,🚀 节点选择
  - MATCH,🚀 节点选择
`,
                        { status: 200 }
                    )
            )
        );

        const result = await ProcessorService.renderOutput({
            targetFormat: 'clash',
            combinedNodeList: NODE_LIST,
            subName: 'ShellCrash',
            config: { UpdateInterval: 86400 },
            builtinOptions: { ruleLevel: 'std', enableUdp: true, skipCertVerify: false },
            templateSource: {
                kind: 'remote',
                value: 'https://raw.githubusercontent.com/Luckylos/shellcrashyaml/refs/heads/main/subconverter-shellcrash-needs.yaml',
            },
            managedConfigUrl: 'https://example.com/sub?clash',
            storageAdapter,
        });

        expect(result.contentType).toBe('application/x-yaml; charset=utf-8');
        expect(result.headers['X-MiSub-Template-Mode']).toBe('clash-yaml-profile');
        expect(result.content).toContain('proxy-groups:');
        expect(result.content).toContain('name: 🚀 节点选择');
        expect(result.content).toContain('name: 🇭🇰 香港');
        expect(result.content).toContain('rule-providers:');
        expect(result.content).toContain('RULE-SET,AI,🚀 节点选择');
        expect(result.content).toContain('proxies:');
        expect(result.content).toContain('name: 🇭🇰 HK-01');
        expect(result.content).not.toContain('metadata:');
    });

    it('materializes YAML chain declarations as node-level dialer-proxy for Meta output', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response(YAML_CHAIN_TEMPLATE, { status: 200 }))
        );

        const result = await ProcessorService.renderOutput({
            targetFormat: 'clash',
            combinedNodeList: TWO_NODE_LIST,
            subName: 'YAML Chain',
            config: { UpdateInterval: 86400 },
            builtinOptions: {
                ruleLevel: 'std',
                enableUdp: true,
                skipCertVerify: false,
                isMeta: true,
            },
            templateSource: { kind: 'remote', value: 'https://example.com/yaml-chain.yaml' },
            managedConfigUrl: 'https://example.com/sub?target=clash&meta=true',
            storageAdapter,
        });

        const output = yaml.load(result.content);
        const originalProxies = output.proxies.filter((proxy) => !proxy['dialer-proxy']);
        const chainedProxies = output.proxies.filter(
            (proxy) => proxy['dialer-proxy'] === '🔗 链式前置'
        );
        const entryGroup = output['proxy-groups'].find((group) => group.name === '🔗 链式前置');
        const landingGroup = output['proxy-groups'].find((group) => group.name === '🔗 链式落地');

        expect(chainedProxies).toHaveLength(originalProxies.length);
        expect(entryGroup.proxies).toEqual(originalProxies.map((proxy) => proxy.name));
        expect(entryGroup['include-all-proxies']).toBeUndefined();
        expect(landingGroup.proxies).toEqual(chainedProxies.map((proxy) => proxy.name));
        expect(output['proxy-providers']?.chainpool).toBeUndefined();
        expect(result.content).not.toContain('x-misub-chain-proxy');
        expect(result.content).not.toMatch(/underlying-proxy|type:\s*relay/);
    });

    it('keeps YAML chain groups usable without claiming dialer-proxy for ordinary output', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response(YAML_CHAIN_TEMPLATE, { status: 200 }))
        );

        const result = await ProcessorService.renderOutput({
            targetFormat: 'clash',
            combinedNodeList: TWO_NODE_LIST,
            subName: 'YAML Chain',
            config: { UpdateInterval: 86400 },
            builtinOptions: {
                ruleLevel: 'std',
                enableUdp: true,
                skipCertVerify: false,
                isMeta: false,
            },
            templateSource: { kind: 'remote', value: 'https://example.com/yaml-chain.yaml' },
            managedConfigUrl: 'https://example.com/sub?target=clash',
            storageAdapter,
        });

        const output = yaml.load(result.content);
        const originalNames = output.proxies.map((proxy) => proxy.name);
        const landingGroup = output['proxy-groups'].find((group) => group.name === '🔗 链式落地');

        expect(output.proxies).toHaveLength(2);
        expect(output.proxies.every((proxy) => !proxy['dialer-proxy'])).toBe(true);
        expect(landingGroup.proxies).toEqual(originalNames);
        expect(result.content).not.toContain('x-misub-chain-proxy');
    });

    it('detects Clash YAML profile templates by structure instead of treating them as ini templates', () => {
        expect(
            isClashYamlProfileTemplate(`
proxy-groups:
  - name: 🚀 节点选择
    type: select
rules:
  - MATCH,🚀 节点选择
`)
        ).toBe(true);
        expect(isClashYamlProfileTemplate('[Proxy Group]\nProxy = select, A')).toBe(false);
    });

    it('passes userAgent into builtin generator so Hiddify profile rendering omits rule providers', async () => {
        const result = await ProcessorService.renderOutput({
            targetFormat: 'clash',
            combinedNodeList: NODE_LIST,
            subName: 'Hiddify Test',
            config: { UpdateInterval: 86400 },
            builtinOptions: {
                ruleLevel: 'std',
                userAgent: 'HiddifyNext/4.1.1 (android) like ClashMeta v2ray sing-box',
                searchParams: new URLSearchParams(''),
            },
            templateSource: { kind: 'none', value: '' },
            managedConfigUrl: '',
            storageAdapter,
        });

        expect(result.contentType).toBe('application/x-yaml; charset=utf-8');
        expect(result.content).toContain('proxies:');
        expect(result.content).not.toContain('rule-providers:');
        expect(result.content).not.toContain('RULE-SET,');
        expect(result.content).toContain('MATCH,🚀 节点选择');
    });

    it('ignores ini templates for Hiddify Clash rendering to keep conservative compatibility output', async () => {
        const result = await ProcessorService.renderOutput({
            targetFormat: 'clash',
            combinedNodeList: NODE_LIST,
            subName: 'Hiddify Test',
            config: { UpdateInterval: 86400 },
            builtinOptions: {
                ruleLevel: 'std',
                userAgent: 'HiddifyNext/4.1.1 (android) like ClashMeta v2ray sing-box',
                hiddifyCompatible: true,
                searchParams: new URLSearchParams(''),
            },
            templateSource: { kind: 'remote', value: 'https://example.com/template.ini' },
            managedConfigUrl: '',
            storageAdapter,
        });

        expect(fetch).not.toHaveBeenCalled();
        expect(result.content).toContain('proxies:');
        expect(result.content).not.toContain('name: MyGroup');
        expect(result.content).not.toContain('rule-providers:');
        expect(result.content).not.toContain('RULE-SET,');
        expect(result.content).toContain('MATCH,🚀 节点选择');
    });

    it('preserves managed config header for builtin quanx output', async () => {
        const result = await ProcessorService.renderOutput({
            targetFormat: 'quanx',
            combinedNodeList: NODE_LIST,
            subName: 'Demo',
            config: { UpdateInterval: 86400 },
            builtinOptions: { ruleLevel: 'std', skipCertVerify: false, enableUdp: false },
            managedConfigUrl: 'https://example.com/sub?target=quanx&builtin=1',
            storageAdapter,
        });

        expect(result.content).toContain(
            '#!MANAGED-CONFIG https://example.com/sub?target=quanx&builtin=1 interval=86400 strict=false'
        );
        expect(result.content).toContain('[general]');
        expect(result.content).toContain('[dns]');
    });
});
