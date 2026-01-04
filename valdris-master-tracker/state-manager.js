/**
 * Valdris Master Tracker - State Manager
 * Central state management with SillyTavern chat metadata persistence
 */

const META_KEY = 'vmaster_tracker_v1';

// SillyTavern module references (set by init)
let _getContext = null;
let _saveSettingsDebounced = null;

// State change subscribers
const _subscribers = [];

// Mutex for race condition prevention
const stateMutex = {
    _locked: false,
    _queue: [],

    async acquire() {
        return new Promise((resolve) => {
            if (!this._locked) {
                this._locked = true;
                resolve();
            } else {
                this._queue.push(resolve);
            }
        });
    },

    release() {
        if (this._queue.length > 0) {
            const next = this._queue.shift();
            next();
        } else {
            this._locked = false;
        }
    },

    async withLock(fn) {
        await this.acquire();
        try {
            return await fn();
        } finally {
            this.release();
        }
    }
};

/**
 * Create a new empty state object
 */
export function createEmptyState() {
    return {
        // Character basics
        characterName: 'Adventurer',

        // Vitals
        hp: { current: 100, max: 100 },
        mp: { current: 50, max: 50 },
        stamina: { current: 100, max: 100 },

        // Level & XP
        level: 1,
        xp: { current: 0, needed: 100 },

        // Active title
        activeTitle: {
            name: '',
            effects: ''
        },

        // Core attributes (STR, DEX, CON, INT, WIS, CHA)
        attributes: {
            STR: { base: 10, modifier: 0 },
            DEX: { base: 10, modifier: 0 },
            CON: { base: 10, modifier: 0 },
            INT: { base: 10, modifier: 0 },
            WIS: { base: 10, modifier: 0 },
            CHA: { base: 10, modifier: 0 }
        },

        // Derived stats (calculated from attributes)
        derivedStats: {
            attackPower: 0,
            defense: 0,
            magicPower: 0,
            critChance: 5,
            evasion: 0,
            speed: 10
        },

        // Buffs and debuffs
        buffs: [],
        debuffs: [],

        // Class system
        mainClass: {
            name: 'Adventurer',
            subclass: '',
            level: 1,
            xp: { current: 0, needed: 100 },
            features: []
        },

        // Multiclass support
        secondaryClasses: [],

        // UI state
        panelCollapsed: false
    };
}

/**
 * Get SillyTavern context with fallback support
 */
function getSTContext() {
    try {
        if (typeof SillyTavern !== 'undefined' && SillyTavern?.getContext) {
            return SillyTavern.getContext();
        }
        if (_getContext && typeof _getContext === 'function') {
            return _getContext();
        }
        return null;
    } catch (e) {
        console.error('[VMasterTracker] Error getting ST context:', e);
        return null;
    }
}

/**
 * Get chat metadata object
 */
function getChatMetadata() {
    const ctx = getSTContext();
    return ctx?.chatMetadata ?? null;
}

/**
 * Save chat metadata to SillyTavern
 */
async function saveChatMetadata() {
    const ctx = getSTContext();
    if (!ctx) {
        console.warn('[VMasterTracker] Cannot save metadata: ST context unavailable');
        return false;
    }

    try {
        if (typeof ctx.saveMetadata === 'function') {
            await ctx.saveMetadata();
            return true;
        }
        if (typeof ctx.saveMetadataDebounced === 'function') {
            await ctx.saveMetadataDebounced();
            return true;
        }
        console.warn('[VMasterTracker] No save method available on ST context');
        return false;
    } catch (e) {
        console.error('[VMasterTracker] Error saving metadata:', e);
        return false;
    }
}

/**
 * Initialize the state manager with SillyTavern references
 */
export function initStateManager(getContext, saveSettingsDebounced) {
    _getContext = getContext;
    _saveSettingsDebounced = saveSettingsDebounced;
    console.log('[VMasterTracker] State manager initialized');
}

/**
 * Get the current state from chat metadata
 */
