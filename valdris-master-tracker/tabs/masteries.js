/**
 * Valdris Master Tracker - Masteries Tab
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

const RANKS = ['Novice', 'Apprentice', 'Journeyman', 'Expert', 'Master', 'Grandmaster', 'Legendary'];
const CATEGORIES = ['Weapon', 'Magic', 'Craft', 'Combat Style', 'Other'];

function getRankClass(rank) {
    return `vmt-rank-${rank.toLowerCase()}`;
}

export function renderMasteriesTab() {
    const state = getState();
    const masteries = state.masteries || [];

    const container = h('div', { class: 'vmt_tab_content' });

    const header = h('div', { class: 'vmt_section_header' },
        h('div', { class: 'vmt_section_title' }, 'Masteries'),
        h('button', {
            class: 'vmt_btn vmt_btn_sm',
            onclick: () => {
                const next = [...masteries, {
                    id: generateId(),
                    name: '',
                    category: 'Weapon',
                    rank: 'Novice',
                    currentXP: 0,
                    xpToNext: 100,
                    description: '',
                    unlockedAbilities: [],
                    nextRankAbility: ''
                }];
                updateField('masteries', next);
            }
        }, '+ Add')
    );

    const list = h('div', { class: 'vmt_card_list' },
        masteries.length === 0 ? h('div', { class: 'vmt_empty' }, 'No masteries yet.') : null,
        ...masteries.map((mastery, index) => {
            const percent = mastery.xpToNext > 0 ? Math.min(100, Math.max(0, (mastery.currentXP / mastery.xpToNext) * 100)) : 0;
            return h('div', { class: 'vmt_card vmt_mastery_card' },
                h('div', { class: 'vmt_card_header' },
                    h('input', {
                        class: 'vmt_input',
                        type: 'text',
                        value: mastery.name,
                        placeholder: 'Mastery name',
                        onchange: (e) => {
                            const next = [...masteries];
                            next[index] = { ...next[index], name: e.target.value };
                            updateField('masteries', next);
                        }
                    }),
                    h('button', {
                        class: 'vmt_btn_icon vmt_btn_danger',
                        onclick: () => {
                            const next = [...masteries];
                            next.splice(index, 1);
                            updateField('masteries', next);
                        },
                        title: 'Remove'
                    }, '')
                ),
                h('div', { class: 'vmt_field_grid' },
                    h('div', { class: 'vmt_field' },
                        h('label', { class: 'vmt_label' }, 'Category'),
                        h('select', {
                            class: 'vmt_select',
                            onchange: (e) => {
                                const next = [...masteries];
                                next[index] = { ...next[index], category: e.target.value };
                                updateField('masteries', next);
                            }
                        },
                        ...CATEGORIES.map(category =>
                            h('option', { value: category, selected: mastery.category === category }, category)
                        ))
                    ),
                    h('div', { class: 'vmt_field' },
                        h('label', { class: 'vmt_label' }, 'Rank'),
                        h('select', {
                            class: `vmt_select ${getRankClass(mastery.rank)}`,
                            onchange: (e) => {
                                const next = [...masteries];
                                next[index] = { ...next[index], rank: e.target.value };
                                updateField('masteries', next);
                            }
                        },
                        ...RANKS.map(rank =>
                            h('option', { value: rank, selected: mastery.rank === rank }, rank)
                        ))
                    )
                ),
                h('div', { class: 'vmt_mastery_progress' },
                    h('div', { class: 'vmt_mastery_progress_label' }, `${mastery.currentXP}/${mastery.xpToNext} XP`),
                    h('div', { class: 'vmt_progress_bar' },
                        h('div', { class: 'vmt_progress_fill', style: `width: ${percent}%` })
                    )
                ),
                h('div', { class: 'vmt_field_grid' },
                    h('div', { class: 'vmt_field' },
                        h('label', { class: 'vmt_label' }, 'Current XP'),
                        h('input', {
                            class: 'vmt_input',
                            type: 'number',
                            value: mastery.currentXP ?? 0,
                            onchange: (e) => {
                                const next = [...masteries];
                                next[index] = { ...next[index], currentXP: Number(e.target.value || 0) };
                                updateField('masteries', next);
                            }
                        })
                    ),
                    h('div', { class: 'vmt_field' },
                        h('label', { class: 'vmt_label' }, 'XP to Next'),
                        h('input', {
                            class: 'vmt_input',
                            type: 'number',
                            value: mastery.xpToNext ?? 0,
                            onchange: (e) => {
                                const next = [...masteries];
                                next[index] = { ...next[index], xpToNext: Number(e.target.value || 0) };
                                updateField('masteries', next);
                            }
                        })
                    )
                ),
                h('div', { class: 'vmt_field' },
                    h('label', { class: 'vmt_label' }, 'Description'),
                    h('textarea', {
                        class: 'vmt_textarea',
                        rows: 2,
                        placeholder: 'Mastery description...',
                        onchange: (e) => {
                            const next = [...masteries];
                            next[index] = { ...next[index], description: e.target.value };
                            updateField('masteries', next);
                        }
                    }, mastery.description || '')
                ),
                h('div', { class: 'vmt_field' },
                    h('label', { class: 'vmt_label' }, 'Unlocked Abilities (one per line)'),
                    h('textarea', {
                        class: 'vmt_textarea',
                        rows: 2,
                        onchange: (e) => {
                            const next = [...masteries];
                            next[index] = {
                                ...next[index],
                                unlockedAbilities: e.target.value.split('\n').map(line => line.trim()).filter(Boolean)
                            };
                            updateField('masteries', next);
                        }
                    }, (mastery.unlockedAbilities || []).join('\n'))
                ),
                h('div', { class: 'vmt_field' },
                    h('label', { class: 'vmt_label' }, 'Next Rank Ability'),
                    h('input', {
                        class: 'vmt_input',
                        type: 'text',
                        value: mastery.nextRankAbility || '',
                        placeholder: 'Preview next unlock...',
                        onchange: (e) => {
                            const next = [...masteries];
                            next[index] = { ...next[index], nextRankAbility: e.target.value };
                            updateField('masteries', next);
                        }
                    })
                )
            );
        })
    );

    container.append(header, list);
    return container;
}
