/**
 * Valdris Master Tracker - Karma Tab
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

function getKarmaLabel(value) {
    if (value <= -800) return 'Pure Evil';
    if (value <= -500) return 'Evil';
    if (value <= -200) return 'Dark';
    if (value < 200) return 'Neutral';
    if (value < 500) return 'Light';
    if (value < 800) return 'Good';
    return 'Saintly';
}

export function renderKarmaTab() {
    const state = getState();
    const karma = state.karma || { value: 0, history: [], factionKarma: [], currentEffects: [] };
    const value = Number(karma.value || 0);
    const percent = ((value + 1000) / 2000) * 100;

    const container = h('div', { class: 'vmt_tab_content' });

    const meter = h('div', { class: 'vmt_card vmt_karma_card' },
        h('div', { class: 'vmt_section_title' }, 'Karma Meter'),
        h('div', { class: 'vmt_karma_value' }, `${value} (${getKarmaLabel(value)})`),
        h('div', { class: 'vmt-karma-bar' },
            h('div', { class: 'vmt-karma-indicator', style: `left: ${percent}%` })
        ),
        h('input', {
            class: 'vmt_range',
            type: 'range',
            min: -1000,
            max: 1000,
            value,
            oninput: (e) => {
                updateField('karma.value', Number(e.target.value));
            }
        })
    );

    const historySection = h('div', { class: 'vmt_card' },
        h('div', { class: 'vmt_section_header' },
            h('div', { class: 'vmt_section_title' }, 'Karma History'),
            h('button', {
                class: 'vmt_btn vmt_btn_sm',
                onclick: () => {
                    const next = [...(karma.history || [])];
                    next.unshift({ action: '', change: 0, date: '', notes: '' });
                    updateField('karma.history', next);
                }
            }, '+ Add')
        ),
        h('div', { class: 'vmt_list' },
            (karma.history || []).length === 0 ? h('div', { class: 'vmt_empty' }, 'No karma events logged.') : null,
            ...(karma.history || []).map((event, index) =>
                h('div', { class: 'vmt_list_item' },
                    h('div', { class: 'vmt_field_grid' },
                        h('input', {
                            class: 'vmt_input',
                            type: 'text',
                            placeholder: 'Action',
                            value: event.action || '',
                            onchange: (e) => {
                                const next = [...karma.history];
                                next[index] = { ...next[index], action: e.target.value };
                                updateField('karma.history', next);
                            }
                        }),
                        h('input', {
                            class: 'vmt_input',
                            type: 'number',
                            placeholder: 'Change',
                            value: event.change ?? 0,
                            onchange: (e) => {
                                const next = [...karma.history];
                                next[index] = { ...next[index], change: Number(e.target.value || 0) };
                                updateField('karma.history', next);
                            }
                        }),
                        h('input', {
                            class: 'vmt_input',
                            type: 'date',
                            value: event.date || '',
                            onchange: (e) => {
                                const next = [...karma.history];
                                next[index] = { ...next[index], date: e.target.value };
                                updateField('karma.history', next);
                            }
                        })
                    ),
                    h('textarea', {
                        class: 'vmt_textarea',
                        rows: 2,
                        placeholder: 'Notes',
                        onchange: (e) => {
                            const next = [...karma.history];
                            next[index] = { ...next[index], notes: e.target.value };
                            updateField('karma.history', next);
                        }
                    }, event.notes || ''),
                    h('button', {
                        class: 'vmt_btn_icon vmt_btn_danger',
                        onclick: () => {
                            const next = [...karma.history];
                            next.splice(index, 1);
                            updateField('karma.history', next);
                        },
                        title: 'Remove'
                    }, '')
                )
            )
        )
    );

    const factionSection = h('div', { class: 'vmt_card' },
        h('div', { class: 'vmt_section_header' },
            h('div', { class: 'vmt_section_title' }, 'Faction Karma'),
            h('button', {
                class: 'vmt_btn vmt_btn_sm',
                onclick: () => {
                    const next = [...(karma.factionKarma || [])];
                    next.push({ faction: '', value: 0 });
                    updateField('karma.factionKarma', next);
                }
            }, '+ Add')
        ),
        h('div', { class: 'vmt_list' },
            (karma.factionKarma || []).length === 0 ? h('div', { class: 'vmt_empty' }, 'No faction karma entries.') : null,
            ...(karma.factionKarma || []).map((entry, index) =>
                h('div', { class: 'vmt_list_item' },
                    h('input', {
                        class: 'vmt_input',
                        type: 'text',
                        placeholder: 'Faction name',
                        value: entry.faction || '',
                        onchange: (e) => {
                            const next = [...karma.factionKarma];
                            next[index] = { ...next[index], faction: e.target.value };
                            updateField('karma.factionKarma', next);
                        }
                    }),
                    h('input', {
                        class: 'vmt_input',
                        type: 'number',
                        value: entry.value ?? 0,
                        onchange: (e) => {
                            const next = [...karma.factionKarma];
                            next[index] = { ...next[index], value: Number(e.target.value || 0) };
                            updateField('karma.factionKarma', next);
                        }
                    }),
                    h('button', {
                        class: 'vmt_btn_icon vmt_btn_danger',
                        onclick: () => {
                            const next = [...karma.factionKarma];
                            next.splice(index, 1);
                            updateField('karma.factionKarma', next);
                        },
                        title: 'Remove'
                    }, '')
                )
            )
        )
    );

    const consequences = h('div', { class: 'vmt_card' },
        h('div', { class: 'vmt_section_header' },
            h('div', { class: 'vmt_section_title' }, 'Consequences'),
            h('button', {
                class: 'vmt_btn vmt_btn_sm',
                onclick: () => {
                    const next = [...(karma.currentEffects || [])];
                    next.push('');
                    updateField('karma.currentEffects', next);
                }
            }, '+ Add')
        ),
        h('div', { class: 'vmt_list' },
            (karma.currentEffects || []).length === 0 ? h('div', { class: 'vmt_empty' }, 'No active karma effects.') : null,
            ...(karma.currentEffects || []).map((effect, index) =>
                h('div', { class: 'vmt_list_item' },
                    h('input', {
                        class: 'vmt_input',
                        type: 'text',
                        placeholder: 'Effect description',
                        value: effect || '',
                        onchange: (e) => {
                            const next = [...karma.currentEffects];
                            next[index] = e.target.value;
                            updateField('karma.currentEffects', next);
                        }
                    }),
                    h('button', {
                        class: 'vmt_btn_icon vmt_btn_danger',
                        onclick: () => {
                            const next = [...karma.currentEffects];
                            next.splice(index, 1);
                            updateField('karma.currentEffects', next);
                        },
                        title: 'Remove'
                    }, '')
                )
            )
        )
    );

    container.append(meter, historySection, factionSection, consequences);
    return container;
}
