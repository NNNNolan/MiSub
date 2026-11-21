export const ACL4SSR_CONFIG_BASE =
    'https://raw.githubusercontent.com/cmliu/ACL4SSR/main/Clash/config/';
export const DEFAULT_ACL4SSR_CONFIG_URL = `${ACL4SSR_CONFIG_BASE}ACL4SSR_Online.ini`;

export function resolveStoredTransformMode(mode, value, emptyMode = 'builtin') {
    const source = typeof mode === 'string' ? mode.trim().toLowerCase() : '';
    return source || (typeof value === 'string' && value.trim() ? 'preset' : emptyMode);
}

export function mergeStoredSettings(defaults, stored) {
    return {
        ...defaults,
        ...stored,
        transformConfigMode: resolveStoredTransformMode(
            stored?.transformConfigMode,
            stored?.transformConfig,
            defaults.transformConfigMode
        ),
    };
}

export function isAutomaticTransformConfig(mode, value) {
    const source = resolveStoredTransformMode(mode, value);
    return source === 'builtin' || (source === 'preset' && !String(value ?? '').trim());
}