export function getState() {
    const md = getChatMetadata();
    if (!md) return createEmptyState();
    if (!md[META_KEY]) {
        md[META_KEY] = createEmptyState();
    }
    return md[META_KEY];
}

/**
 * Set the entire state (replaces current state)
 */
export async function setState(newState) {
    return await stateMutex.withLock(async () => {
        const md = getChatMetadata();
        if (md) {
            md[META_KEY] = { ...newState };
            await saveChatMetadata();
            notifySubscribers(newState);
            return true;
        }
        return false;
    });
}

/**
 * Update specific fields in the state (merges with current state)
 */
export async function updateState(updates) {
    return await stateMutex.withLock(async () => {
        const md = getChatMetadata();
        if (md) {
            if (!md[META_KEY]) {
                md[META_KEY] = createEmptyState();
            }
            md[META_KEY] = deepMerge(md[META_KEY], updates);
            await saveChatMetadata();
            notifySubscribers(md[META_KEY]);
            return true;
        }
        return false;
    });
}

/**
 * Update a specific field using a path (e.g., 'hp.current')
 */
export async function updateField(path, value) {
    return await stateMutex.withLock(async () => {
        const md = getChatMetadata();
        if (md) {
            if (!md[META_KEY]) {
                md[META_KEY] = createEmptyState();
            }
            setNestedValue(md[META_KEY], path, value);
            await saveChatMetadata();
            notifySubscribers(md[META_KEY]);
            return true;
        }
        return false;
    });
}

/**
 * Calculate derived stats from attributes
 */
export function calculateDerivedStats(attributes) {
    const getTotal = (attr) => attr.base + attr.modifier;

    const str = getTotal(attributes.STR);
    const dex = getTotal(attributes.DEX);
    const con = getTotal(attributes.CON);
    const int = getTotal(attributes.INT);
    const wis = getTotal(attributes.WIS);

    return {
        attackPower: Math.floor(str * 1.5 + dex * 0.5),
        defense: Math.floor(con * 1.2 + str * 0.3),
        magicPower: Math.floor(int * 1.5 + wis * 0.5),
        critChance: Math.min(50, 5 + Math.floor(dex * 0.3 + wis * 0.1)),
        evasion: Math.floor(dex * 0.8 + int * 0.2),
        speed: 10 + Math.floor(dex * 0.5)
    };
}

/**
 * Recalculate and update derived stats
 */
export async function recalculateDerivedStats() {
    const state = getState();
    const derived = calculateDerivedStats(state.attributes);
    await updateField('derivedStats', derived);
    return derived;
}

/**
 * Subscribe to state changes
 */
export function subscribe(callback) {
    _subscribers.push(callback);
    return () => {
        const idx = _subscribers.indexOf(callback);
        if (idx > -1) _subscribers.splice(idx, 1);
    };
}

/**
 * Notify all subscribers of state change
 */
function notifySubscribers(state) {
    for (const cb of _subscribers) {
        try {
            cb(state);
        } catch (e) {
            console.error('[VMasterTracker] Subscriber error:', e);
        }
    }
}

/**
 * Deep merge two objects
 */
function deepMerge(target, source) {
    const output = { ...target };
    for (const key of Object.keys(source)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            if (target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
                output[key] = deepMerge(target[key], source[key]);
            } else {
                output[key] = { ...source[key] };
            }
        } else {
            output[key] = source[key];
        }
    }
    return output;
}

/**
 * Set a nested value using dot notation path
 */
function setNestedValue(obj, path, value) {
    const keys = path.split('.');
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (!current[key] || typeof current[key] !== 'object') {
            current[key] = {};
        }
        current = current[key];
    }
    current[keys[keys.length - 1]] = value;
}

/**
 * Get a nested value using dot notation path
 */
export function getNestedValue(obj, path) {
    const keys = path.split('.');
    let current = obj;
    for (const key of keys) {
        if (current === null || current === undefined) return undefined;
        current = current[key];
    }
    return current;
}

// Export the META_KEY for reference
export { META_KEY };
