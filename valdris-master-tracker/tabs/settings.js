/**
 * Valdris Master Tracker - Settings Tab
 */

import { getState, updateField, setState, createEmptyState } from '../state-manager.js';
import { buildContextBlock } from '../context.js';

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

function parsePinnedList(value) {
    return String(value || '')
        .split(/\r?\n|,/)
        .map(entry => entry.trim())
        .filter(Boolean);
}

const CATEGORY_LABELS = {
    damage: 'Damage',
    healing: 'Healing',
    mana: 'Mana',
    xp: 'Experience',
    gold: 'Gold',
    items: 'Items',
    status: 'Status Effects'
};

export function renderSettingsTab(openModal) {
    const state = getState();
    const settings = state.settings || {};
    const contextSettings = settings.contextInjection || {};
    const autoSettings = settings.autoParsing || {};
    const npcSettings = settings.npcLives || {};

    const container = h('div', { class: 'vmt_tab_content' });

    const contextSection = h('div', { class: 'vmt_card' },
        h('div', { class: 'vmt_section_title' }, 'Context Injection'),
        h('label', { class: 'vmt_checkbox' },
            h('input', {
                type: 'checkbox',
                checked: contextSettings.enabled || false,
                onchange: (e) => updateField('settings.contextInjection.enabled', e.target.checked)
            }),
            h('span', {}, 'Enable Context Injection')
        ),
        h('div', { class: 'vmt_field_grid' },
            h('div', { class: 'vmt_field' },
                h('label', { class: 'vmt_label' }, 'Position'),
                h('select', {
                    class: 'vmt_select',
                    onchange: (e) => updateField('settings.contextInjection.position', e.target.value)
                },
                ...['authorNote', 'systemPrompt', 'worldInfo'].map(pos =>
                    h('option', { value: pos, selected: contextSettings.position === pos }, pos)
                ))
            ),
            h('div', { class: 'vmt_field' },
                h('label', { class: 'vmt_label' }, 'Custom Header'),
                h('input', {
                    class: 'vmt_input',
                    type: 'text',
                    value: contextSettings.customHeader || '',
                    onchange: (e) => updateField('settings.contextInjection.customHeader', e.target.value)
                })
            ),
            h('div', { class: 'vmt_field' },
                h('label', { class: 'vmt_label' }, 'Custom Footer'),
                h('input', {
                    class: 'vmt_input',
                    type: 'text',
                    value: contextSettings.customFooter || '',
                    onchange: (e) => updateField('settings.contextInjection.customFooter', e.target.value)
                })
            )
        ),
        h('div', { class: 'vmt_checkbox_group' },
            h('label', { class: 'vmt_checkbox' },
                h('input', {
                    type: 'checkbox',
                    checked: contextSettings.includeStats !== false,
                    onchange: (e) => updateField('settings.contextInjection.includeStats', e.target.checked)
                }),
                h('span', {}, 'Include Stats')
            ),
            h('label', { class: 'vmt_checkbox' },
                h('input', {
                    type: 'checkbox',
                    checked: contextSettings.includeEquipment !== false,
                    onchange: (e) => updateField('settings.contextInjection.includeEquipment', e.target.checked)
                }),
                h('span', {}, 'Include Equipment')
            ),
            h('label', { class: 'vmt_checkbox' },
                h('input', {
                    type: 'checkbox',
                    checked: contextSettings.includeBuffsDebuffs !== false,
                    onchange: (e) => updateField('settings.contextInjection.includeBuffsDebuffs', e.target.checked)
                }),
                h('span', {}, 'Include Buffs/Debuffs')
            ),
            h('label', { class: 'vmt_checkbox' },
                h('input', {
                    type: 'checkbox',
                    checked: contextSettings.includeSurvival !== false,
                    onchange: (e) => updateField('settings.contextInjection.includeSurvival', e.target.checked)
                }),
                h('span', {}, 'Include Survival')
            ),
            h('label', { class: 'vmt_checkbox' },
                h('input', {
                    type: 'checkbox',
                    checked: contextSettings.includeResources !== false,
                    onchange: (e) => updateField('settings.contextInjection.includeResources', e.target.checked)
                }),
                h('span', {}, 'Include Resources')
            )
        ),
        h('div', { class: 'vmt_field' },
            h('label', { class: 'vmt_label' }, 'Preview'),
            h('textarea', { class: 'vmt_textarea', rows: 6, readonly: true }, buildContextBlock(state, contextSettings))
        ),
        h('button', {
            class: 'vmt_btn vmt_btn_sm',
            onclick: () => {
                if (typeof openModal === 'function') {
                    openModal('context-preview', { preview: buildContextBlock(state, contextSettings) });
                }
            }
        }, 'Test Inject')
    );

    const autoSection = h('div', { class: 'vmt_card' },
        h('div', { class: 'vmt_section_title' }, 'Auto-Parsing'),
        h('label', { class: 'vmt_checkbox' },
            h('input', {
                type: 'checkbox',
                checked: autoSettings.enabled || false,
                onchange: (e) => updateField('settings.autoParsing.enabled', e.target.checked)
            }),
            h('span', {}, 'Enable Auto-Parsing')
        ),
        h('div', { class: 'vmt_checkbox_group' },
            h('label', { class: 'vmt_checkbox' },
                h('input', {
                    type: 'checkbox',
                    checked: autoSettings.autoApply || false,
                    onchange: (e) => updateField('settings.autoParsing.autoApply', e.target.checked)
                }),
                h('span', {}, 'Auto Apply Changes')
            ),
            h('label', { class: 'vmt_checkbox' },
                h('input', {
                    type: 'checkbox',
                    checked: autoSettings.showToasts !== false,
                    onchange: (e) => updateField('settings.autoParsing.showToasts', e.target.checked)
                }),
                h('span', {}, 'Show Toasts')
            )
        ),
        h('div', { class: 'vmt_field' },
            h('label', { class: 'vmt_label' }, 'Undo Window (seconds)'),
            h('input', {
                class: 'vmt_input',
                type: 'number',
                min: 1,
                value: autoSettings.undoWindow ?? 5,
                onchange: (e) => updateField('settings.autoParsing.undoWindow', Number(e.target.value || 5))
            })
        ),
        h('div', { class: 'vmt_section_subtitle' }, 'Pattern Categories'),
        h('div', { class: 'vmt_checkbox_group' },
            ...Object.entries(CATEGORY_LABELS).map(([key, label]) =>
                h('label', { class: 'vmt_checkbox' },
                    h('input', {
                        type: 'checkbox',
                        checked: autoSettings.parseCategories?.[key] !== false,
                        onchange: (e) => updateField(`settings.autoParsing.parseCategories.${key}`, e.target.checked)
                    }),
                    h('span', {}, label)
                )
            )
        ),
        h('div', { class: 'vmt_section_subtitle' }, 'Custom Patterns'),
        h('div', { class: 'vmt_list' },
            ...(autoSettings.customPatterns || []).map((pattern, index) =>
                h('div', { class: 'vmt_list_item' },
                    h('input', {
                        class: 'vmt_input',
                        type: 'text',
                        placeholder: 'Name',
                        value: pattern.name || '',
                        onchange: (e) => {
                            const next = [...autoSettings.customPatterns];
                            next[index] = { ...next[index], name: e.target.value };
                            updateField('settings.autoParsing.customPatterns', next);
                        }
                    }),
                    h('input', {
                        class: 'vmt_input',
                        type: 'text',
                        placeholder: 'Regex pattern',
                        value: pattern.pattern || '',
                        onchange: (e) => {
                            const next = [...autoSettings.customPatterns];
                            next[index] = { ...next[index], pattern: e.target.value };
                            updateField('settings.autoParsing.customPatterns', next);
                        }
                    }),
                    h('input', {
                        class: 'vmt_input',
                        type: 'text',
                        placeholder: 'Field (e.g., hp.current)',
                        value: pattern.field || '',
                        onchange: (e) => {
                            const next = [...autoSettings.customPatterns];
                            next[index] = { ...next[index], field: e.target.value };
                            updateField('settings.autoParsing.customPatterns', next);
                        }
                    }),
                    h('select', {
                        class: 'vmt_select',
                        onchange: (e) => {
                            const next = [...autoSettings.customPatterns];
                            next[index] = { ...next[index], operation: e.target.value };
                            updateField('settings.autoParsing.customPatterns', next);
                        }
                    },
                    ...['add', 'subtract', 'set'].map(op =>
                        h('option', { value: op, selected: pattern.operation === op }, op)
                    )),
                    h('label', { class: 'vmt_checkbox' },
                        h('input', {
                            type: 'checkbox',
                            checked: pattern.enabled !== false,
                            onchange: (e) => {
                                const next = [...autoSettings.customPatterns];
                                next[index] = { ...next[index], enabled: e.target.checked };
                                updateField('settings.autoParsing.customPatterns', next);
                            }
                        }),
                        h('span', {}, 'Enabled')
                    ),
                    h('button', {
                        class: 'vmt_btn_icon vmt_btn_danger',
                        onclick: () => {
                            const next = [...autoSettings.customPatterns];
                            next.splice(index, 1);
                            updateField('settings.autoParsing.customPatterns', next);
                        },
                        title: 'Remove'
                    }, '')
                )
            ),
            h('button', {
                class: 'vmt_btn vmt_btn_sm vmt_btn_secondary',
                onclick: () => {
                    const next = [...(autoSettings.customPatterns || []), { name: '', pattern: '', field: '', operation: 'add', enabled: true }];
                    updateField('settings.autoParsing.customPatterns', next);
                }
            }, '+ Add Pattern')
        ),
        h('div', { class: 'vmt_section_subtitle' }, 'Parse History'),
        h('div', { class: 'vmt_list' },
            (settings.parseHistory || []).length === 0 ? h('div', { class: 'vmt_empty' }, 'No parse history yet.') : null,
            ...(settings.parseHistory || []).map(entry =>
                h('div', { class: 'vmt_list_item' },
                    h('span', { class: 'vmt_text_muted' }, new Date(entry.timestamp).toLocaleString()),
                    h('span', { class: entry.applied ? 'vmt_text_accent' : 'vmt_text_muted' }, entry.description || '')
                )
            )
        ),
        h('button', {
            class: 'vmt_btn vmt_btn_sm',
            onclick: () => updateField('settings.parseHistory', [])
        }, 'Clear History')
    );

    const npcSection = h('div', { class: 'vmt_card' },
        h('div', { class: 'vmt_section_title' }, 'Important NPC Lives'),
        h('label', { class: 'vmt_checkbox' },
            h('input', {
                type: 'checkbox',
                checked: npcSettings.enabled || false,
                onchange: (e) => updateField('settings.npcLives.enabled', e.target.checked)
            }),
            h('span', {}, 'Enable NPC Lives Injection')
        ),
        h('div', { class: 'vmt_field_grid' },
            h('div', { class: 'vmt_field' },
                h('label', { class: 'vmt_label' }, 'Max Characters'),
                h('input', {
                    class: 'vmt_input',
                    type: 'number',
                    min: 200,
                    value: npcSettings.maxChars ?? 1200,
                    onchange: (e) => updateField('settings.npcLives.maxChars', Number(e.target.value || 1200))
                })
            )
        ),
        h('div', { class: 'vmt_field' },
            h('label', { class: 'vmt_label' }, 'Pinned NPCs (one per line)'),
            h('textarea', {
                class: 'vmt_textarea',
                rows: 4,
                onchange: (e) => updateField('settings.npcLives.pinnedNpcs', parsePinnedList(e.target.value))
            }, (npcSettings.pinnedNpcs || []).join('\n'))
        )
    );

    const generalSection = h('div', { class: 'vmt_card' },
        h('div', { class: 'vmt_section_title' }, 'General Settings'),
        h('div', { class: 'vmt_field' },
            h('label', { class: 'vmt_label' }, 'Theme'),
            h('select', { class: 'vmt_select', disabled: true },
                h('option', { value: 'default', selected: true }, 'Default')
            )
        ),
        h('div', { class: 'vmt_field' },
            h('label', { class: 'vmt_label' }, 'Export / Import JSON'),
            h('textarea', { class: 'vmt_textarea', rows: 6, id: 'vmt_settings_json' })
        ),
        h('div', { class: 'vmt_inline_controls' },
            h('button', {
                class: 'vmt_btn vmt_btn_sm',
                onclick: () => {
                    const textarea = document.getElementById('vmt_settings_json');
                    if (textarea) textarea.value = JSON.stringify(state, null, 2);
                }
            }, 'Export State'),
            h('button', {
                class: 'vmt_btn vmt_btn_sm',
                onclick: async () => {
                    const textarea = document.getElementById('vmt_settings_json');
                    if (!textarea || !textarea.value) return;
                    try {
                        const parsed = JSON.parse(textarea.value);
                        await setState(parsed);
                    } catch (e) {
                        alert('Invalid JSON');
                    }
                }
            }, 'Import State'),
            h('button', {
                class: 'vmt_btn vmt_btn_danger vmt_btn_sm',
                onclick: async () => {
                    await setState(createEmptyState());
                }
            }, 'Reset to Defaults')
        )
    );

    container.append(contextSection, npcSection, autoSection, generalSection);
    return container;
}
