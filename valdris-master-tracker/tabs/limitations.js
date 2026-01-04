/**
 * Valdris Master Tracker - Limitations Tab
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

const TYPES = ['Vow', 'Curse', 'Weakness', 'Restriction', 'Geas', 'Other'];

export function renderLimitationsTab() {
    const state = getState();
    const limitations = state.limitations || [];

    const container = h('div', { class: 'vmt_tab_content' });

    const header = h('div', { class: 'vmt_section_header' },
        h('div', { class: 'vmt_section_title' }, 'Limitations'),
        h('button', {
            class: 'vmt_btn vmt_btn_sm',
            onclick: () => {
                const next = [...limitations, {
                    id: generateId(),
                    name: '',
                    type: 'Weakness',
                    source: '',
                    description: '',
                    effects: [],
                    breakCondition: '',
                    penalty: '',
                    active: true
                }];
                updateField('limitations', next);
            }
        }, '+ Add')
    );

    const list = h('div', { class: 'vmt_card_list' },
        limitations.length === 0 ? h('div', { class: 'vmt_empty' }, 'No limitations tracked.') : null,
        ...limitations.map((limitation, index) =>
            h('details', { class: `vmt_card vmt_limitation_card ${limitation.active ? 'vmt_limitation_active' : ''}`, open: true },
                h('summary', { class: 'vmt_limitation_summary' },
                    h('span', { class: 'vmt_limitation_name' }, limitation.name || 'Unnamed Limitation'),
                    h('span', { class: 'vmt_badge' }, limitation.type || 'Other'),
                    h('label', { class: 'vmt_checkbox' },
                        h('input', {
                            type: 'checkbox',
                            checked: limitation.active !== false,
                            onchange: (e) => {
                                const next = [...limitations];
                                next[index] = { ...next[index], active: e.target.checked };
                                updateField('limitations', next);
                            }
                        }),
                        h('span', {}, 'Active')
                    )
                ),
                h('div', { class: 'vmt_card_body' },
                    h('div', { class: 'vmt_field_grid' },
                        h('div', { class: 'vmt_field' },
                            h('label', { class: 'vmt_label' }, 'Name'),
                            h('input', {
                                class: 'vmt_input',
                                type: 'text',
                                value: limitation.name || '',
                                onchange: (e) => {
                                    const next = [...limitations];
                                    next[index] = { ...next[index], name: e.target.value };
                                    updateField('limitations', next);
                                }
                            })
                        ),
                        h('div', { class: 'vmt_field' },
                            h('label', { class: 'vmt_label' }, 'Type'),
                            h('select', {
                                class: 'vmt_select',
                                onchange: (e) => {
                                    const next = [...limitations];
                                    next[index] = { ...next[index], type: e.target.value };
                                    updateField('limitations', next);
                                }
                            },
                            ...TYPES.map(type =>
                                h('option', { value: type, selected: limitation.type === type }, type)
                            ))
                        ),
                        h('div', { class: 'vmt_field' },
                            h('label', { class: 'vmt_label' }, 'Source'),
                            h('input', {
                                class: 'vmt_input',
                                type: 'text',
                                value: limitation.source || '',
                                onchange: (e) => {
                                    const next = [...limitations];
                                    next[index] = { ...next[index], source: e.target.value };
                                    updateField('limitations', next);
                                }
                            })
                        )
                    ),
                    h('div', { class: 'vmt_field' },
                        h('label', { class: 'vmt_label' }, 'Description'),
                        h('textarea', {
                            class: 'vmt_textarea',
                            rows: 2,
                            onchange: (e) => {
                                const next = [...limitations];
                                next[index] = { ...next[index], description: e.target.value };
                                updateField('limitations', next);
                            }
                        }, limitation.description || '')
                    ),
                    h('div', { class: 'vmt_field' },
                        h('label', { class: 'vmt_label' }, 'Effects (one per line)'),
                        h('textarea', {
                            class: 'vmt_textarea',
                            rows: 2,
                            onchange: (e) => {
                                const next = [...limitations];
                                next[index] = {
                                    ...next[index],
                                    effects: e.target.value.split('\n').map(line => line.trim()).filter(Boolean)
                                };
                                updateField('limitations', next);
                            }
                        }, (limitation.effects || []).join('\n'))
                    ),
                    h('div', { class: 'vmt_field_grid' },
                        h('div', { class: 'vmt_field' },
                            h('label', { class: 'vmt_label' }, 'Break Condition'),
                            h('input', {
                                class: 'vmt_input',
                                type: 'text',
                                value: limitation.breakCondition || '',
                                onchange: (e) => {
                                    const next = [...limitations];
                                    next[index] = { ...next[index], breakCondition: e.target.value };
                                    updateField('limitations', next);
                                }
                            })
                        ),
                        h('div', { class: 'vmt_field' },
                            h('label', { class: 'vmt_label' }, 'Penalty (if broken)'),
                            h('input', {
                                class: 'vmt_input',
                                type: 'text',
                                value: limitation.penalty || '',
                                onchange: (e) => {
                                    const next = [...limitations];
                                    next[index] = { ...next[index], penalty: e.target.value };
                                    updateField('limitations', next);
                                }
                            })
                        )
                    ),
                    h('button', {
                        class: 'vmt_btn vmt_btn_danger vmt_btn_sm',
                        onclick: () => {
                            const next = [...limitations];
                            next.splice(index, 1);
                            updateField('limitations', next);
                        }
                    }, 'Remove')
                )
            )
        )
    );

    container.append(header, list);
    return container;
}
