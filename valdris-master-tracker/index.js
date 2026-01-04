/**
 * Valdris Master Tracker
 * Comprehensive character tracker for LitRPG roleplay
 * Main entry point with UI, modals, and tab navigation
 */

const EXT_NAME = 'valdris-master-tracker';

// Import state manager
import {
    initStateManager,
    getState,
    setState,
    updateField,
    subscribe,
    createEmptyState,
    recalculateDerivedStats
} from './state-manager.js';

// Import tab renderers
import { renderOverviewTab } from './tabs/overview.js';
import { renderStatsTab } from './tabs/stats.js';
import { renderClassLevelTab } from './tabs/class-level.js';

// SillyTavern module references
let extension_settings, getContext, saveSettingsDebounced;
let eventSource, event_types;

// Import SillyTavern modules
try {
    const extModule = await import('../../../extensions.js');
    extension_settings = extModule.extension_settings;
    getContext = extModule.getContext;
    saveSettingsDebounced = extModule.saveSettingsDebounced;
} catch (e) {
    console.error('[VMasterTracker] Failed to import extensions.js', e);
}

try {
    const scriptModule = await import('../../../../script.js');
    eventSource = scriptModule.eventSource;
    event_types = scriptModule.event_types;
    if (!saveSettingsDebounced) saveSettingsDebounced = scriptModule.saveSettingsDebounced;
} catch (e) {
    console.error('[VMasterTracker] Failed to import script.js', e);
}

// Initialize state manager with SillyTavern references
initStateManager(getContext, saveSettingsDebounced);

// UI State
const UI = {
    mounted: false,
    root: null,
    launcher: null,
    activeTab: 'overview',
    panelVisible: true,
    modalStack: []
};

// Tab definitions
const TABS = [
    { key: 'overview', label: 'Overview', icon: '' },
    { key: 'stats', label: 'Stats', icon: '' },
    { key: 'class', label: 'Class', icon: '' }
];

// Cleanup tracking
const _cleanup = {
    intervals: [],
    listeners: [],
    unsubscribers: []
};

/**
 * Helper function to create DOM elements
 */
function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (k === 'class') el.className = v;
        else if (k.startsWith('on') && typeof v === 'function') {
            el.addEventListener(k.substring(2), v);
        } else if (v === false || v === null || v === undefined) continue;
        else el.setAttribute(k, String(v));
    }
    for (const c of children.flat()) {
        if (c === null || c === undefined) continue;
        if (typeof c === 'string' || typeof c === 'number') {
            el.appendChild(document.createTextNode(String(c)));
        } else {
            el.appendChild(c);
        }
    }
    return el;
}

/**
 * Mount the main UI
 */
