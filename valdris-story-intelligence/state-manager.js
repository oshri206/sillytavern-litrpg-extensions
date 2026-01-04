import { DEFAULT_STATE, deepClone } from './utils.js';

export class StateManager {
    constructor() {
        this.state = deepClone(DEFAULT_STATE);
        this.characterId = null;
        this.storageKey = null;
    }

    async initialize(characterId = null) {
        const context = this.getContext();
        this.characterId = characterId ?? context?.characterId ?? null;
        this.storageKey = this.buildStorageKey(this.characterId);
        this.state = this.loadState();
        this.touch();
        this.saveState();
        return this.state;
    }

    buildStorageKey(characterId) {
        if (characterId) {
            return `vsi_state_${characterId}`;
        }
        return 'vsi_state_global';
    }

    getContext() {
        if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
            return SillyTavern.getContext();
        }
        return null;
    }

    loadState() {
        if (!this.storageKey) {
            return deepClone(DEFAULT_STATE);
        }
        const raw = localStorage.getItem(this.storageKey);
        if (!raw) {
            return deepClone(DEFAULT_STATE);
        }
        try {
            const parsed = JSON.parse(raw);
            return this.mergeDefaults(parsed);
        } catch (error) {
            console.warn('[VSI] Failed to parse state, resetting.', error);
            return deepClone(DEFAULT_STATE);
        }
    }

    mergeDefaults(state) {
        const merged = deepClone(DEFAULT_STATE);
        return this.deepMerge(merged, state);
    }

    deepMerge(target, source) {
        if (!source || typeof source !== 'object') {
            return target;
        }
        Object.keys(source).forEach((key) => {
            if (
                source[key] &&
                typeof source[key] === 'object' &&
                !Array.isArray(source[key])
            ) {
                target[key] = this.deepMerge(target[key] ?? {}, source[key]);
            } else {
                target[key] = source[key];
            }
        });
        return target;
    }

    saveState() {
        if (!this.storageKey) return;
        this.state.lastUpdated = Date.now();
        localStorage.setItem(this.storageKey, JSON.stringify(this.state));
    }

    touch() {
        this.state.lastUpdated = Date.now();
    }

    getState() {
        return this.state;
    }

    setState(newState) {
        this.state = this.mergeDefaults(newState);
        this.saveState();
    }

    getSection(section) {
        return this.state[section];
    }

    setSection(section, value) {
        this.state[section] = value;
        this.saveState();
    }

    updateSection(section, updates) {
        this.state[section] = {
            ...this.state[section],
            ...updates
        };
        this.saveState();
    }

    pushToSection(section, item, limit = null) {
        if (!Array.isArray(this.state[section])) {
            this.state[section] = [];
        }
        this.state[section].push(item);
        if (limit && this.state[section].length > limit) {
            this.state[section] = this.state[section].slice(-limit);
        }
        this.saveState();
    }
}
