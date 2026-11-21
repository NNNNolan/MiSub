import { generateBuiltinClashConfig } from './builtin-clash-generator.js';
import { generateBuiltinSurgeConfig } from './builtin-surge-generator.js';
import { generateBuiltinLoonConfig } from './builtin-loon-generator.js';
import { generateBuiltinQuanxConfig } from './builtin-quanx-generator.js';
import { generateBuiltinSingboxConfig } from './builtin-singbox-generator.js';
import { generateBuiltinEgernConfig } from './builtin-egern-generator.js';
import { normalizeTemplateTarget } from './template-compatibility.js';

export function getBuiltinSubscriptionGenerator(normalizedTarget) {
    switch (normalizedTarget) {
        case 'clash':
            return generateBuiltinClashConfig;
        case 'surge':
            return generateBuiltinSurgeConfig;
        case 'loon':
            return generateBuiltinLoonConfig;
        case 'quanx':
            return generateBuiltinQuanxConfig;
        case 'singbox':
            return generateBuiltinSingboxConfig;
        case 'egern':
            return generateBuiltinEgernConfig;
        default:
            return null;
    }
}

export function transformBuiltinSubscription(nodeList, targetFormat, options = {}) {
    const generate = getBuiltinSubscriptionGenerator(normalizeTemplateTarget(targetFormat));
    return generate ? generate(nodeList, options) : null;
}