function mountUI() {
    if (UI.mounted) return;
    UI.mounted = true;

    // Create launcher button
    const launcher = document.createElement('button');
    launcher.id = 'vmt_launcher';
    launcher.className = 'vmt_launcher';
    launcher.innerHTML = '';
    launcher.title = 'Toggle Valdris Master Tracker';
    launcher.addEventListener('click', togglePanel);
    document.body.appendChild(launcher);
    UI.launcher = launcher;

    // Create main panel
    const wrapper = document.createElement('div');
    wrapper.id = 'vmt_root';
    wrapper.className = 'vmt_dock';

    wrapper.innerHTML = `
        <div class="vmt_panel">
            <div class="vmt_header">
                <div class="vmt_title">
                    <span class="vmt_badge">VMT</span>
                    <span class="vmt_title_text">Master Tracker</span>
                </div>
                <div class="vmt_header_actions">
                    <button class="vmt_btn vmt_btn_reset" id="vmt_btn_reset" title="Reset to defaults">⟳</button>
                    <button class="vmt_btn vmt_btn_collapse" id="vmt_btn_collapse" title="Collapse panel">▾</button>
                </div>
            </div>

            <div class="vmt_tabs" id="vmt_tabs"></div>
            <div class="vmt_body" id="vmt_body"></div>

            <div class="vmt_footer">
                <div class="vmt_status" id="vmt_status">Ready</div>
            </div>
        </div>

        <div class="vmt_modal" id="vmt_modal" aria-hidden="true">
            <div class="vmt_modal_backdrop"></div>
            <div class="vmt_modal_card">
                <div class="vmt_modal_header">
                    <div class="vmt_modal_title" id="vmt_modal_title">Modal</div>
                    <button class="vmt_btn" id="vmt_modal_close">✕</button>
                </div>
                <div class="vmt_modal_body" id="vmt_modal_body"></div>
                <div class="vmt_modal_footer" id="vmt_modal_footer"></div>
            </div>
        </div>
    `;

    document.body.appendChild(wrapper);
    UI.root = wrapper;

    // Set up tab buttons
    const tabsEl = wrapper.querySelector('#vmt_tabs');
    for (const t of TABS) {
        const btn = document.createElement('button');
        btn.className = 'vmt_tab';
        btn.dataset.tab = t.key;
        btn.innerHTML = `<span class="vmt_tab_icon">${t.icon}</span><span class="vmt_tab_label">${t.label}</span>`;
        btn.addEventListener('click', () => {
            UI.activeTab = t.key;
            render();
        });
        tabsEl.appendChild(btn);
    }

    // Set up header buttons
    wrapper.querySelector('#vmt_btn_collapse').addEventListener('click', togglePanel);
    wrapper.querySelector('#vmt_btn_reset').addEventListener('click', () => {
        openModal('confirm-reset', {
            onConfirm: async () => {
                await setState(createEmptyState());
                await recalculateDerivedStats();
                render();
                closeModal();
                setStatus('Reset to defaults');
            }
        });
    });

    // Modal close handlers
    wrapper.querySelector('#vmt_modal_close').addEventListener('click', closeModal);
    wrapper.querySelector('.vmt_modal_backdrop').addEventListener('click', closeModal);

    console.log('[VMasterTracker] UI mounted');
}

/**
 * Toggle panel visibility
 */
function togglePanel() {
    UI.panelVisible = !UI.panelVisible;
    if (UI.root) {
        UI.root.classList.toggle('vmt_hidden', !UI.panelVisible);
    }
    if (UI.launcher) {
        UI.launcher.classList.toggle('vmt_active', UI.panelVisible);
    }
}

/**
 * Set status message
 */
function setStatus(msg) {
    const statusEl = UI.root?.querySelector('#vmt_status');
    if (statusEl) {
        statusEl.textContent = msg;
        setTimeout(() => {
            if (statusEl.textContent === msg) {
                statusEl.textContent = 'Ready';
            }
        }, 3000);
    }
}

/**
 * Open a modal dialog
 */
