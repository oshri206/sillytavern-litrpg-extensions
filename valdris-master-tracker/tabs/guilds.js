/**
 * Valdris Master Tracker - Guilds Tab
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

const TYPES = ['Adventurer', 'Merchant', 'Craft', 'Military', 'Criminal', 'Religious', 'Arcane', 'Other'];

export function renderGuildsTab() {
    const state = getState();
    const guilds = state.guilds || [];

    const container = h('div', { class: 'vmt_tab_content' });

    const header = h('div', { class: 'vmt_section_header' },
        h('div', { class: 'vmt_section_title' }, 'Guilds & Organizations'),
        h('button', {
            class: 'vmt_btn vmt_btn_sm',
            onclick: () => {
                const next = [...guilds, {
                    id: generateId(),
                    name: '',
                    type: 'Adventurer',
                    rank: '',
                    rankLevel: 0,
                    reputation: 0,
                    benefits: [],
                    duties: [],
                    joinDate: '',
                    notes: '',
                    isPrimary: false,
                    dues: ''
                }];
                updateField('guilds', next);
            }
        }, '+ Add')
    );

    const list = h('div', { class: 'vmt_card_list' },
        guilds.length === 0 ? h('div', { class: 'vmt_empty' }, 'No guilds tracked.') : null,
        ...guilds.map((guild, index) => {
            const repPercent = Math.max(0, Math.min(100, Number(guild.reputation || 0)));
            return h('div', { class: 'vmt_card vmt_guild_card' },
                h('div', { class: 'vmt_card_header' },
                    h('input', {
                        class: 'vmt_input',
                        type: 'text',
                        value: guild.name || '',
                        placeholder: 'Guild name',
                        onchange: (e) => {
                            const next = [...guilds];
                            next[index] = { ...next[index], name: e.target.value };
                            updateField('guilds', next);
                        }
                    }),
                    h('label', { class: 'vmt_checkbox' },
                        h('input', {
                            type: 'checkbox',
                            checked: guild.isPrimary || false,
                            onchange: (e) => {
                                const next = guilds.map((entry, idx) => ({
                                    ...entry,
                                    isPrimary: idx === index ? e.target.checked : false
                                }));
                                updateField('guilds', next);
                            }
                        }),
                        h('span', {}, 'Primary')
                    ),
                    h('button', {
                        class: 'vmt_btn_icon vmt_btn_danger',
                        onclick: () => {
                            const next = [...guilds];
                            next.splice(index, 1);
                            updateField('guilds', next);
                        },
                        title: 'Remove'
                    }, '')
                ),
                h('div', { class: 'vmt_field_grid' },
                    h('div', { class: 'vmt_field' },
                        h('label', { class: 'vmt_label' }, 'Type'),
                        h('select', {
                            class: 'vmt_select',
                            onchange: (e) => {
                                const next = [...guilds];
                                next[index] = { ...next[index], type: e.target.value };
                                updateField('guilds', next);
                            }
                        },
                        ...TYPES.map(type =>
                            h('option', { value: type, selected: guild.type === type }, type)
                        ))
                    ),
                    h('div', { class: 'vmt_field' },
                        h('label', { class: 'vmt_label' }, 'Rank'),
                        h('input', {
                            class: 'vmt_input',
                            type: 'text',
                            value: guild.rank || '',
                            onchange: (e) => {
                                const next = [...guilds];
                                next[index] = { ...next[index], rank: e.target.value };
                                updateField('guilds', next);
                            }
                        })
                    ),
                    h('div', { class: 'vmt_field' },
                        h('label', { class: 'vmt_label' }, 'Rank Level'),
                        h('input', {
                            class: 'vmt_input',
                            type: 'number',
                            value: guild.rankLevel ?? 0,
                            onchange: (e) => {
                                const next = [...guilds];
                                next[index] = { ...next[index], rankLevel: Number(e.target.value || 0) };
                                updateField('guilds', next);
                            }
                        })
                    )
                ),
                h('div', { class: 'vmt_field' },
                    h('label', { class: 'vmt_label' }, `Reputation (${guild.reputation ?? 0})`),
                    h('div', { class: 'vmt_progress_bar vmt_guild_reputation' },
                        h('div', { class: 'vmt_progress_fill', style: `width: ${repPercent}%` })
                    ),
                    h('input', {
                        class: 'vmt_range',
                        type: 'range',
                        min: 0,
                        max: 100,
                        value: guild.reputation ?? 0,
                        oninput: (e) => {
                            const next = [...guilds];
                            next[index] = { ...next[index], reputation: Number(e.target.value || 0) };
                            updateField('guilds', next);
                        }
                    })
                ),
                h('div', { class: 'vmt_field_grid' },
                    h('div', { class: 'vmt_field' },
                        h('label', { class: 'vmt_label' }, 'Benefits'),
                        h('textarea', {
                            class: 'vmt_textarea',
                            rows: 2,
                            onchange: (e) => {
                                const next = [...guilds];
                                next[index] = {
                                    ...next[index],
                                    benefits: e.target.value.split('\n').map(line => line.trim()).filter(Boolean)
                                };
                                updateField('guilds', next);
                            }
                        }, (guild.benefits || []).join('\n'))
                    ),
                    h('div', { class: 'vmt_field' },
                        h('label', { class: 'vmt_label' }, 'Duties'),
                        h('textarea', {
                            class: 'vmt_textarea',
                            rows: 2,
                            onchange: (e) => {
                                const next = [...guilds];
                                next[index] = {
                                    ...next[index],
                                    duties: e.target.value.split('\n').map(line => line.trim()).filter(Boolean)
                                };
                                updateField('guilds', next);
                            }
                        }, (guild.duties || []).join('\n'))
                    )
                ),
                h('div', { class: 'vmt_field_grid' },
                    h('div', { class: 'vmt_field' },
                        h('label', { class: 'vmt_label' }, 'Join Date'),
                        h('input', {
                            class: 'vmt_input',
                            type: 'date',
                            value: guild.joinDate || '',
                            onchange: (e) => {
                                const next = [...guilds];
                                next[index] = { ...next[index], joinDate: e.target.value };
                                updateField('guilds', next);
                            }
                        })
                    ),
                    h('div', { class: 'vmt_field' },
                        h('label', { class: 'vmt_label' }, 'Dues/Fees'),
                        h('input', {
                            class: 'vmt_input',
                            type: 'text',
                            value: guild.dues || '',
                            onchange: (e) => {
                                const next = [...guilds];
                                next[index] = { ...next[index], dues: e.target.value };
                                updateField('guilds', next);
                            }
                        })
                    )
                ),
                h('div', { class: 'vmt_field' },
                    h('label', { class: 'vmt_label' }, 'Notes'),
                    h('textarea', {
                        class: 'vmt_textarea',
                        rows: 2,
                        onchange: (e) => {
                            const next = [...guilds];
                            next[index] = { ...next[index], notes: e.target.value };
                            updateField('guilds', next);
                        }
                    }, guild.notes || '')
                )
            );
        })
    );

    container.append(header, list);
    return container;
}
