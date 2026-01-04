import { StateManager } from './state-manager.js';
import { EntityDetector } from './entity-detector.js';
import { EntityDatabase } from './entity-database.js';
import { LorebookManager } from './lorebook-manager.js';
import { ENTITY_TYPES, formatDate, generateUUID, truncateText } from './utils.js';

window.ValdrisStoryIntel = null;

jQuery(async () => {
    const stateManager = new StateManager();
    const entityDatabase = new EntityDatabase(stateManager);
    const entityDetector = new EntityDetector(stateManager, entityDatabase);
    const lorebookManager = new LorebookManager(stateManager, entityDatabase);

    await stateManager.initialize();

    window.ValdrisStoryIntel = {
        state: stateManager,
        database: entityDatabase,
        detector: entityDetector,
        lorebook: lorebookManager,
        detect: (text) => entityDetector.detectEntities(text),
        search: (query) => entityDatabase.searchEntities(query),
        addEntity: (type, data) => entityDatabase.addEntity(type, data),
        getEntity: (type, id) => entityDatabase.getEntity(type, id)
    };

    registerLorebookHooks(entityDatabase, lorebookManager, stateManager);

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
        $('#vsi-target-lorebook').data('loaded', false);
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
            database.addEntity(entity.type, { ...entity, confirmed: true });
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
                    <button class="vsi-tab" data-tab="settings">⚙️ Settings</button>
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
                    <div class="vsi-tab-panel" id="vsi-settings-panel">
                        <div class="vsi-settings-section">
                            <h4>📖 Lorebook Integration</h4>
                            <div class="setting-item">
                                <input type="checkbox" id="vsi-lorebook-enabled" checked>
                                <label for="vsi-lorebook-enabled">Enable lorebook integration</label>
                            </div>
                            <div class="setting-item">
                                <input type="checkbox" id="vsi-lorebook-autocreate" checked>
                                <label for="vsi-lorebook-autocreate">Auto-create entries for new entities</label>
                            </div>
                            <div class="setting-item">
                                <input type="checkbox" id="vsi-lorebook-autoupdate" checked>
                                <label for="vsi-lorebook-autoupdate">Auto-update entries when entities change</label>
                            </div>
                            <div class="setting-item warning">
                                <input type="checkbox" id="vsi-lorebook-autodelete">
                                <label for="vsi-lorebook-autodelete">Auto-delete entries when entities removed</label>
                                <span class="setting-warning">⚠️ Dangerous</span>
                            </div>
                            <div class="setting-divider"></div>
                            <div class="setting-item">
                                <label>Target Lorebook:</label>
                                <select id="vsi-target-lorebook">
                                    <option value="">Character's Lorebook (default)</option>
                                </select>
                            </div>
                            <div class="setting-item">
                                <label>Entry Prefix:</label>
                                <input type="text" id="vsi-entry-prefix" value="[VSI] " placeholder="e.g., [VSI] ">
                            </div>
                            <div class="setting-item">
                                <input type="checkbox" id="vsi-add-category-tag" checked>
                                <label for="vsi-add-category-tag">Add category tag to entry names</label>
                            </div>
                            <div class="setting-divider"></div>
                            <div class="vsi-lorebook-stats">
                                <div class="stat-row">
                                    <span>Entries Created:</span>
                                    <span id="vsi-entries-created-count">0</span>
                                </div>
                                <div class="stat-row">
                                    <span>Last Sync:</span>
                                    <span id="vsi-last-sync">Never</span>
                                </div>
                            </div>
                            <div class="vsi-lorebook-actions">
                                <button class="vsi-btn" id="vsi-sync-lorebook">🔄 Sync All</button>
                                <button class="vsi-btn" id="vsi-create-missing">➕ Create Missing</button>
                                <button class="vsi-btn secondary" id="vsi-cleanup-orphaned">🧹 Cleanup</button>
                            </div>
                        </div>
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
        <div class="vsi-modal" id="vsi-lorebook-preview-modal">
            <div class="vsi-modal-content">
                <div class="vsi-modal-header">
                    <h3>📖 Lorebook Entry Preview</h3>
                    <button class="vsi-modal-close">×</button>
                </div>
                <div class="vsi-modal-body">
                    <div class="vsi-preview-section">
                        <label>Entry Name:</label>
                        <div class="preview-value" id="vsi-preview-name"></div>
                    </div>
                    <div class="vsi-preview-section">
                        <label>Keywords:</label>
                        <div class="preview-keywords" id="vsi-preview-keywords"></div>
                    </div>
                    <div class="vsi-preview-section">
                        <label>Content:</label>
                        <div class="preview-content" id="vsi-preview-content"><pre></pre></div>
                    </div>
                </div>
                <div class="vsi-modal-footer">
                    <button class="vsi-btn" id="vsi-create-entry-btn">Create Entry</button>
                    <button class="vsi-btn secondary" id="vsi-cancel-preview">Cancel</button>
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

    $('#vsi-lorebook-enabled').on('change', (event) => {
        updateLorebookSetting('enabled', event.target.checked);
    });

    $('#vsi-lorebook-autocreate').on('change', (event) => {
        updateLorebookSetting('autoCreate', event.target.checked);
    });

    $('#vsi-lorebook-autoupdate').on('change', (event) => {
        updateLorebookSetting('autoUpdate', event.target.checked);
    });

    $('#vsi-lorebook-autodelete').on('change', (event) => {
        updateLorebookSetting('autoDelete', event.target.checked);
    });

    $('#vsi-target-lorebook').on('change', (event) => {
        const value = event.target.value || null;
        updateLorebookSetting('targetLorebook', value);
        updateLorebookSetting('useCharacterLorebook', !value);
    });

    $('#vsi-entry-prefix').on('input', (event) => {
        updateLorebookSetting('entryPrefix', event.target.value);
    });

    $('#vsi-add-category-tag').on('change', (event) => {
        updateLorebookSetting('addCategoryTag', event.target.checked);
    });

    $('#vsi-sync-lorebook').on('click', async () => {
        showToast('🔄 Syncing lorebook entries...', 'info');
        await window.ValdrisStoryIntel.lorebook.syncAllEntries();
        showToast('✅ Sync complete!', 'success');
        updateUI();
    });

    $('#vsi-create-missing').on('click', async () => {
        const created = await window.ValdrisStoryIntel.lorebook.createEntriesForAllEntities();
        showToast(`✅ Created ${created} lorebook entries`, 'success');
        updateUI();
    });

    $('#vsi-cleanup-orphaned').on('click', async () => {
        const removed = await window.ValdrisStoryIntel.lorebook.cleanupOrphanedEntries();
        showToast(`🧹 Removed ${removed} orphaned entries`, 'success');
        updateUI();
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
        if ($(event.target).closest('.entity-actions').length > 0) {
            return;
        }
        const id = $(event.currentTarget).data('id');
        const type = $(event.currentTarget).data('type');
        const entity = window.ValdrisStoryIntel.database.getEntity(type, id);
        if (entity) {
            openEditModal(entity);
        }
    });

    $(document).on('click', '.entity-actions [data-action="edit"]', (event) => {
        event.stopPropagation();
        const item = $(event.currentTarget).closest('.vsi-entity-item');
        const entity = window.ValdrisStoryIntel.database.getEntity(item.data('type'), item.data('id'));
        if (entity) openEditModal(entity);
    });

    $(document).on('click', '.entity-actions [data-action="lorebook"]', (event) => {
        event.stopPropagation();
        const item = $(event.currentTarget).closest('.vsi-entity-item');
        const entity = window.ValdrisStoryIntel.database.getEntity(item.data('type'), item.data('id'));
        if (entity) openLorebookPreview(entity);
    });

    $(document).on('click', '.entity-actions [data-action="delete"]', (event) => {
        event.stopPropagation();
        const item = $(event.currentTarget).closest('.vsi-entity-item');
        const entityType = item.data('type');
        const entityId = item.data('id');
        if (entityId && entityType) {
            window.ValdrisStoryIntel.database.deleteEntity(entityType, entityId);
            updateUI();
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

    $(document).on('click', '#vsi-lorebook-preview-modal .vsi-modal-close, #vsi-cancel-preview', () => {
        closeModal('#vsi-lorebook-preview-modal');
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

    $('#vsi-create-entry-btn').on('click', async () => {
        const modal = $('#vsi-lorebook-preview-modal');
        const entityId = modal.data('entityId');
        const entity = window.ValdrisStoryIntel.database.getEntityById(entityId);
        if (entity) {
            await window.ValdrisStoryIntel.lorebook.createEntryForEntity(entity);
            showToast(`📖 Created lorebook entry for ${entity.name}`, 'success');
            updateUI();
        }
        closeModal('#vsi-lorebook-preview-modal');
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
    updateLorebookSettingsUI();
    updateLorebookStats();
    populateLorebookDropdown();
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
        const hasEntry = window.ValdrisStoryIntel.lorebook.getLorebookStatus(entity.id);
        list.append(`
            <div class="vsi-entity-item" data-id="${entity.id}" data-type="${entity.type}">
                <span class="entity-icon">${config?.icon || '📌'}</span>
                <div class="entity-info">
                    <span class="entity-name">${entity.name}</span>
                    <span class="entity-meta">${config?.name || entity.type} • Added ${dateLabel}</span>
                </div>
                <div class="entity-status">
                    <span class="lorebook-status ${hasEntry ? 'active' : 'inactive'}" title="${
                        hasEntry ? 'In Lorebook' : 'Not in Lorebook'
                    }">📖</span>
                </div>
                <div class="entity-actions">
                    <button class="vsi-btn-icon" title="Edit" data-action="edit">✏️</button>
                    <button class="vsi-btn-icon" title="Create/View Lorebook Entry" data-action="lorebook">📖</button>
                    <button class="vsi-btn-icon" title="Delete" data-action="delete">🗑️</button>
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
        database.addEntity(entity.type, { ...entity, confirmed: true });
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

function openLorebookPreview(entity) {
    const preview = window.ValdrisStoryIntel.lorebook.buildPreview(entity);
    $('#vsi-preview-name').text(preview.name);
    const keywordContainer = $('#vsi-preview-keywords');
    keywordContainer.empty();
    preview.keywords.forEach((keyword) => {
        keywordContainer.append(`<span class="keyword">${keyword}</span>`);
    });
    $('#vsi-preview-content pre').text(preview.content);
    $('#vsi-lorebook-preview-modal').data('entityId', entity.id);
    openModal('#vsi-lorebook-preview-modal');
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
            confirmed: true,
            notes,
            ...fields
        });
    }

    updateUI();
    closeModal('#vsi-edit-modal');
}

function updateLorebookSetting(key, value) {
    const lorebook = window.ValdrisStoryIntel.state.getSection('lorebook');
    lorebook[key] = value;
    window.ValdrisStoryIntel.state.setSection('lorebook', lorebook);
    updateLorebookStats();
}

function updateLorebookSettingsUI() {
    const lorebook = window.ValdrisStoryIntel.state.getSection('lorebook');
    $('#vsi-lorebook-enabled').prop('checked', lorebook.enabled);
    $('#vsi-lorebook-autocreate').prop('checked', lorebook.autoCreate);
    $('#vsi-lorebook-autoupdate').prop('checked', lorebook.autoUpdate);
    $('#vsi-lorebook-autodelete').prop('checked', lorebook.autoDelete);
    $('#vsi-entry-prefix').val(lorebook.entryPrefix || '');
    $('#vsi-add-category-tag').prop('checked', lorebook.addCategoryTag);
    if (lorebook.targetLorebook) {
        $('#vsi-target-lorebook').val(lorebook.targetLorebook);
    }
}

function updateLorebookStats() {
    const lorebook = window.ValdrisStoryIntel.state.getSection('lorebook');
    $('#vsi-entries-created-count').text(lorebook.createdEntries.length);
    $('#vsi-last-sync').text(lorebook.lastSync ? formatDate(lorebook.lastSync) : 'Never');
}

async function populateLorebookDropdown() {
    const select = $('#vsi-target-lorebook');
    if (select.data('loaded')) return;
    const lorebooks = await window.ValdrisStoryIntel.lorebook.getAllLorebooks();
    select.find('option:not(:first)').remove();
    lorebooks.forEach((lorebook) => {
        select.append(`<option value="${lorebook.name}">${lorebook.name}</option>`);
    });
    const settings = window.ValdrisStoryIntel.state.getSection('lorebook');
    if (settings.targetLorebook) {
        select.val(settings.targetLorebook);
    }
    select.data('loaded', true);
}

function registerLorebookHooks(entityDatabase, lorebookManager, stateManager) {
    entityDatabase.onEntityAdded(async (entity) => {
        const settings = stateManager.getSection('lorebook');
        if (settings.enabled && settings.autoCreate && entity.confirmed) {
            await lorebookManager.createEntryForEntity(entity);
            if (stateManager.getSection('settings').showNotifications) {
                showToast(`📖 Created lorebook entry for ${entity.name}`, 'success');
            }
        }
    });

    entityDatabase.onEntityUpdated(async (entity) => {
        const settings = stateManager.getSection('lorebook');
        if (settings.enabled && settings.autoUpdate) {
            await lorebookManager.updateEntryForEntity(entity);
        }
    });

    entityDatabase.onEntityDeleted(async (entity) => {
        const settings = stateManager.getSection('lorebook');
        if (settings.enabled && settings.autoDelete) {
            await lorebookManager.deleteEntryForEntity(entity.id);
        }
    });
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
