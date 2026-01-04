/**
 * Valdris Master Tracker - Loadouts Tab
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

function snapshotLoadout(state) {
    return {
        id: generateId(),
        name: `Loadout ${state.loadouts?.length + 1 || 1}`,
        description: '',
        equipment: structuredClone(state.equipment || {}),
        activeSkills: (state.skills?.active || []).map(skill => skill.name).filter(Boolean),
        activeSpells: (state.spells || []).map(spell => spell.name).filter(Boolean),
        quickItems: (state.inventory || []).filter(item => item.category === 'Quick').map(item => item.name).filter(Boolean),
        notes: ''
    };
}

function applyLoadout(state, loadout) {
    const nextEquipment = structuredClone(loadout.equipment || {});
    updateField('equipment', nextEquipment);

    const existingActive = state.skills?.active || [];
    const nextActiveSkills = (loadout.activeSkills || []).map(name => {
        return existingActive.find(skill => skill.name === name) || {
            id: generateId(),
            name,
            description: '',
            cooldown: '',
            resourceCost: '',
            rank: '',
            damageEffect: '',
            category: ''
        };
    });
    updateField('skills.active', nextActiveSkills);
}

export function renderLoadoutsTab() {
    const state = getState();
    const loadouts = state.loadouts || [];
    const maxReached = loadouts.length >= 10;

    const container = h('div', { class: 'vmt_tab_content' });

    const header = h('div', { class: 'vmt_section_header' },
        h('div', { class: 'vmt_section_title' }, 'Loadouts'),
        h('button', {
            class: 'vmt_btn vmt_btn_sm',
            disabled: maxReached,
            onclick: () => {
                if (maxReached) return;
                const next = [...loadouts, snapshotLoadout(state)];
                updateField('loadouts', next);
            }
        }, 'Save Current Loadout')
    );

    const list = h('div', { class: 'vmt_card_list' },
        loadouts.length === 0 ? h('div', { class: 'vmt_empty' }, 'No loadouts saved yet.') : null,
        ...loadouts.map((loadout, index) =>
            h('div', { class: 'vmt_card vmt_loadout_card' },
                h('div', { class: 'vmt_card_header' },
                    h('input', {
                        class: 'vmt_input',
                        type: 'text',
                        value: loadout.name || '',
                        placeholder: 'Loadout name',
                        onchange: (e) => {
                            const next = [...loadouts];
                            next[index] = { ...next[index], name: e.target.value };
                            updateField('loadouts', next);
                        }
                    }),
                    h('button', {
                        class: 'vmt_btn vmt_btn_sm',
                        onclick: () => applyLoadout(state, loadout)
                    }, 'Load'),
                    h('button', {
                        class: 'vmt_btn_icon vmt_btn_danger',
                        onclick: () => {
                            const next = [...loadouts];
                            next.splice(index, 1);
                            updateField('loadouts', next);
                        },
                        title: 'Remove'
                    }, '')
                ),
                h('div', { class: 'vmt_field' },
                    h('label', { class: 'vmt_label' }, 'Description'),
                    h('input', {
                        class: 'vmt_input',
                        type: 'text',
                        value: loadout.description || '',
                        onchange: (e) => {
                            const next = [...loadouts];
                            next[index] = { ...next[index], description: e.target.value };
                            updateField('loadouts', next);
                        }
                    })
                ),
                h('div', { class: 'vmt_field_grid' },
                    h('div', { class: 'vmt_field' },
                        h('label', { class: 'vmt_label' }, 'Active Skills'),
                        h('textarea', {
                            class: 'vmt_textarea',
                            rows: 2,
                            onchange: (e) => {
                                const next = [...loadouts];
                                next[index] = {
                                    ...next[index],
                                    activeSkills: e.target.value.split('\n').map(line => line.trim()).filter(Boolean)
                                };
                                updateField('loadouts', next);
                            }
                        }, (loadout.activeSkills || []).join('\n'))
                    ),
                    h('div', { class: 'vmt_field' },
                        h('label', { class: 'vmt_label' }, 'Active Spells'),
                        h('textarea', {
                            class: 'vmt_textarea',
                            rows: 2,
                            onchange: (e) => {
                                const next = [...loadouts];
                                next[index] = {
                                    ...next[index],
                                    activeSpells: e.target.value.split('\n').map(line => line.trim()).filter(Boolean)
                                };
                                updateField('loadouts', next);
                            }
                        }, (loadout.activeSpells || []).join('\n'))
                    )
                ),
                h('div', { class: 'vmt_field_grid' },
                    h('div', { class: 'vmt_field' },
                        h('label', { class: 'vmt_label' }, 'Quick Items'),
                        h('textarea', {
                            class: 'vmt_textarea',
                            rows: 2,
                            onchange: (e) => {
                                const next = [...loadouts];
                                next[index] = {
                                    ...next[index],
                                    quickItems: e.target.value.split('\n').map(line => line.trim()).filter(Boolean)
                                };
                                updateField('loadouts', next);
                            }
                        }, (loadout.quickItems || []).join('\n'))
                    ),
                    h('div', { class: 'vmt_field' },
                        h('label', { class: 'vmt_label' }, 'Notes'),
                        h('textarea', {
                            class: 'vmt_textarea',
                            rows: 2,
                            onchange: (e) => {
                                const next = [...loadouts];
                                next[index] = { ...next[index], notes: e.target.value };
                                updateField('loadouts', next);
                            }
                        }, loadout.notes || '')
                    )
                )
            )
        )
    );

    container.append(header, list);
    return container;
}