function openModal(type, data = {}) {
    const modal = UI.root?.querySelector('#vmt_modal');
    const titleEl = UI.root?.querySelector('#vmt_modal_title');
    const bodyEl = UI.root?.querySelector('#vmt_modal_body');
    const footerEl = UI.root?.querySelector('#vmt_modal_footer');

    if (!modal || !titleEl || !bodyEl || !footerEl) return;

    // Clear previous content
    bodyEl.innerHTML = '';
    footerEl.innerHTML = '';

    // Build modal content based on type
    switch (type) {
        case 'edit-value':
            titleEl.textContent = `Edit ${data.field}`;
            bodyEl.appendChild(
                h('div', { class: 'vmt_modal_field' },
                    h('label', { class: 'vmt_modal_label' }, 'Value'),
                    h('input', {
                        type: 'number',
                        class: 'vmt_modal_input',
                        id: 'vmt_modal_value',
                        value: data.currentValue
                    })
                )
            );
            footerEl.appendChild(
                h('button', {
                    class: 'vmt_btn vmt_btn_primary',
                    onclick: () => {
                        const val = document.getElementById('vmt_modal_value').value;
                        data.onSave(val);
                        closeModal();
                    }
                }, 'Save')
            );
            footerEl.appendChild(
                h('button', { class: 'vmt_btn', onclick: closeModal }, 'Cancel')
            );
            break;

        case 'edit-title':
            titleEl.textContent = 'Edit Active Title';
            bodyEl.appendChild(
                h('div', { class: 'vmt_modal_field' },
                    h('label', { class: 'vmt_modal_label' }, 'Title Name'),
                    h('input', {
                        type: 'text',
                        class: 'vmt_modal_input',
                        id: 'vmt_modal_title_name',
                        value: data.title?.name || '',
                        placeholder: 'e.g., Dragon Slayer'
                    })
                )
            );
            bodyEl.appendChild(
                h('div', { class: 'vmt_modal_field' },
                    h('label', { class: 'vmt_modal_label' }, 'Effects'),
                    h('textarea', {
                        class: 'vmt_modal_textarea',
                        id: 'vmt_modal_title_effects',
                        placeholder: 'e.g., +10% damage to dragons'
                    }, data.title?.effects || '')
                )
            );
            footerEl.appendChild(
                h('button', {
                    class: 'vmt_btn vmt_btn_primary',
                    onclick: () => {
                        data.onSave({
                            name: document.getElementById('vmt_modal_title_name').value,
                            effects: document.getElementById('vmt_modal_title_effects').value
                        });
                        closeModal();
                    }
                }, 'Save')
            );
            footerEl.appendChild(
                h('button', { class: 'vmt_btn', onclick: closeModal }, 'Cancel')
            );
            break;

        case 'manage-status':
            titleEl.textContent = data.type === 'buffs' ? 'Manage Buffs' : 'Manage Debuffs';
            const listContainer = h('div', { class: 'vmt_status_list' });
            const items = [...data.items];

            const renderStatusList = () => {
                listContainer.innerHTML = '';
                if (items.length === 0) {
                    listContainer.appendChild(h('div', { class: 'vmt_empty' }, `No ${data.type} active`));
                } else {
                    items.forEach((item, i) => {
                        listContainer.appendChild(
                            h('div', { class: 'vmt_status_item_row' },
                                h('span', { class: 'vmt_status_name' }, item.name),
                                h('span', { class: 'vmt_status_effect' }, item.effect || ''),
                                h('button', {
                                    class: 'vmt_btn_icon vmt_btn_danger',
                                    onclick: () => {
                                        items.splice(i, 1);
                                        renderStatusList();
                                    }
                                }, '')
                            )
                        );
                    });
                }
            };

            renderStatusList();
            bodyEl.appendChild(listContainer);
            bodyEl.appendChild(
                h('div', { class: 'vmt_add_status_row' },
                    h('input', {
                        type: 'text',
                        class: 'vmt_modal_input',
                        id: 'vmt_new_status_name',
                        placeholder: 'Name'
                    }),
                    h('input', {
                        type: 'text',
                        class: 'vmt_modal_input',
                        id: 'vmt_new_status_effect',
                        placeholder: 'Effect (optional)'
                    }),
                    h('button', {
                        class: 'vmt_btn vmt_btn_add',
                        onclick: () => {
                            const name = document.getElementById('vmt_new_status_name').value.trim();
                            if (name) {
                                items.push({
                                    name,
                                    effect: document.getElementById('vmt_new_status_effect').value.trim()
                                });
                                document.getElementById('vmt_new_status_name').value = '';
                                document.getElementById('vmt_new_status_effect').value = '';
                                renderStatusList();
                            }
                        }
                    }, '+')
                )
            );
            footerEl.appendChild(
                h('button', {
                    class: 'vmt_btn vmt_btn_primary',
                    onclick: () => {
                        data.onSave(items);
                        closeModal();
                    }
                }, 'Save')
            );
            footerEl.appendChild(
                h('button', { class: 'vmt_btn', onclick: closeModal }, 'Cancel')
            );
            break;

        case 'add-feature':
        case 'edit-feature':
            titleEl.textContent = type === 'add-feature' ? 'Add Class Feature' : 'Edit Class Feature';
            const feature = data.feature || { name: '', description: '', level: 1 };
            bodyEl.appendChild(
                h('div', { class: 'vmt_modal_field' },
                    h('label', { class: 'vmt_modal_label' }, 'Feature Name'),
                    h('input', {
                        type: 'text',
                        class: 'vmt_modal_input',
                        id: 'vmt_feature_name',
                        value: feature.name,
                        placeholder: 'e.g., Second Wind'
                    })
                )
            );
            bodyEl.appendChild(
                h('div', { class: 'vmt_modal_field' },
                    h('label', { class: 'vmt_modal_label' }, 'Level Acquired'),
                    h('input', {
                        type: 'number',
                        class: 'vmt_modal_input',
                        id: 'vmt_feature_level',
                        value: feature.level,
                        min: 1,
                        max: 999
                    })
                )
            );
            bodyEl.appendChild(
                h('div', { class: 'vmt_modal_field' },
                    h('label', { class: 'vmt_modal_label' }, 'Description'),
                    h('textarea', {
                        class: 'vmt_modal_textarea',
                        id: 'vmt_feature_desc',
                        placeholder: 'Describe the feature...'
                    }, feature.description || '')
                )
            );
            footerEl.appendChild(
                h('button', {
                    class: 'vmt_btn vmt_btn_primary',
                    onclick: () => {
                        const newFeature = {
                            name: document.getElementById('vmt_feature_name').value.trim(),
                            level: parseInt(document.getElementById('vmt_feature_level').value, 10) || 1,
                            description: document.getElementById('vmt_feature_desc').value.trim()
                        };
                        if (newFeature.name) {
                            data.onSave(newFeature);
                            closeModal();
                        }
                    }
                }, 'Save')
            );
            footerEl.appendChild(
                h('button', { class: 'vmt_btn', onclick: closeModal }, 'Cancel')
            );
            break;

        case 'add-class':
            titleEl.textContent = 'Add Multiclass';
            bodyEl.appendChild(
                h('div', { class: 'vmt_modal_field' },
                    h('label', { class: 'vmt_modal_label' }, 'Class Name'),
                    h('input', {
                        type: 'text',
                        class: 'vmt_modal_input',
                        id: 'vmt_class_name',
                        placeholder: 'e.g., Rogue'
                    })
                )
            );
            bodyEl.appendChild(
                h('div', { class: 'vmt_modal_field' },
                    h('label', { class: 'vmt_modal_label' }, 'Subclass (Optional)'),
                    h('input', {
                        type: 'text',
                        class: 'vmt_modal_input',
                        id: 'vmt_class_subclass',
                        placeholder: 'e.g., Assassin'
                    })
                )
            );
            bodyEl.appendChild(
                h('div', { class: 'vmt_modal_field' },
                    h('label', { class: 'vmt_modal_label' }, 'Starting Level'),
                    h('input', {
                        type: 'number',
                        class: 'vmt_modal_input',
                        id: 'vmt_class_level',
                        value: 1,
                        min: 1,
                        max: 999
                    })
                )
            );
            footerEl.appendChild(
                h('button', {
                    class: 'vmt_btn vmt_btn_primary',
                    onclick: () => {
                        const name = document.getElementById('vmt_class_name').value.trim();
                        if (name) {
                            data.onSave({
                                name,
                                subclass: document.getElementById('vmt_class_subclass').value.trim(),
                                level: parseInt(document.getElementById('vmt_class_level').value, 10) || 1,
                                xp: { current: 0, needed: 100 },
                                features: []
                            });
                            closeModal();
                        }
                    }
                }, 'Add Class')
            );
            footerEl.appendChild(
                h('button', { class: 'vmt_btn', onclick: closeModal }, 'Cancel')
            );
            break;

        case 'confirm-reset':
            titleEl.textContent = 'Reset All Data?';
            bodyEl.appendChild(
                h('p', { class: 'vmt_modal_text' },
                    'This will reset all character data to default values. This action cannot be undone.'
                )
            );
            footerEl.appendChild(
                h('button', {
                    class: 'vmt_btn vmt_btn_danger',
                    onclick: data.onConfirm
                }, 'Reset')
            );
            footerEl.appendChild(
                h('button', { class: 'vmt_btn', onclick: closeModal }, 'Cancel')
            );
            break;

        case 'reset-attributes':
            titleEl.textContent = 'Reset Attributes?';
            bodyEl.appendChild(
                h('p', { class: 'vmt_modal_text' },
                    'This will reset all attributes to base 10 with no modifiers.'
                )
            );
            footerEl.appendChild(
                h('button', {
                    class: 'vmt_btn vmt_btn_danger',
                    onclick: () => {
                        data.onConfirm();
                        closeModal();
                    }
                }, 'Reset')
            );
            footerEl.appendChild(
                h('button', { class: 'vmt_btn', onclick: closeModal }, 'Cancel')
            );
            break;

        default:
            titleEl.textContent = 'Modal';
            bodyEl.textContent = 'Unknown modal type';
    }

    modal.setAttribute('aria-hidden', 'false');
    UI.modalStack.push(type);
}

