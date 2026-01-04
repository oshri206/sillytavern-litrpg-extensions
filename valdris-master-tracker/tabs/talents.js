/**
 * Valdris Master Tracker - Talents Tab
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

export function renderTalentsTab() {
    const state = getState();
    const talents = state.talents || { availablePoints: 0, trees: [] };

    const container = h('div', { class: 'vmt_tab_content' });

    const header = h('div', { class: 'vmt_section_header' },
        h('div', { class: 'vmt_section_title' }, 'Talent Trees'),
        h('div', { class: 'vmt_inline_controls' },
            h('label', { class: 'vmt_label' }, 'Available Points'),
            h('input', {
                class: 'vmt_input',
                type: 'number',
                value: talents.availablePoints ?? 0,
                onchange: (e) => updateField('talents.availablePoints', Number(e.target.value || 0))
            }),
            h('button', {
                class: 'vmt_btn vmt_btn_sm',
                onclick: () => {
                    const next = [...(talents.trees || []), {
                        id: generateId(),
                        name: 'New Tree',
                        points: 0,
                        talents: []
                    }];
                    updateField('talents.trees', next);
                }
            }, '+ Add Tree')
        )
    );

    const list = h('div', { class: 'vmt_card_list' },
        (talents.trees || []).length === 0 ? h('div', { class: 'vmt_empty' }, 'No talent trees created.') : null,
        ...(talents.trees || []).map((tree, treeIndex) =>
            h('div', { class: 'vmt_card vmt_talent_tree' },
                h('div', { class: 'vmt_card_header' },
                    h('input', {
                        class: 'vmt_input',
                        type: 'text',
                        value: tree.name || '',
                        onchange: (e) => {
                            const next = [...talents.trees];
                            next[treeIndex] = { ...next[treeIndex], name: e.target.value };
                            updateField('talents.trees', next);
                        }
                    }),
                    h('input', {
                        class: 'vmt_input vmt_input_sm',
                        type: 'number',
                        value: tree.points ?? 0,
                        onchange: (e) => {
                            const next = [...talents.trees];
                            next[treeIndex] = { ...next[treeIndex], points: Number(e.target.value || 0) };
                            updateField('talents.trees', next);
                        }
                    }),
                    h('span', { class: 'vmt_text_muted' }, 'Points'),
                    h('button', {
                        class: 'vmt_btn_icon vmt_btn_danger',
                        onclick: () => {
                            const next = [...talents.trees];
                            next.splice(treeIndex, 1);
                            updateField('talents.trees', next);
                        },
                        title: 'Remove'
                    }, '')
                ),
                h('div', { class: 'vmt_talent_list' },
                    (tree.talents || []).length === 0 ? h('div', { class: 'vmt_empty' }, 'No talents in this tree.') : null,
                    ...(tree.talents || []).map((talent, talentIndex) =>
                        h('div', { class: 'vmt_talent_item' },
                            h('div', { class: 'vmt_field_grid' },
                                h('input', {
                                    class: 'vmt_input',
                                    type: 'text',
                                    placeholder: 'Talent name',
                                    value: talent.name || '',
                                    onchange: (e) => {
                                        const next = [...talents.trees];
                                        const treeCopy = { ...next[treeIndex] };
                                        const talentList = [...(treeCopy.talents || [])];
                                        talentList[talentIndex] = { ...talentList[talentIndex], name: e.target.value };
                                        treeCopy.talents = talentList;
                                        next[treeIndex] = treeCopy;
                                        updateField('talents.trees', next);
                                    }
                                }),
                                h('input', {
                                    class: 'vmt_input vmt_input_sm',
                                    type: 'number',
                                    min: 1,
                                    max: 5,
                                    value: talent.tier ?? 1,
                                    onchange: (e) => {
                                        const next = [...talents.trees];
                                        const treeCopy = { ...next[treeIndex] };
                                        const talentList = [...(treeCopy.talents || [])];
                                        talentList[talentIndex] = { ...talentList[talentIndex], tier: Number(e.target.value || 1) };
                                        treeCopy.talents = talentList;
                                        next[treeIndex] = treeCopy;
                                        updateField('talents.trees', next);
                                    }
                                }),
                                h('span', { class: 'vmt_text_muted' }, 'Tier')
                            ),
                            h('div', { class: 'vmt_field_grid' },
                                h('input', {
                                    class: 'vmt_input',
                                    type: 'number',
                                    value: talent.pointsInvested ?? 0,
                                    onchange: (e) => {
                                        const next = [...talents.trees];
                                        const treeCopy = { ...next[treeIndex] };
                                        const talentList = [...(treeCopy.talents || [])];
                                        talentList[talentIndex] = { ...talentList[talentIndex], pointsInvested: Number(e.target.value || 0) };
                                        treeCopy.talents = talentList;
                                        next[treeIndex] = treeCopy;
                                        updateField('talents.trees', next);
                                    }
                                }),
                                h('input', {
                                    class: 'vmt_input',
                                    type: 'number',
                                    value: talent.pointsMax ?? 1,
                                    onchange: (e) => {
                                        const next = [...talents.trees];
                                        const treeCopy = { ...next[treeIndex] };
                                        const talentList = [...(treeCopy.talents || [])];
                                        talentList[talentIndex] = { ...talentList[talentIndex], pointsMax: Number(e.target.value || 1) };
                                        treeCopy.talents = talentList;
                                        next[treeIndex] = treeCopy;
                                        updateField('talents.trees', next);
                                    }
                                })
                            ),
                            h('input', {
                                class: 'vmt_input',
                                type: 'text',
                                placeholder: 'Prerequisite',
                                value: talent.prerequisite || '',
                                onchange: (e) => {
                                    const next = [...talents.trees];
                                    const treeCopy = { ...next[treeIndex] };
                                    const talentList = [...(treeCopy.talents || [])];
                                    talentList[talentIndex] = { ...talentList[talentIndex], prerequisite: e.target.value };
                                    treeCopy.talents = talentList;
                                    next[treeIndex] = treeCopy;
                                    updateField('talents.trees', next);
                                }
                            }),
                            h('textarea', {
                                class: 'vmt_textarea',
                                rows: 2,
                                placeholder: 'Description',
                                onchange: (e) => {
                                    const next = [...talents.trees];
                                    const treeCopy = { ...next[treeIndex] };
                                    const talentList = [...(treeCopy.talents || [])];
                                    talentList[talentIndex] = { ...talentList[talentIndex], description: e.target.value };
                                    treeCopy.talents = talentList;
                                    next[treeIndex] = treeCopy;
                                    updateField('talents.trees', next);
                                }
                            }, talent.description || ''),
                            h('textarea', {
                                class: 'vmt_textarea',
                                rows: 2,
                                placeholder: 'Effects (one per line)',
                                onchange: (e) => {
                                    const next = [...talents.trees];
                                    const treeCopy = { ...next[treeIndex] };
                                    const talentList = [...(treeCopy.talents || [])];
                                    talentList[talentIndex] = {
                                        ...talentList[talentIndex],
                                        effects: e.target.value.split('\n').map(line => line.trim()).filter(Boolean)
                                    };
                                    treeCopy.talents = talentList;
                                    next[treeIndex] = treeCopy;
                                    updateField('talents.trees', next);
                                }
                            }, (talent.effects || []).join('\n')),
                            h('label', { class: 'vmt_checkbox' },
                                h('input', {
                                    type: 'checkbox',
                                    checked: talent.unlocked || false,
                                    onchange: (e) => {
                                        const next = [...talents.trees];
                                        const treeCopy = { ...next[treeIndex] };
                                        const talentList = [...(treeCopy.talents || [])];
                                        talentList[talentIndex] = { ...talentList[talentIndex], unlocked: e.target.checked };
                                        treeCopy.talents = talentList;
                                        next[treeIndex] = treeCopy;
                                        updateField('talents.trees', next);
                                    }
                                }),
                                h('span', {}, 'Unlocked')
                            ),
                            h('button', {
                                class: 'vmt_btn vmt_btn_danger vmt_btn_sm',
                                onclick: () => {
                                    const next = [...talents.trees];
                                    const treeCopy = { ...next[treeIndex] };
                                    const talentList = [...(treeCopy.talents || [])];
                                    talentList.splice(talentIndex, 1);
                                    treeCopy.talents = talentList;
                                    next[treeIndex] = treeCopy;
                                    updateField('talents.trees', next);
                                }
                            }, 'Remove Talent')
                        )
                    ),
                    h('button', {
                        class: 'vmt_btn vmt_btn_sm vmt_btn_secondary',
                        onclick: () => {
                            const next = [...talents.trees];
                            const treeCopy = { ...next[treeIndex] };
                            const talentList = [...(treeCopy.talents || []), {
                                id: generateId(),
                                name: '',
                                tier: 1,
                                pointsInvested: 0,
                                pointsMax: 1,
                                prerequisite: '',
                                description: '',
                                effects: [],
                                unlocked: false
                            }];
                            treeCopy.talents = talentList;
                            next[treeIndex] = treeCopy;
                            updateField('talents.trees', next);
                        }
                    }, '+ Add Talent')
                )
            )
        )
    );

    container.append(header, list);
    return container;
}
