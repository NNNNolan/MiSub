import { describe, expect, it } from 'vitest';
import { groupNodeLinesByRegion } from '../../functions/modules/subscription/region-groups.js';

describe('region group overrides', () => {
    it('uses only the name before the first | and keeps full group member names', () => {
        const hk = 'HK Plus 香港HKT家宽|US|美国';
        const tw = 'TW Plus 台湾Hinet家宽|美国';
        const sg = 'SG Plus 新加坡家宽|美国';
        const us = 'US01|香港|JP';
        const unknown = 'Plus 节点|美国';
        const groups = groupNodeLinesByRegion(
            [hk, tw, sg, us, unknown].map((name) => ({ tag: name }))
        );

        expect(groups.map(({ name, tags }) => ({ name, tags }))).toEqual([
            { name: '🇭🇰 香港节点', tags: [hk] },
            { name: '🇹🇼 台湾节点', tags: [tw] },
            { name: '🇸🇬 狮城节点', tags: [sg] },
            { name: '🇺🇸 美国节点', tags: [us] },
            { name: '🌍 其他节点', tags: [unknown] },
        ]);
    });

    it('matches region overrides against the name before |', () => {
        const sg = '新加坡 原生|HK';
        const us = 'US01|新加坡 原生';
        const groups = groupNodeLinesByRegion([{ tag: sg }, { tag: us }], {
            regionOverrides: [{ pattern: '新加坡 原生', region: '德国' }],
        });

        expect(groups.map(({ name, tags }) => ({ name, tags }))).toEqual([
            { name: '🇩🇪 德国节点', tags: [sg] },
            { name: '🇺🇸 美国节点', tags: [us] },
        ]);
    });

    it('should allow user-defined regex rules to override the built-in region guess', () => {
        const groups = groupNodeLinesByRegion(
            [
                { name: '机场A 新加坡 原生', tag: '机场A 新加坡 原生' },
                { name: '机场A US-West', tag: '机场A US-West' },
            ],
            {
                regionOverrides: [{ pattern: '新加坡 原生', region: '美国' }],
            }
        );

        const usGroup = groups.find((group) => group.name === '🇺🇸 美国节点');
        const sgGroup = groups.find((group) => group.name === '🇸🇬 狮城节点');

        expect(usGroup?.tags).toContain('机场A 新加坡 原生');
        expect(usGroup?.tags).toContain('机场A US-West');
        expect(sgGroup).toBeUndefined();
    });
});