/**
 * Close the current modal
 */
function closeModal() {
    const modal = UI.root?.querySelector('#vmt_modal');
    if (modal) {
        modal.setAttribute('aria-hidden', 'true');
    }
    UI.modalStack.pop();
}

/**
 * Render the current tab content
 */
function render() {
    if (!UI.root) return;

    // Update tab button active states
    for (const btn of UI.root.querySelectorAll('.vmt_tab')) {
        btn.classList.toggle('active', btn.dataset.tab === UI.activeTab);
    }

    // Render tab content
    const body = UI.root.querySelector('#vmt_body');
    if (!body) return;

    body.innerHTML = '';

    switch (UI.activeTab) {
        case 'overview':
            body.appendChild(renderOverviewTab(openModal, render));
            break;
        case 'stats':
            body.appendChild(renderStatsTab(openModal, render));
            break;
        case 'class':
            body.appendChild(renderClassLevelTab(openModal, render));
            break;
        default:
            body.textContent = 'Unknown tab';
    }
}

/**
 * Register SillyTavern event handlers
 */
function registerEvents() {
    if (!eventSource || !event_types) {
        console.warn('[VMasterTracker] Event source not available');
        return;
    }

    // Chat changed - re-render with new chat's data
    eventSource.on(event_types.CHAT_CHANGED, () => {
        console.log('[VMasterTracker] Chat changed, re-rendering');
        render();
    });

    console.log('[VMasterTracker] Events registered');
}

