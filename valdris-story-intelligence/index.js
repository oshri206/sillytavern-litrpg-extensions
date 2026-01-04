import { StateManager } from './state-manager.js';
import { EntityDetector } from './entity-detector.js';
import { EntityDatabase } from './entity-database.js';
import { ENTITY_TYPES, formatDate, generateUUID, truncateText } from './utils.js';

window.ValdrisStoryIntel = null;

jQuery(async () => {
    const stateManager = new StateManager();
    const entityDatabase = new EntityDatabase(stateManager);
    const entityDetector = new EntityDetector(stateManager, entityDatabase);

    await stateManager.initialize();

    window.ValdrisStoryIntel = {
        state: stateManager,
        database: entityDatabase,
        detector: entityDetector,
        detect: (text) => entityDetector.detectEntities(text),
        search: (query) => entityDatabase.searchEntities(query),
        addEntity: (type, data) => entityDatabase.addEntity(type, data),
        getEntity: (type, id) => entityDatabase.getEntity(type, id)
    };

    injectUI();
    setupEventHooks();
    updateUI();

    console.log('[Valdris Story Intelligence] Loaded successfully');
});

function setupEventHooks() {
    const context = SillyTavern?.getContext?.();
    const eventSource = window.eventSource || context?.eventSource;

    if (!eventSource) {
        console.warn('[VSI] Unable to register event hooks.');
        return;
    }

    eventSource.on('message_received', async (data) => {
        const settings = window.ValdrisStoryIntel.state.getSection('detection');
        if (!settings.enabled || !settings.autoDetect) return;

        const messageText = data.message || '';
        const detected = await window.ValdrisStoryIntel.detector.detectEntities(
            messageText,
            data.messageId
        );

        handleDetectedEntities(detected);
    });

    eventSource.on('chat_changed', async () => {
        const characterId = SillyTavern.getContext().characterId;
        await window.ValdrisStoryIntel.state.initialize(characterId);
        updateUI();
    });
}

function handleDetectedEntities(detected) {
    const detectionSettings = window.ValdrisStoryIntel.state.getSection('detection');
    const database = window.ValdrisStoryIntel.database;
    const newEntities = [];

    Object.entries(detected).forEach(([type, entities]) => {
        entities.forEach((entity) => {
            if (!database.isKnownEntity(type, entity.name)) {
                newEntities.push({ type, ...entity });
            }
        });
    });

    if (newEntities.length === 0) return;

    if (detectionSettings.confirmNewEntities) {
        addToPendingQueue(newEntities);
        showPendingNotification(newEntities.length);
    } else {
        newEntities.forEach((entity) => {
            const created = database.addEntity(entity.type, entity);
            if (window.ValdrisStoryIntel.state.getSection('lorebook').autoCreate) {
                createLorebookEntry(created);
            }
        });
        updateUI();
        showAddedNotification(newEntities.length);
    }
}

