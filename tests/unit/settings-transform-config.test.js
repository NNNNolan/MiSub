import { beforeEach, describe, it, expect } from 'vitest';
import { shallowMount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ProfileForm from '../../src/components/modals/ProfileModal/ProfileForm.vue';
import { DEFAULT_ACL4SSR_CONFIG_URL } from '../../src/constants/acl4ssr-configs.js';
import { DEFAULT_SETTINGS, DEFAULT_PROFILE_FORM } from '../../src/constants/default-settings.js';
import { validateProfile } from '../../src/utils/validation-utils.js';
import { messages } from '../../src/i18n/messages.js';
import { setLocale } from '../../src/i18n/index.js';
import { useDataStore } from '../../src/stores/useDataStore.js';
import { useProfiles } from '../../src/composables/useProfiles.js';

// 校验文案已 i18n。happy-dom 的 navigator.language 是 en-US，不钉住语言
// 会拿到英文文案（断言会以「翻译键没接上」的表象失败）。
beforeEach(() => setLocale('zh-CN'));

describe('Transform config settings', () => {
    it('does not store the client-specific automatic template URL as a global or profile override', () => {
        expect(DEFAULT_SETTINGS.transformConfigMode).toBe('builtin');
        expect(DEFAULT_SETTINGS.ruleLevel).toBe('std');
        expect('clashRuleLevel' in DEFAULT_SETTINGS).toBe(false);
        expect(DEFAULT_SETTINGS.transformConfig).toBe('');
        expect(DEFAULT_PROFILE_FORM.ruleLevel).toBe('');
        expect('clashRuleLevel' in DEFAULT_PROFILE_FORM).toBe(false);
        expect(DEFAULT_PROFILE_FORM.transformConfigMode).toBe('global');
    });

    it('shows the target-dependent default for an inherited blank preset without overwriting explicit choices', async () => {
        setActivePinia(createPinia());
        const dataStore = useDataStore();
        const saved = { ...structuredClone(DEFAULT_PROFILE_FORM), id: 'legacy', name: 'Legacy' };
        delete saved.transformConfigMode;
        dataStore.profiles = [saved];
        const { editingProfile, handleEditProfile, handleSaveProfile } = useProfiles(() => {});
        handleEditProfile(saved.id);
        const localProfile = editingProfile.value;
        const globalSettings = { transformConfigMode: 'preset', transformConfig: '' };
        const wrapper = shallowMount(ProfileForm, {
            props: { localProfile, globalSettings, showAdvanced: true, uiText: {} },
            global: { stubs: { Input: false } },
        });
        const level = wrapper
            .findAll('select')
            .find((select) => select.find('option[value="relay"]').exists());
        expect(wrapper.text()).toContain('Clash / Mihomo 使用 cmliu 的 ACL4SSR_Online.ini');
        expect(level.element.disabled).toBe(false);
        await wrapper.setProps({
            globalSettings: { ...globalSettings, transformConfig: DEFAULT_ACL4SSR_CONFIG_URL },
        });
        expect(level.element.disabled).toBe(true);
        expect(wrapper.text()).toContain('当前全局：ACL4SSR_Online.ini');
        expect(localProfile.transformConfigMode).toBe('global');
        expect(localProfile.transformConfig).toBe('');
        handleSaveProfile(localProfile);
        expect(dataStore.profiles[0]).toMatchObject({
            transformConfigMode: 'global',
            transformConfig: '',
        });
    });

    it('allows empty transformConfig but rejects invalid external URLs', () => {
        const emptyResult = validateProfile({
            name: 'Demo',
            customId: 'demo',
            transformConfig: '',
        });
        const invalidResult = validateProfile({
            name: 'Demo',
            customId: 'demo',
            transformConfig: 'not-a-url',
        });

        expect(emptyResult.isValid).toBe(true);
        expect(invalidResult.isValid).toBe(false);
        expect(invalidResult.errors.transformConfig).toContain(
            messages['zh-CN'].validation.invalidTransformUrl
        );
    });
});
