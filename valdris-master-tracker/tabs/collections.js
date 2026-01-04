/**
 * Valdris Master Tracker - Collections Tab
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

const CATEGORY_MAP = {
    monsters: 'Monster Codex',
    recipes: 'Recipe Book',
    locations: 'Map Discoveries',
    rareItems: 'Rare Items Found',
    achievements: 'Achievements Gallery'
};

function getCollections(state) {
    const collections = state.collections || {};
    return Object.entries(CATEGORY_MAP).flatMap(([key, label]) =>
        (collections[key] || []).map(entry => ({ ...entry, _categoryKey: key, categoryLabel: label }))
    );
}

function updateCollection(state, updatedCollection) {
    const collections = { ...(state.collections || {}) };
    const key = updatedCollection._categoryKey;
    if (!collections[key]) collections[key] = [];
    const index = collections[key].findIndex(item => item.id === updatedCollection.id);
    if (index >= 0) {
        const next = [...collections[key]];
        const { _categoryKey, categoryLabel, ...clean } = updatedCollection;
        next[index] = clean;
        collections[key] = next;
    }
    updateField('collections', collections);
}

function removeCollection(state, collection) {
    const collections = { ...(state.collections || {}) };
    const key = collection._categoryKey;
    const list = [...(collections[key] || [])];
    const index = list.findIndex(item => item.id === collection.id);
    if (index >= 0) {
        list.splice(index, 1);
        collections[key] = list;
        updateField('collections', collections);
    }
}

export function renderCollectionsTab() {
    const state = getState();
    const collections = getCollections(state);
    let filterValue = 'all';
    let searchValue = '';

    const container = h('div', { class: 'vmt_tab_content' });

    const controls = h('div', { class: 'vmt_section_header' },
        h('div', { class: 'vmt_section_title' }, 'Collections'),
        h('div', { class: 'vmt_inline_controls' },
            h('select', {
                class: 'vmt_select',
                onchange: (e) => {
                    filterValue = e.target.value;
                    renderList();
                }
            },
            h('option', { value: 'all' }, 'All Categories'),
            ...Object.entries(CATEGORY_MAP).map(([key, label]) =>
                h('option', { value: key }, label)
            )),
            h('input', {
                class: 'vmt_input',
                type: 'search',
                placeholder: 'Search collections...',
                oninput: (e) => {
                    searchValue = e.target.value.toLowerCase();
                    renderList();
                }
            }),
            h('button', {
                class: 'vmt_btn vmt_btn_sm',
                onclick: () => {
                    const newCollection = {
                        id: generateId(),
                        name: 'New Collection',
                        category: 'Custom',
                        items: [],
                        rewards: ''
                    };
                    const key = filterValue === 'all' ? 'monsters' : filterValue;
                    const next = { ...(state.collections || {}) };
                    next[key] = [...(next[key] || []), newCollection];
                    updateField('collections', next);
                }
            }, '+ Add')
        )
    );

    const listContainer = h('div', { class: 'vmt_card_list' });

    function renderList() {
        listContainer.innerHTML = '';
        const filtered = collections.filter(collection => {
            const matchesCategory = filterValue === 'all' || collection._categoryKey === filterValue;
            const matchesSearch = !searchValue || collection.name.toLowerCase().includes(searchValue);
            return matchesCategory && matchesSearch;
        });

        if (filtered.length === 0) {
            listContainer.appendChild(h('div', { class: 'vmt_empty' }, 'No collections match your filters.'));
            return;
        }

        filtered.forEach(collection => {
            const total = collection.items?.length || 0;
            const found = (collection.items || []).filter(item => item.found).length;
            const percent = total > 0 ? Math.round((found / total) * 100) : 0;

            const card = h('div', { class: 'vmt_card vmt_collection_card' },
                h('div', { class: 'vmt_card_header' },
                    h('input', {
                        class: 'vmt_input',
                        type: 'text',
                        value: collection.name || '',
                        onchange: (e) => {
                            updateCollection(state, { ...collection, name: e.target.value });
                        }
                    }),
                    h('span', { class: 'vmt_badge' }, collection.categoryLabel),
                    h('button', {
                        class: 'vmt_btn_icon vmt_btn_danger',
                        onclick: () => removeCollection(state, collection),
                        title: 'Remove'
                    }, '')
                ),
                h('div', { class: 'vmt_collection_meta' },
                    h('span', { class: 'vmt_text_muted' }, `${found}/${total} found`),
                    h('span', { class: 'vmt_text_accent' }, `${percent}% complete`)
                ),
                h('div', { class: 'vmt_field' },
                    h('label', { class: 'vmt_label' }, 'Rewards'),
                    h('input', {
                        class: 'vmt_input',
                        type: 'text',
                        value: collection.rewards || '',
                        onchange: (e) => {
                            updateCollection(state, { ...collection, rewards: e.target.value });
                        }
                    })
                ),
                h('div', { class: 'vmt_collection_grid' },
                    ...(collection.items || []).map((item, index) =>
                        h('div', { class: `vmt_collection_item ${item.found ? 'found' : 'unfound'}` },
                            h('input', {
                                class: 'vmt_input vmt_input_sm',
                                type: 'text',
                                value: item.name || '',
                                onchange: (e) => {
                                    const items = [...(collection.items || [])];
                                    items[index] = { ...items[index], name: e.target.value };
                                    updateCollection(state, { ...collection, items });
                                }
                            }),
                            h('textarea', {
                                class: 'vmt_textarea vmt_textarea_sm',
                                rows: 2,
                                placeholder: 'Notes',
                                onchange: (e) => {
                                    const items = [...(collection.items || [])];
                                    items[index] = { ...items[index], notes: e.target.value };
                                    updateCollection(state, { ...collection, items });
                                }
                            }, item.notes || ''),
                            h('label', { class: 'vmt_checkbox' },
                                h('input', {
                                    type: 'checkbox',
                                    checked: item.found || false,
                                    onchange: (e) => {
                                        const items = [...(collection.items || [])];
                                        items[index] = { ...items[index], found: e.target.checked };
                                        updateCollection(state, { ...collection, items });
                                    }
                                }),
                                h('span', {}, 'Found')
                            ),
                            h('button', {
                                class: 'vmt_btn_icon vmt_btn_danger',
                                onclick: () => {
                                    const items = [...(collection.items || [])];
                                    items.splice(index, 1);
                                    updateCollection(state, { ...collection, items });
                                },
                                title: 'Remove'
                            }, '')
                        )
                    ),
                    h('button', {
                        class: 'vmt_btn vmt_btn_sm vmt_btn_secondary',
                        onclick: () => {
                            const items = [...(collection.items || []), { name: '', found: false, notes: '' }];
                            updateCollection(state, { ...collection, items });
                        }
                    }, '+ Add Item')
                )
            );

            listContainer.appendChild(card);
        });
    }

    renderList();

    container.append(controls, listContainer);
    return container;
}