function injectUI() {
    const panelHTML = `
        <div id="vsi-panel" class="vsi-panel">
            <div class="vsi-header">
                <span class="vsi-title">📚 Story Intelligence</span>
                <div class="vsi-header-buttons">
                    <button class="vsi-btn-icon" id="vsi-toggle-detection" title="Toggle Detection">
                        <span class="detection-status on">●</span>
                    </button>
                    <button class="vsi-btn-icon" id="vsi-settings-btn" title="Settings">⚙️</button>
                    <button class="vsi-btn-icon" id="vsi-collapse-btn">−</button>
                </div>
            </div>
            <div class="vsi-content">
                <div class="vsi-stats">
                    ${renderStatItem('npc')}
                    ${renderStatItem('location')}
                    ${renderStatItem('item')}
                    ${renderStatItem('faction')}
                    ${renderStatItem('quest')}
                </div>
                <div class="vsi-pending-alert" id="vsi-pending-alert" style="display: none;">
                    <span class="pending-icon">🔔</span>
                    <span class="pending-text"><span id="vsi-pending-count">0</span> new entities detected</span>
                    <button class="vsi-btn-small" id="vsi-review-pending">Review</button>
                </div>
                <div class="vsi-tabs">
                    <button class="vsi-tab active" data-tab="entities">📋 Entities</button>
                    <button class="vsi-tab" data-tab="recent">🕐 Recent</button>
                    <button class="vsi-tab" data-tab="search">🔍 Search</button>
                </div>
                <div class="vsi-tab-content">
                    <div class="vsi-tab-panel active" id="vsi-entities-panel">
                        <div class="vsi-entity-filters">
                            <button class="vsi-filter active" data-filter="all">All</button>
                            <button class="vsi-filter" data-filter="npc">👤</button>
                            <button class="vsi-filter" data-filter="location">📍</button>
                            <button class="vsi-filter" data-filter="item">⚔️</button>
                            <button class="vsi-filter" data-filter="faction">🏰</button>
                            <button class="vsi-filter" data-filter="quest">📜</button>
                        </div>
                        <div class="vsi-entity-list" id="vsi-entity-list"></div>
                    </div>
                    <div class="vsi-tab-panel" id="vsi-recent-panel">
                        <div class="vsi-recent-list" id="vsi-recent-list"></div>
                    </div>
                    <div class="vsi-tab-panel" id="vsi-search-panel">
                        <input type="text" class="vsi-search-input" id="vsi-search-input" placeholder="Search entities...">
                        <div class="vsi-search-results" id="vsi-search-results"></div>
                    </div>
                </div>
                <div class="vsi-actions">
                    <button class="vsi-btn" id="vsi-add-entity">➕ Add Entity</button>
                    <button class="vsi-btn" id="vsi-scan-chat">🔍 Scan Chat</button>
                    <button class="vsi-btn" id="vsi-export">📤 Export</button>
                </div>
            </div>
        </div>
    `;

    const modalHTML = `
        <div class="vsi-modal" id="vsi-pending-modal">
            <div class="vsi-modal-content">
                <div class="vsi-modal-header">
                    <h3>🔔 New Entities Detected</h3>
                    <button class="vsi-modal-close">×</button>
                </div>
                <div class="vsi-modal-body">
                    <p class="vsi-help-text">The following entities were detected in the chat. Select which ones to add:</p>
                    <div class="vsi-pending-list" id="vsi-pending-list"></div>
                </div>
                <div class="vsi-modal-footer">
                    <button class="vsi-btn" id="vsi-add-selected">Add Selected</button>
                    <button class="vsi-btn secondary" id="vsi-skip-all">Skip All</button>
                    <button class="vsi-btn secondary" id="vsi-add-all">Add All</button>
                </div>
            </div>
        </div>
        <div class="vsi-modal" id="vsi-edit-modal">
            <div class="vsi-modal-content large">
                <div class="vsi-modal-header">
                    <h3><span id="vsi-edit-icon">👤</span> Edit Entity</h3>
                    <button class="vsi-modal-close">×</button>
                </div>
                <div class="vsi-modal-body">
                    <div class="vsi-form">
                        <div class="vsi-form-row">
                            <label>Name</label>
                            <input type="text" id="vsi-edit-name">
                        </div>
                        <div class="vsi-form-row">
                            <label>Type</label>
                            <select id="vsi-edit-type">
                                <option value="npc">NPC</option>
                                <option value="location">Location</option>
                                <option value="item">Item</option>
                                <option value="faction">Faction</option>
                                <option value="quest">Quest</option>
                            </select>
                        </div>
                        <div id="vsi-dynamic-fields"></div>
                        <div class="vsi-form-row">
                            <label>Notes</label>
                            <textarea id="vsi-edit-notes" rows="3"></textarea>
                        </div>
                    </div>
                </div>
                <div class="vsi-modal-footer">
                    <button class="vsi-btn" id="vsi-save-entity">Save</button>
                    <button class="vsi-btn secondary" id="vsi-cancel-edit">Cancel</button>
                    <button class="vsi-btn danger" id="vsi-delete-entity">Delete</button>
                </div>
            </div>
        </div>
    `;

    $('#extensions_settings').append(panelHTML);
    $('body').append(modalHTML);

    setupUIEvents();
}

function renderStatItem(type) {
    const config = ENTITY_TYPES[type];
    return `
        <div class="stat-item" data-type="${type}">
            <span class="stat-icon">${config.icon}</span>
            <span class="stat-count" id="vsi-${type}-count">0</span>
            <span class="stat-label">${config.name}${type === 'npc' ? 's' : 's'}</span>
        </div>
    `;
}

