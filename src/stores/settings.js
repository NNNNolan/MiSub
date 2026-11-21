import { defineStore } from 'pinia';
import { ref } from 'vue';
import { DEFAULT_SETTINGS } from '@/constants/default-settings';
import { mergeStoredSettings } from '@/constants/acl4ssr-configs.js';

export const useSettingsStore = defineStore('settings', () => {
    const config = ref({ ...DEFAULT_SETTINGS });

    function setConfig(newConfig) {
        config.value = mergeStoredSettings(DEFAULT_SETTINGS, newConfig);
    }

    function updateConfig(updates) {
        config.value = { ...config.value, ...updates };
    }

    return {
        config,
        setConfig,
        updateConfig,
    };
});
