import { describe, expect, it } from 'vitest';
import {
    containsRegion,
    extractNodeRegion,
    getRegionEmoji,
} from '../../functions/modules/utils/geo-utils.js';
import { addFlagEmoji } from '../../functions/utils/node-utils.js';

function ss(name) {
    return `ss://YWVzLTI1Ni1nY206cGFzcw@example.com:443#${encodeURIComponent(name)}`;
}

function flagName(link) {
    return decodeURIComponent(link.split('#').pop());
}

describe('region flags', () => {
    it.each([
        ['HK Plus 香港HKT家宽|US|美国', '香港'],
        ['TW Plus 台湾Hinet家宽|US', '台湾'],
        ['SG Plus 新加坡家宽|美国', '新加坡'],
        ['US01|香港|日本', '美国'],
        ['us01|HK', '美国'],
        ['Plus US01|香港', '美国'],
        ['未知节点|美国', '其他'],
        ['Plus 节点|US', '其他'],
        ['|美国', '其他'],
        ['US01', '美国'],
        ['JPNode|美国', '其他'],
        ['美西01|香港', '美国'],
        ['美东02|SG', '美国'],
        ['港01|US', '香港'],
        ['台01|US', '台湾'],
        ['日01|HK', '日本'],
        ['新01|US', '新加坡'],
        ['韩01|US', '韩国'],
        ['英01|US', '英国'],
        ['德01|US', '德国'],
        ['法01|US', '法国'],
        ['澳01|HK', '澳大利亚'],
        ['新节点|US', '其他'],
        ['美好节点|US', '其他'],
    ])('只用首个 | 前的名称识别 %s 的地区', (name, region) => {
        expect(extractNodeRegion(name)).toBe(region);
    });

    it('地区包含判断共用前半段和短码边界', () => {
        expect(containsRegion('Plus|US', '美国')).toBe(false);
        expect(containsRegion('US01|HK', '香港')).toBe(false);
        expect(containsRegion('Plus US01|HK', '美国')).toBe(true);
    });

    it('国旗补全只根据 | 前的地区，保留完整节点名称', () => {
        expect(flagName(addFlagEmoji(ss('US01|香港来源')))).toBe('🇺🇸 US01|香港来源');
        expect(flagName(addFlagEmoji(ss('未知节点|美国来源')))).toBe('🌍 未知节点|美国来源');
    });

    it('识别澳门和朝鲜，台湾继续用中国国旗', () => {
        expect(extractNodeRegion('澳门 Debee-Po0')).toBe('澳门');
        expect(extractNodeRegion('澳门-Debee(Z)')).toBe('澳门');
        expect(extractNodeRegion('Macao CTM')).toBe('澳门');
        expect(getRegionEmoji('澳门')).toBe('🇲🇴');

        expect(extractNodeRegion('朝鲜 Debee-Po0')).toBe('朝鲜');
        expect(extractNodeRegion('朝鲜-Debee(Z)')).toBe('朝鲜');
        expect(extractNodeRegion('North Korea 1')).toBe('朝鲜');
        expect(getRegionEmoji('朝鲜')).toBe('🇰🇵');

        expect(extractNodeRegion('韩国 Legend')).toBe('韩国');
        expect(extractNodeRegion('台湾 BestVM-Po0')).toBe('台湾');
        expect(getRegionEmoji('台湾')).toBe('🇨🇳');
        expect(getRegionEmoji('中国')).toBe('🇨🇳');
        expect(extractNodeRegion('中国香港 HKT')).toBe('香港');
        expect(getRegionEmoji('保加利亚')).toBe('🇧🇬');
    });

    it('已有地球或国旗时不再重复补', () => {
        const macau = flagName(addFlagEmoji(ss('澳门 Debee-Po0')));
        expect(macau.startsWith('🇲🇴 ')).toBe(true);
        expect(macau.match(/🇲🇴/g)).toHaveLength(1);
        expect(flagName(addFlagEmoji(ss(macau))).match(/🇲🇴/g)).toHaveLength(1);

        const korea = flagName(addFlagEmoji(ss('朝鲜 Debee-Po0')));
        expect(korea.startsWith('🇰🇵 ')).toBe(true);

        const taiwan = flagName(addFlagEmoji(ss('台湾 BestVM')));
        expect(taiwan.startsWith('🇨🇳 ')).toBe(true);
        expect(taiwan.includes('🇹🇼')).toBe(false);

        const doubled = flagName(addFlagEmoji(ss('🌍 神秘节点')));
        expect(doubled.match(/🌍/g)).toHaveLength(1);
    });
});