function setupUIEvents() {
    $('#vsi-toggle-detection').on('click', () => {
        const detection = window.ValdrisStoryIntel.state.getSection('detection');
        detection.enabled = !detection.enabled;
        window.ValdrisStoryIntel.state.setSection('detection', detection);
        updateDetectionStatus();
        showToast(`Detection ${detection.enabled ? 'enabled' : 'disabled'}.`, 'info');
    });

    $('#vsi-collapse-btn').on('click', () => {
        $('#vsi-panel .vsi-content').toggle();
    });

    $('#vsi-review-pending').on('click', () => {
        openPendingModal();
    });

    $('#vsi-add-entity').on('click', () => {
        openEditModal({ type: 'npc', name: '' });
    });

    $('#vsi-scan-chat').on('click', async () => {
        const context = SillyTavern?.getContext?.();
        const messages = context?.chat || [];
        const combined = messages.map((msg) => msg.mes || msg.message || '').join('\n');
        const detected = await window.ValdrisStoryIntel.detector.detectEntities(combined);
        handleDetectedEntities(detected);
    });

    $('#vsi-export').on('click', () => {
        const data = window.ValdrisStoryIntel.database.exportEntities();
        navigator.clipboard.writeText(data).then(() => {
            showToast('Entities copied to clipboard.', 'success');
        });
    });

    $('#vsi-search-input').on('input', (event) => {
        const value = event.target.value;
        renderSearchResults(value);
    });

    $(document).on('click', '.vsi-tab', (event) => {
        const tab = $(event.currentTarget).data('tab');
        $('.vsi-tab').removeClass('active');
        $(event.currentTarget).addClass('active');
        $('.vsi-tab-panel').removeClass('active');
        $(`#vsi-${tab}-panel`).addClass('active');
    });

    $(document).on('click', '.vsi-filter', (event) => {
        const filter = $(event.currentTarget).data('filter');
        $('.vsi-filter').removeClass('active');
        $(event.currentTarget).addClass('active');
        renderEntityList(filter);
    });

    $(document).on('click', '.vsi-entity-item', (event) => {
        const id = $(event.currentTarget).data('id');
        const type = $(event.currentTarget).data('type');
        const entity = window.ValdrisStoryIntel.database.getEntity(type, id);
        if (entity) {
            openEditModal(entity);
        }
    });

    $(document).on('click', '#vsi-pending-modal .vsi-modal-close, #vsi-skip-all', () => {
        closeModal('#vsi-pending-modal');
    });

    $('#vsi-add-selected').on('click', () => {
        const selected = [];
        $('#vsi-pending-list input:checked').each((_, input) => {
            const id = $(input).data('id');
            const entity = window.ValdrisStoryIntel.state
                .getSection('pendingEntities')
                .find((item) => item.id === id);
            if (entity) selected.push(entity);
        });
        addPendingEntities(selected);
        closeModal('#vsi-pending-modal');
    });

    $('#vsi-add-all').on('click', () => {
        const pending = window.ValdrisStoryIntel.state.getSection('pendingEntities');
        addPendingEntities(pending);
        closeModal('#vsi-pending-modal');
    });

    $(document).on('click', '#vsi-edit-modal .vsi-modal-close, #vsi-cancel-edit', () => {
        closeModal('#vsi-edit-modal');
    });

    $('#vsi-save-entity').on('click', () => {
        saveEntityFromModal();
    });

    $('#vsi-delete-entity').on('click', () => {
        const modal = $('#vsi-edit-modal');
        const entityId = modal.data('entityId');
        const entityType = modal.data('entityType');
        if (entityId && entityType) {
            window.ValdrisStoryIntel.database.deleteEntity(entityType, entityId);
            updateUI();
        }
        closeModal('#vsi-edit-modal');
    });

    $('#vsi-edit-type').on('change', (event) => {
        renderDynamicFields(event.target.value);
    });
}

function updateUI() {
    updateDetectionStatus();
    updateStats();
    renderEntityList();
    renderRecentList();
    updatePendingAlert();
}

function updateDetectionStatus() {
    const detection = window.ValdrisStoryIntel.state.getSection('detection');
    const status = $('#vsi-toggle-detection .detection-status');
    status.toggleClass('on', detection.enabled);
    status.toggleClass('off', !detection.enabled);
}

