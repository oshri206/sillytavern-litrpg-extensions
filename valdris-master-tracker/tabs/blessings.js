/**
 * Valdris Master Tracker - Blessings Tab
 */

import { getState, updateField } from '../state-manager.js';

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

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

const TYPE_CLASSES = {
    Blessing: 'vmt_blessing',
    Curse: 'vmt_curse',
    Mixed: 'vmt_mixed'
};

export function renderBlessingsTab() {
    const state = getState();
    const blessings = state.blessings || [];

    const container = h('div', { class: 'vmt_tab_content' });

    const header = h('div', { class: 'vmt_section_header' },
        h('div', { class: 'vmt_section_title' }, 'Blessings & Curses'),
        h('button', {
            class: 'vmt_btn vmt_btn_sm',
            onclick: () => {
                const next = [...blessings, {
                    id: generateId(),
                    name: '',
                    source: '',
                    type: 'Blessing',
                    description: '',
                    effects: [],
                    conditions: '',
                    duration: 'Permanent',
                    expiresAt: null,
                    active: true
                }];
                updateField('blessings', next);
            }
        }, '+ Add')
    );

    const list = h('div', { class: 'vmt_card_list' },
        blessings.length === 0 ? h('div', { class: 'vmt_empty' }, 'No blessings tracked yet.') : null,
        ...blessings.map((blessing, index) => {
            const typeClass = TYPE_CLASSES[blessing.type] || 'vmt_blessing';
            return h('div', { class: `vmt_card vmt_blessing_card ${typeClass}` },
                h('div', { class: 'vmt_card_header' },
                    h('input', {
                        class: 'vmt_input',
                        type: 'text',
                        value: blessing.name,
                        placeholder: 'Blessing name',
                        onchange: (e) => {
                            const next = [...blessings];
                            next[index] = { ...next[index], name: e.target.value };
                            updateField('blessings', next);
                        }
                    }),
                    h('button', {
                        class: 'vmt_btn_icon vmt_btn_danger',
                        onclick: () => {
                            const next = [...blessings];
                            next.splice(index, 1);
                            updateField('blessings', next);
                        },
                        title: 'Remove'
                    }, '')
                ),
                h('div', { class: 'vmt_field_grid' },
                    h('div', { class: 'vmt_field' },
                        h('label', { class: 'vmt_label' }, 'Source'),
                        h('input', {
                            class: 'vmt_input',
                            type: 'text',
                            value: blessing.source || '',
                            placeholder: 'God or entity',
                            onchange: (e) => {
                                const next = [...blessings];
                                next[index] = { ...next[index], source: e.target.value };
                                updateField('blessings', next);
                            }
                        })
                    ),
                    h('div', { class: 'vmt_field' },
                        h('label', { class: 'vmt_label' }, 'Type'),
                        h('select', {
                            class: 'vmt_select',
                            onchange: (e) => {
                                const next = [...blessings];
                                next[index] = { ...next[index], type: e.target.value };
                                updateField('blessings', next);
                            }
                        },
                        ...['Blessing', 'Curse', 'Mixed'].map(type =>
                            h('option', { value: type, selected: blessing.type === type }, type)
                        ))
                    ),
                    h('div', { class: 'vmt_field' },
                        h('label', { class: 'vmt_label' }, 'Duration'),
                        h('select', {
                            class: 'vmt_select',
                            onchange: (e) => {
                                const next = [...blessings];
                                next[index] = { ...next[index], duration: e.target.value };
                                updateField('blessings', next);
                            }
                        },
                        ...['Permanent', 'Temporary', 'Conditional'].map(duration =>
                            h('option', { value: duration, selected: blessing.duration === duration }, duration)
                        ))
                    ),
                    h('div', { class: 'vmt_field' },
                        h('label', { class: 'vmt_label' }, 'Expires At'),
                        h('input', {
                            class: 'vmt_input',
                            type: 'date',
                            value: blessing.expiresAt || '',
                            onchange: (e) => {
                                const next = [...blessings];
                                next[index] = { ...next[index], expiresAt: e.target.value || null };
                                updateField('blessings', next);
                            }
                        })
                    )
                ),
                h('div', { class: 'vmt_field' },
                    h('label', { class: 'vmt_label' }, 'Description'),
                    h('textarea', {
                        class: 'vmt_textarea',
                        rows: 2,
                        placeholder: 'Describe the blessing or curse...',
                        onchange: (e) => {
                            const next = [...blessings];
                            next[index] = { ...next[index], description: e.target.value };
                            updateField('blessings', next);
                        }
                    }, blessing.description || '')
                ),
                h('div', { class: 'vmt_field' },
                    h('label', { class: 'vmt_label' }, 'Effects (one per line)'),
                    h('textarea', {
                        class: 'vmt_textarea',
                        rows: 2,
                        placeholder: 'Effect details...',
                        onchange: (e) => {
                            const next = [...blessings];
                            next[index] = {
                                ...next[index],
                                effects: e.target.value.split('\n').map(line => line.trim()).filter(Boolean)
                            };
                            updateField('blessings', next);
                        }
                    }, (blessing.effects || []).join('\n'))
                ),
                h('div', { class: 'vmt_field' },
                    h('label', { class: 'vmt_label' }, 'Conditions'),
                    h('input', {
                        class: 'vmt_input',
                        type: 'text',
                        value: blessing.conditions || '',
                        placeholder: 'Requirements to maintain...',
                        onchange: (e) => {
                            const next = [...blessings];
                            next[index] = { ...next[index], conditions: e.target.value };
                            updateField('blessings', next);
                        }
                    })
                ),
                h('label', { class: 'vmt_checkbox' },
                    h('input', {
                        type: 'checkbox',
                        checked: blessing.active !== false,
                        onchange: (e) => {
                            const next = [...blessings];
                            next[index] = { ...next[index], active: e.target.checked };
                            updateField('blessings', next);
                        }
                    }),
                    h('span', {}, 'Active')
                )
            );
        })
    );

    container.append(header, list);
    return container;
}
