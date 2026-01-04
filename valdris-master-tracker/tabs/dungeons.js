/**
 * Valdris Master Tracker - Dungeons Tab
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

const TYPES = ['Natural', 'Artificial', 'Corrupted', 'Divine', 'Vex', 'Unknown'];
const DIFFICULTIES = ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];
const STATUSES = ['Undiscovered', 'Discovered', 'In Progress', 'Cleared', 'Failed'];

export function renderDungeonsTab() {
    const state = getState();
    const dungeons = state.dungeons || [];

    const container = h('div', { class: 'vmt_tab_content' });

    const header = h('div', { class: 'vmt_section_header' },
        h('div', { class: 'vmt_section_title' }, 'Dungeons'),
        h('button', {
            class: 'vmt_btn vmt_btn_sm',
            onclick: () => {
                const next = [...dungeons, {
                    id: generateId(),
                    name: '',
                    location: '',
                    type: 'Natural',
                    difficulty: 'D',
                    floorsTotal: 1,
                    floorsCleared: 0,
                    bossesDefeated: [],
                    lootObtained: [],
                    status: 'Undiscovered',
                    notes: ''
                }];
                updateField('dungeons', next);
            }
        }, '+ Add')
    );

    const list = h('div', { class: 'vmt_card_list' },
        dungeons.length === 0 ? h('div', { class: 'vmt_empty' }, 'No dungeons tracked.') : null,
        ...dungeons.map((dungeon, index) => {
            const total = Number(dungeon.floorsTotal || 0) || 1;
            const cleared = Math.min(total, Number(dungeon.floorsCleared || 0));
            const percent = total > 0 ? Math.round((cleared / total) * 100) : 0;
            const diffClass = `vmt-diff-${String(dungeon.difficulty || 'd').toLowerCase()}`;

            return h('div', { class: 'vmt_card vmt_dungeon_card' },
                h('div', { class: 'vmt_card_header' },
                    h('input', {
                        class: 'vmt_input',
                        type: 'text',
                        value: dungeon.name || '',
                        placeholder: 'Dungeon name',
                        onchange: (e) => {
                            const next = [...dungeons];
                            next[index] = { ...next[index], name: e.target.value };
                            updateField('dungeons', next);
                        }
                    }),
                    h('span', { class: `vmt_badge ${diffClass}` }, dungeon.difficulty || 'D'),
                    h('button', {
                        class: 'vmt_btn_icon vmt_btn_danger',
                        onclick: () => {
                            const next = [...dungeons];
                            next.splice(index, 1);
                            updateField('dungeons', next);
                        },
                        title: 'Remove'
                    }, '')
                ),
                h('div', { class: 'vmt_field_grid' },
                    h('div', { class: 'vmt_field' },
                        h('label', { class: 'vmt_label' }, 'Location'),
                        h('input', {
                            class: 'vmt_input',
                            type: 'text',
                            value: dungeon.location || '',
                            onchange: (e) => {
                                const next = [...dungeons];
                                next[index] = { ...next[index], location: e.target.value };
                                updateField('dungeons', next);
                            }
                        })
                    ),
                    h('div', { class: 'vmt_field' },
                        h('label', { class: 'vmt_label' }, 'Type'),
                        h('select', {
                            class: 'vmt_select',
                            onchange: (e) => {
                                const next = [...dungeons];
                                next[index] = { ...next[index], type: e.target.value };
                                updateField('dungeons', next);
                            }
                        },
                        ...TYPES.map(type =>
                            h('option', { value: type, selected: dungeon.type === type }, type)
                        ))
                    ),
                    h('div', { class: 'vmt_field' },
                        h('label', { class: 'vmt_label' }, 'Difficulty'),
                        h('select', {
                            class: `vmt_select ${diffClass}`,
                            onchange: (e) => {
                                const next = [...dungeons];
                                next[index] = { ...next[index], difficulty: e.target.value };
                                updateField('dungeons', next);
                            }
                        },
                        ...DIFFICULTIES.map(diff =>
                            h('option', { value: diff, selected: dungeon.difficulty === diff }, diff)
                        ))
                    ),
                    h('div', { class: 'vmt_field' },
                        h('label', { class: 'vmt_label' }, 'Status'),
                        h('select', {
                            class: 'vmt_select',
                            onchange: (e) => {
                                const next = [...dungeons];
                                next[index] = { ...next[index], status: e.target.value };
                                updateField('dungeons', next);
                            }
                        },
                        ...STATUSES.map(status =>
                            h('option', { value: status, selected: dungeon.status === status }, status)
                        ))
                    )
                ),
                h('div', { class: 'vmt_dungeon_progress' },
                    h('div', { class: 'vmt_progress_bar' },
                        h('div', { class: 'vmt_progress_fill', style: `width: ${percent}%` })
                    ),
                    h('div', { class: 'vmt_dungeon_progress_label' }, `${cleared}/${total} floors cleared`)
                ),
                h('div', { class: 'vmt_field_grid' },
                    h('div', { class: 'vmt_field' },
                        h('label', { class: 'vmt_label' }, 'Floors Total'),
                        h('input', {
                            class: 'vmt_input',
                            type: 'number',
                            min: 1,
                            value: total,
                            onchange: (e) => {
                                const next = [...dungeons];
                                next[index] = { ...next[index], floorsTotal: Number(e.target.value || 1) };
                                updateField('dungeons', next);
                            }
                        })
                    ),
                    h('div', { class: 'vmt_field' },
                        h('label', { class: 'vmt_label' }, 'Floors Cleared'),
                        h('input', {
                            class: 'vmt_input',
                            type: 'number',
                            min: 0,
                            value: dungeon.floorsCleared ?? 0,
                            onchange: (e) => {
                                const next = [...dungeons];
                                next[index] = { ...next[index], floorsCleared: Number(e.target.value || 0) };
                                updateField('dungeons', next);
                            }
                        })
                    )
                ),
                h('div', { class: 'vmt_field' },
                    h('label', { class: 'vmt_label' }, 'Boss Checklist'),
                    h('div', { class: 'vmt_boss_list' },
                        ...(dungeon.bossesDefeated || []).map((boss, bossIndex) =>
                            h('label', { class: 'vmt_checkbox' },
                                h('input', {
                                    type: 'checkbox',
                                    checked: true,
                                    onchange: (e) => {
                                        const next = [...dungeons];
                                        const bosses = [...(next[index].bossesDefeated || [])];
                                        if (!e.target.checked) {
                                            bosses.splice(bossIndex, 1);
                                            next[index] = { ...next[index], bossesDefeated: bosses };
                                            updateField('dungeons', next);
                                        }
                                    }
                                }),
                                h('span', {}, boss)
                            )
                        ),
                        h('button', {
                            class: 'vmt_btn vmt_btn_sm vmt_btn_secondary',
                            onclick: () => {
                                const name = prompt('Boss name');
                                if (!name) return;
                                const next = [...dungeons];
                                const bosses = [...(next[index].bossesDefeated || []), name];
                                next[index] = { ...next[index], bossesDefeated: bosses };
                                updateField('dungeons', next);
                            }
                        }, '+ Add Boss')
                    )
                ),
                h('div', { class: 'vmt_field_grid' },
                    h('div', { class: 'vmt_field' },
                        h('label', { class: 'vmt_label' }, 'Loot Obtained'),
                        h('textarea', {
                            class: 'vmt_textarea',
                            rows: 2,
                            onchange: (e) => {
                                const next = [...dungeons];
                                next[index] = {
                                    ...next[index],
                                    lootObtained: e.target.value.split('\n').map(line => line.trim()).filter(Boolean)
                                };
                                updateField('dungeons', next);
                            }
                        }, (dungeon.lootObtained || []).join('\n'))
                    ),
                    h('div', { class: 'vmt_field' },
                        h('label', { class: 'vmt_label' }, 'Notes'),
                        h('textarea', {
                            class: 'vmt_textarea',
                            rows: 2,
                            onchange: (e) => {
                                const next = [...dungeons];
                                next[index] = { ...next[index], notes: e.target.value };
                                updateField('dungeons', next);
                            }
                        }, dungeon.notes || '')
                    )
                )
            );
        })
    );

    container.append(header, list);
    return container;
}