function updateStats() {
    const stats = window.ValdrisStoryIntel.database.getStats();
    $('#vsi-npc-count').text(stats.npcs);
    $('#vsi-location-count').text(stats.locations);
    $('#vsi-item-count').text(stats.items);
    $('#vsi-faction-count').text(stats.factions);
    $('#vsi-quest-count').text(stats.quests);
}

function renderEntityList(filter = 'all') {
    const list = $('#vsi-entity-list');
    list.empty();
    const types = filter === 'all' ? null : [filter];
    const entities = window.ValdrisStoryIntel.database.getAllEntities(types ? types[0] : null);
    if (entities.length === 0) {
        list.append('<div class="vsi-empty">No entities yet.</div>');
        return;
    }

    entities.forEach((entity) => {
        const config = ENTITY_TYPES[entity.type] || ENTITY_TYPES[filter];
        const dateLabel = formatDate(entity.createdAt);
        list.append(`
            <div class="vsi-entity-item" data-id="${entity.id}" data-type="${entity.type}">
                <span class="entity-icon">${config?.icon || '📌'}</span>
                <div class="entity-info">
                    <span class="entity-name">${entity.name}</span>
                    <span class="entity-meta">${config?.name || entity.type} • Added ${dateLabel}</span>
                </div>
                <div class="entity-actions">
                    <button class="vsi-btn-icon" title="Edit">✏️</button>
                    <button class="vsi-btn-icon" title="Delete">🗑️</button>
                </div>
            </div>
        `);
    });
}

function renderRecentList() {
    const list = $('#vsi-recent-list');
    list.empty();
    const recent = window.ValdrisStoryIntel.database.getRecentEntities(10);
    if (recent.length === 0) {
        list.append('<div class="vsi-empty">No recent entities.</div>');
        return;
    }
    recent.forEach((entity) => {
        const config = ENTITY_TYPES[entity.type];
        list.append(`
            <div class="vsi-entity-item" data-id="${entity.id}" data-type="${entity.type}">
                <span class="entity-icon">${config?.icon || '📌'}</span>
                <div class="entity-info">
                    <span class="entity-name">${entity.name}</span>
                    <span class="entity-meta">${config?.name || entity.type} • Updated ${formatDate(entity.updatedAt)}</span>
                </div>
            </div>
        `);
    });
}

function renderSearchResults(query) {
    const results = $('#vsi-search-results');
    results.empty();
    if (!query) return;
    const matches = window.ValdrisStoryIntel.database.searchEntities(query);
    if (matches.length === 0) {
        results.append('<div class="vsi-empty">No matches.</div>');
        return;
    }
    matches.forEach((entity) => {
        const config = ENTITY_TYPES[entity.type];
        results.append(`
            <div class="vsi-entity-item" data-id="${entity.id}" data-type="${entity.type}">
                <span class="entity-icon">${config?.icon || '📌'}</span>
                <div class="entity-info">
                    <span class="entity-name">${entity.name}</span>
                    <span class="entity-meta">${config?.name || entity.type}</span>
                </div>
            </div>
        `);
    });
}

function addToPendingQueue(entities) {
    const state = window.ValdrisStoryIntel.state;
    const pending = state.getSection('pendingEntities');
    const max = state.getSection('settings').maxPendingEntities;
    const withIds = entities.map((entity) => ({ id: generateUUID(), ...entity }));
    const next = [...pending, ...withIds].slice(-max);
    state.setSection('pendingEntities', next);
    updatePendingAlert();
}

function updatePendingAlert() {
    const pending = window.ValdrisStoryIntel.state.getSection('pendingEntities');
    const alert = $('#vsi-pending-alert');
    if (pending.length > 0) {
        $('#vsi-pending-count').text(pending.length);
        alert.show();
    } else {
        alert.hide();
    }
}