/**
 * Cleanup function
 */
function cleanup() {
    _cleanup.intervals.forEach(id => clearInterval(id));
    _cleanup.intervals = [];

    _cleanup.listeners.forEach(({ element, event, handler }) => {
        element.removeEventListener(event, handler);
    });
    _cleanup.listeners = [];

    _cleanup.unsubscribers.forEach(unsub => {
        if (typeof unsub === 'function') unsub();
    });
    _cleanup.unsubscribers = [];

    if (UI.root) {
        UI.root.remove();
        UI.root = null;
    }

    if (UI.launcher) {
        UI.launcher.remove();
        UI.launcher = null;
    }

    UI.mounted = false;
    console.log('[VMasterTracker] Cleanup complete');
}

/**
 * Global API for external access
 */
window.VMasterTracker = {
    // State access
    getState,
    setState,
    updateField,
    subscribe,

    // UI control
    open: () => {
        UI.panelVisible = true;
        if (UI.root) UI.root.classList.remove('vmt_hidden');
        if (UI.launcher) UI.launcher.classList.add('vmt_active');
    },
    close: () => {
        UI.panelVisible = false;
        if (UI.root) UI.root.classList.add('vmt_hidden');
        if (UI.launcher) UI.launcher.classList.remove('vmt_active');
    },
    toggle: togglePanel,

    // Utilities
    render,
    recalculateDerivedStats,

    // Events
    EVENTS: {
        STATE_CHANGED: 'state_changed'
    }
};

/**
 * Main initialization
 */
(async function main() {
    console.log('[VMasterTracker] Loading...');

    try {
        mountUI();
        registerEvents();

        // Initial render
        render();

        // Subscribe to state changes for re-render
        const unsub = subscribe(() => render());
        _cleanup.unsubscribers.push(unsub);

        console.log('[VMasterTracker] Ready!');
    } catch (e) {
        console.error('[VMasterTracker] Init failed:', e);
    }
})();