function openPendingModal() {
    const list = $('#vsi-pending-list');
    list.empty();
    const pending = window.ValdrisStoryIntel.state.getSection('pendingEntities');
    pending.forEach((entity) => {
        const config = ENTITY_TYPES[entity.type];
        const confidenceLabel = entity.confidence >= 0.7 ? 'High' : entity.confidence >= 0.5 ? 'Medium' : 'Low';
        const confidenceClass =
            entity.confidence >= 0.7 ? '' : entity.confidence >= 0.5 ? 'medium' : 'low';
        list.append(`
            <div class="vsi-pending-item">
                <input type="checkbox" checked data-id="${entity.id}">
                <span class="pending-icon">${config?.icon || '📌'}</span>
                <span class="pending-name">${entity.name}</span>
                <span class="pending-context">${truncateText(entity.context, 60)}</span>
                <span class="pending-confidence ${confidenceClass}">${confidenceLabel}</span>
            </div>
        `);
    });
    openModal('#vsi-pending-modal');
}

function addPendingEntities(selected) {
    if (!selected || selected.length === 0) return;
    const database = window.ValdrisStoryIntel.database;
    selected.forEach((entity) => {
        const created = database.addEntity(entity.type, entity);
        if (window.ValdrisStoryIntel.state.getSection('lorebook').autoCreate) {
            createLorebookEntry(created);
        }
    });
    window.ValdrisStoryIntel.state.setSection('pendingEntities', []);
    updateUI();
    showAddedNotification(selected.length);
}

function showPendingNotification(count) {
    if (!window.ValdrisStoryIntel.state.getSection('settings').showNotifications) return;
    showToast(`${count} new entit${count === 1 ? 'y' : 'ies'} detected.`, 'info');
}

function showAddedNotification(count) {
    if (!window.ValdrisStoryIntel.state.getSection('settings').showNotifications) return;
    showToast(`${count} entit${count === 1 ? 'y' : 'ies'} added to database.`, 'success');
}

function openEditModal(entity) {
    const modal = $('#vsi-edit-modal');
    modal.data('entityId', entity.id || null);
    modal.data('entityType', entity.type || 'npc');
    $('#vsi-edit-name').val(entity.name || '');
    $('#vsi-edit-type').val(entity.type || 'npc');
    $('#vsi-edit-notes').val(entity.notes || '');
    $('#vsi-edit-icon').text(ENTITY_TYPES[entity.type || 'npc'].icon);
    renderDynamicFields(entity.type || 'npc', entity);
    openModal('#vsi-edit-modal');
}

function renderDynamicFields(type, entity = {}) {
    const container = $('#vsi-dynamic-fields');
    container.empty();
    const fields = ENTITY_TYPES[type]?.fields || [];
    fields
        .filter((field) => field !== 'name' && field !== 'notes')
        .forEach((field) => {
            const label = field.replace(/_/g, ' ');
            container.append(`
                <div class="vsi-form-row">
                    <label>${label}</label>
                    <input type="text" data-field="${field}" value="${entity[field] || ''}">
                </div>
            `);
        });
}

function saveEntityFromModal() {
    const modal = $('#vsi-edit-modal');
    const id = modal.data('entityId');
    const type = $('#vsi-edit-type').val();
    const name = $('#vsi-edit-name').val();
    const notes = $('#vsi-edit-notes').val();
    const fields = {};
    $('#vsi-dynamic-fields input').each((_, input) => {
        const field = $(input).data('field');
        fields[field] = $(input).val();
    });

    if (!name) {
        showToast('Name is required.', 'error');
        return;
    }

    if (id) {
        window.ValdrisStoryIntel.database.updateEntity(type, id, {
            name,
            notes,
            ...fields
        });
    } else {
        window.ValdrisStoryIntel.database.addEntity(type, {
            name,
            notes,
            ...fields
        });
    }

    updateUI();
    closeModal('#vsi-edit-modal');
}

function createLorebookEntry(entity) {
    const lorebook = window.ValdrisStoryIntel.state.getSection('lorebook');
    if (!lorebook.enabled) return;
    const createdEntries = lorebook.createdEntries || [];
    createdEntries.push({ id: entity.id, name: entity.name, type: entity.type });
    lorebook.createdEntries = createdEntries;
    window.ValdrisStoryIntel.state.setSection('lorebook', lorebook);
}

function showToast(message, variant = 'info') {
    const toast = $(`<div class="vsi-toast ${variant}">${message}</div>`);
    $('body').append(toast);
    requestAnimationFrame(() => {
        toast.addClass('show');
    });
    setTimeout(() => {
        toast.removeClass('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function openModal(selector) {
    $(selector).addClass('active');
}

function closeModal(selector) {
    $(selector).removeClass('active');
}
