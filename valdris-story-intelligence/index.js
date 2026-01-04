import { StateManager } from './state-manager.js';
import { EntityDetector } from './entity-detector.js';
import { EntityDatabase } from './entity-database.js';
import { LorebookManager } from './lorebook-manager.js';
import { NPCTracker } from './npc-tracker.js';
import { ENTITY_TYPES, formatDate, generateUUID, truncateText } from './utils.js';

window.ValdrisStoryIntel = null;
let currentNPCId = null;

jQuery(async () => {
    const stateManager = new StateManager();
    const entityDatabase = new EntityDatabase(stateManager);
    const entityDetector = new EntityDetector(stateManager, entityDatabase);
    const lorebookManager = new LorebookManager(stateManager, entityDatabase);
    const npcTracker = new NPCTracker(stateManager, entityDatabase, lorebookManager);

    await stateManager.initialize();

    window.ValdrisStoryIntel = {
        state: stateManager,
        database: entityDatabase,
        detector: entityDetector,
        lorebook: lorebookManager,
        npcTracker,
        detect: (text) => entityDetector.detectEntities(text),
        search: (query) => entityDatabase.searchEntities(query),
        addEntity: (type, data) => entityDatabase.addEntity(type, data),
        getEntity: (type, id) => entityDatabase.getEntity(type, id)
    };

    registerLorebookHooks(entityDatabase, lorebookManager, stateManager);
    registerNPCDetection(entityDetector, npcTracker, entityDatabase);

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

        const npcs = window.ValdrisStoryIntel.database.getAllEntities('npc');
        npcs.forEach((npc) => {
            if (messageText.toLowerCase().includes(npc.name.toLowerCase())) {
                window.ValdrisStoryIntel.npcTracker.updateProfileFromMessage(
                    npc.id,
                    messageText,
                    data.messageId
                );
            }
        });
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
            const enriched =
                entity.type === 'npc'
                    ? window.ValdrisStoryIntel.npcTracker.createNPCProfile({
                          ...entity,
                          confirmed: true,
                          meta: { confidence: entity.confidence, sourceMessages: [entity.createdFromMessage] }
                      })
                    : { ...entity, confirmed: true };
            database.addEntity(entity.type, enriched);
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
        <div class="vsi-modal vsi-npc-profile-modal" id="vsi-npc-profile-modal">
            <div class="vsi-modal-content xlarge">
                <div class="vsi-modal-header">
                    <h3>👤 NPC Profile</h3>
                    <button class="vsi-modal-close">×</button>
                </div>
                <div class="vsi-modal-body">
                    <div class="profile-layout">
                        <div class="profile-column">
                            <div class="profile-section identity-section">
                                <div class="profile-avatar large">
                                    <span class="avatar-placeholder" id="profile-initials">--</span>
                                </div>
                                <h2 id="profile-name">NPC Name</h2>
                                <p id="profile-title"></p>
                                <div class="profile-relationship">
                                    <span class="relationship-type" id="profile-rel-type">Neutral</span>
                                    <div class="disposition-bar-large">
                                        <div class="bar-fill" id="profile-disp-fill"></div>
                                    </div>
                                    <span class="disposition-number" id="profile-disp-num">0</span>
                                </div>
                            </div>
                            <div class="profile-section">
                                <h4>📏 Appearance</h4>
                                <div class="appearance-grid" id="profile-appearance"></div>
                                <div class="appearance-description" id="profile-appearance-raw"></div>
                            </div>
                        </div>
                        <div class="profile-column">
                            <div class="profile-section">
                                <h4>🎭 Personality</h4>
                                <div class="trait-cloud" id="profile-traits"></div>
                                <div class="personality-details" id="profile-personality"></div>
                            </div>
                            <div class="profile-section">
                                <h4>📋 Background</h4>
                                <div class="background-info" id="profile-background"></div>
                            </div>
                            <div class="profile-section">
                                <h4>💬 Conversation History</h4>
                                <div class="conversation-timeline" id="profile-conversations"></div>
                            </div>
                            <div class="profile-section">
                                <h4>🔗 Relationships</h4>
                                <div class="relationship-web" id="profile-relationships"></div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="vsi-modal-footer">
                    <button class="vsi-btn" id="vsi-profile-edit">✏️ Edit</button>
                    <button class="vsi-btn" id="vsi-profile-export">📤 Export</button>
                    <button class="vsi-btn secondary" id="vsi-profile-close">Close</button>
                </div>
            </div>
        </div>
        <div class="vsi-modal vsi-npc-edit-modal" id="vsi-npc-edit-modal">
            <div class="vsi-modal-content xlarge">
                <div class="vsi-modal-header">
                    <h3>✏️ Edit NPC</h3>
                    <button class="vsi-modal-close">×</button>
                </div>
                <div class="vsi-modal-body">
                    <div class="edit-tabs">
                        <button class="edit-tab active" data-tab="identity">Identity</button>
                        <button class="edit-tab" data-tab="appearance">Appearance</button>
                        <button class="edit-tab" data-tab="personality">Personality</button>
                        <button class="edit-tab" data-tab="background">Background</button>
                        <button class="edit-tab" data-tab="relationship">Relationship</button>
                    </div>
                    <div class="edit-tab-content active" id="edit-identity">
                        <div class="form-row">
                            <label>Name</label>
                            <input type="text" id="edit-npc-name">
                        </div>
                        <div class="form-row">
                            <label>Aliases (comma-separated)</label>
                            <input type="text" id="edit-npc-aliases">
                        </div>
                        <div class="form-row">
                            <label>Title</label>
                            <input type="text" id="edit-npc-title">
                        </div>
                        <div class="form-row-group">
                            <div class="form-row">
                                <label>Race</label>
                                <input type="text" id="edit-npc-race">
                            </div>
                            <div class="form-row">
                                <label>Gender</label>
                                <select id="edit-npc-gender">
                                    <option value="">Unknown</option>
                                    <option value="male">Male</option>
                                    <option value="female">Female</option>
                                    <option value="non-binary">Non-binary</option>
                                    <option value="other">Other</option>
                                </select>
                            </div>
                            <div class="form-row">
                                <label>Age</label>
                                <input type="text" id="edit-npc-age">
                            </div>
                        </div>
                    </div>
                    <div class="edit-tab-content" id="edit-appearance">
                        <div class="form-row-group">
                            <div class="form-row">
                                <label>Height</label>
                                <input type="text" id="edit-npc-height" placeholder="tall, short, 6'2&quot;">
                            </div>
                            <div class="form-row">
                                <label>Build</label>
                                <input type="text" id="edit-npc-build" placeholder="muscular, lean, stocky">
                            </div>
                        </div>
                        <div class="form-row-group">
                            <div class="form-row">
                                <label>Hair Color</label>
                                <input type="text" id="edit-npc-hair-color">
                            </div>
                            <div class="form-row">
                                <label>Hair Style</label>
                                <input type="text" id="edit-npc-hair-style">
                            </div>
                        </div>
                        <div class="form-row-group">
                            <div class="form-row">
                                <label>Eye Color</label>
                                <input type="text" id="edit-npc-eye-color">
                            </div>
                            <div class="form-row">
                                <label>Skin Tone</label>
                                <input type="text" id="edit-npc-skin-tone">
                            </div>
                        </div>
                        <div class="form-row">
                            <label>Facial Hair</label>
                            <input type="text" id="edit-npc-facial-hair">
                        </div>
                        <div class="form-row">
                            <label>Scars (one per line)</label>
                            <textarea id="edit-npc-scars" rows="2"></textarea>
                        </div>
                        <div class="form-row">
                            <label>Voice Description</label>
                            <input type="text" id="edit-npc-voice" placeholder="deep and gravelly">
                        </div>
                        <div class="form-row">
                            <label>Mannerisms (one per line)</label>
                            <textarea id="edit-npc-mannerisms" rows="2"></textarea>
                        </div>
                        <div class="form-row">
                            <label>Typical Clothing</label>
                            <textarea id="edit-npc-clothing" rows="2"></textarea>
                        </div>
                    </div>
                    <div class="edit-tab-content" id="edit-personality">
                        <div class="form-row">
                            <label>Personality Traits (comma-separated)</label>
                            <input type="text" id="edit-npc-traits" placeholder="gruff, honest, stubborn">
                        </div>
                        <div class="form-row">
                            <label>Demeanor</label>
                            <select id="edit-npc-demeanor">
                                <option value="">Unknown</option>
                                <option value="friendly">Friendly</option>
                                <option value="cold">Cold</option>
                                <option value="warm">Warm</option>
                                <option value="suspicious">Suspicious</option>
                                <option value="hostile">Hostile</option>
                                <option value="neutral">Neutral</option>
                            </select>
                        </div>
                        <div class="form-row">
                            <label>Likes (comma-separated)</label>
                            <input type="text" id="edit-npc-likes">
                        </div>
                        <div class="form-row">
                            <label>Dislikes (comma-separated)</label>
                            <input type="text" id="edit-npc-dislikes">
                        </div>
                        <div class="form-row">
                            <label>Goals (comma-separated)</label>
                            <input type="text" id="edit-npc-goals">
                        </div>
                    </div>
                    <div class="edit-tab-content" id="edit-background">
                        <div class="form-row">
                            <label>Occupation</label>
                            <input type="text" id="edit-npc-occupation">
                        </div>
                        <div class="form-row">
                            <label>Affiliations (comma-separated)</label>
                            <input type="text" id="edit-npc-affiliations">
                        </div>
                        <div class="form-row">
                            <label>Social Status</label>
                            <select id="edit-npc-status">
                                <option value="">Unknown</option>
                                <option value="noble">Noble</option>
                                <option value="wealthy">Wealthy</option>
                                <option value="middle">Middle Class</option>
                                <option value="commoner">Commoner</option>
                                <option value="poor">Poor</option>
                                <option value="outcast">Outcast</option>
                            </select>
                        </div>
                        <div class="form-row">
                            <label>Hometown</label>
                            <input type="text" id="edit-npc-hometown">
                        </div>
                        <div class="form-row">
                            <label>Backstory Notes</label>
                            <textarea id="edit-npc-backstory" rows="4"></textarea>
                        </div>
                    </div>
                    <div class="edit-tab-content" id="edit-relationship">
                        <div class="form-row">
                            <label>Relationship Type</label>
                            <select id="edit-npc-rel-type">
                                <option value="unknown">Unknown</option>
                                <option value="neutral">Neutral</option>
                                <option value="acquaintance">Acquaintance</option>
                                <option value="friend">Friend</option>
                                <option value="ally">Ally</option>
                                <option value="enemy">Enemy</option>
                                <option value="rival">Rival</option>
                                <option value="lover">Lover</option>
                            </select>
                        </div>
                        <div class="form-row">
                            <label>Disposition (-100 to +100)</label>
                            <input type="range" id="edit-npc-disposition" min="-100" max="100" value="0">
                            <span id="edit-npc-disp-value">0</span>
                        </div>
                        <div class="form-row">
                            <label>Trust (0-100)</label>
                            <input type="range" id="edit-npc-trust" min="0" max="100" value="50">
                            <span id="edit-npc-trust-value">50</span>
                        </div>
                        <div class="form-row">
                            <label>First Met Location</label>
                            <input type="text" id="edit-npc-first-met">
                        </div>
                        <div class="form-row">
                            <label>Relationship Notes</label>
                            <textarea id="edit-npc-rel-notes" rows="3"></textarea>
                        </div>
                    </div>
                </div>
                <div class="vsi-modal-footer">
                    <button class="vsi-btn" id="save-npc-edit">💾 Save Changes</button>
                    <button class="vsi-btn secondary" id="cancel-npc-edit">Cancel</button>
                    <button class="vsi-btn danger" id="delete-npc">🗑️ Delete</button>
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

    $(document).on('click', '#vsi-npc-profile-modal .vsi-modal-close, #vsi-profile-close', () => {
        closeModal('#vsi-npc-profile-modal');
    });

    $(document).on('click', '#vsi-npc-edit-modal .vsi-modal-close, #cancel-npc-edit', () => {
        closeModal('#vsi-npc-edit-modal');
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

    $(document).on('click', '.vsi-npc-card [data-action="view"]', (event) => {
        event.stopPropagation();
        const npcId = $(event.currentTarget).closest('.vsi-npc-card').data('id');
        openNPCProfileModal(npcId);
    });

    $(document).on('click', '.vsi-npc-card [data-action="edit"]', (event) => {
        event.stopPropagation();
        const npcId = $(event.currentTarget).closest('.vsi-npc-card').data('id');
        openNPCEditModal(npcId);
    });

    $(document).on('click', '#vsi-profile-edit', () => {
        if (currentNPCId) openNPCEditModal(currentNPCId);
    });

    $(document).on('click', '#vsi-profile-export', () => {
        if (!currentNPCId) return;
        const npc = window.ValdrisStoryIntel.database.getEntity('npc', currentNPCId);
        if (!npc) return;
        const summary = window.ValdrisStoryIntel.npcTracker.generateDetailedProfile(npc);
        navigator.clipboard.writeText(summary).then(() => {
            showToast('NPC profile copied to clipboard.', 'success');
        });
    });

    $(document).on('click', '.edit-tab', (event) => {
        const tab = $(event.currentTarget).data('tab');
        $('.edit-tab').removeClass('active');
        $(event.currentTarget).addClass('active');
        $('.edit-tab-content').removeClass('active');
        $(`#edit-${tab}`).addClass('active');
    });

    $('#edit-npc-disposition').on('input', (event) => {
        $('#edit-npc-disp-value').text(event.target.value);
    });

    $('#edit-npc-trust').on('input', (event) => {
        $('#edit-npc-trust-value').text(event.target.value);
    });

    $('#save-npc-edit').on('click', () => {
        saveNPCEdit();
    });

    $('#delete-npc').on('click', () => {
        if (!currentNPCId) return;
        window.ValdrisStoryIntel.database.deleteEntity('npc', currentNPCId);
        closeModal('#vsi-npc-edit-modal');
        closeModal('#vsi-npc-profile-modal');
        updateUI();
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
        if (entity.type === 'npc') {
            list.append(renderNPCCard(entity));
            return;
        }

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
        const enriched =
            entity.type === 'npc'
                ? window.ValdrisStoryIntel.npcTracker.createNPCProfile({
                      ...entity,
                      confirmed: true,
                      meta: { confidence: entity.confidence, sourceMessages: [entity.createdFromMessage] }
                  })
                : { ...entity, confirmed: true };
        database.addEntity(entity.type, enriched);
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

function renderNPCCard(npc) {
    const initials = npc.name
        .split(' ')
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
    const relationshipType = npc.playerRelationship?.type || 'neutral';
    const disposition = npc.playerRelationship?.disposition || 0;
    const dispositionPercent = Math.max(0, Math.min(100, (disposition + 100) / 2));
    const traits = npc.personality?.traits?.slice(0, 4) || [];
    const appearanceSummary = window.ValdrisStoryIntel.npcTracker.generateProfileSummary(npc)
        .split('\n')
        .find((line) => line.startsWith('Appearance:'))
        ?.replace('Appearance: ', '');
    const lastConversation = npc.conversations?.slice(-1)[0];
    const hasEntry = window.ValdrisStoryIntel.lorebook.getLorebookStatus(npc.id);

    return `
        <div class="vsi-npc-card enhanced" data-id="${npc.id}" data-rel="${relationshipType}">
            <div class="npc-card-header">
                <div class="npc-avatar">
                    <span class="avatar-placeholder">${initials}</span>
                    <span class="relationship-badge">${relationshipIcon(relationshipType)}</span>
                </div>
                <div class="npc-identity">
                    <span class="npc-name">${npc.name}</span>
                    <span class="npc-title">${npc.title || ''}</span>
                    <div class="npc-tags">
                        ${traits.map((trait) => `<span class="npc-tag">${trait}</span>`).join('')}
                    </div>
                </div>
                <div class="npc-disposition-meter">
                    <div class="disposition-bar" style="--position: ${dispositionPercent}%"></div>
                    <span class="disposition-value">${disposition}</span>
                </div>
            </div>
            <div class="npc-card-body">
                <div class="npc-quick-stats">
                    <div class="quick-stat">
                        <span class="stat-label">Met</span>
                        <span class="stat-value">${npc.playerRelationship?.interactions || 0}x</span>
                    </div>
                    <div class="quick-stat">
                        <span class="stat-label">Trust</span>
                        <span class="stat-value">${npc.playerRelationship?.trust || 0}%</span>
                    </div>
                    <div class="quick-stat">
                        <span class="stat-label">Status</span>
                        <span class="stat-value">${npc.status?.condition || 'unknown'}</span>
                    </div>
                </div>
                ${
                    appearanceSummary
                        ? `<div class="npc-appearance-preview"><span class="preview-label">Appearance:</span> <span class="preview-text">${appearanceSummary}</span></div>`
                        : ''
                }
                ${
                    lastConversation
                        ? `<div class="npc-last-conv"><span class="conv-label">Last talked about:</span> <span class="conv-topics">${(lastConversation.topics || []).join(', ') || 'general'}</span></div>`
                        : ''
                }
            </div>
            <div class="npc-card-actions">
                <button class="vsi-btn-small" data-action="view">View Profile</button>
                <button class="vsi-btn-small" data-action="edit">Edit</button>
                <span class="lorebook-status ${hasEntry ? 'active' : 'inactive'}" title="${
                    hasEntry ? 'In Lorebook' : 'Not in Lorebook'
                }">📖</span>
            </div>
        </div>
    `;
}

function relationshipIcon(type) {
    const icons = {
        friend: '🙂',
        ally: '🛡️',
        enemy: '⚔️',
        rival: '🔥',
        lover: '💖',
        neutral: '•'
    };
    return icons[type] || '•';
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
        const entityData = { name, confirmed: true, notes, ...fields };
        const enriched =
            type === 'npc'
                ? window.ValdrisStoryIntel.npcTracker.createNPCProfile({
                      ...entityData,
                      meta: { sourceMessages: [] }
                  })
                : entityData;
        window.ValdrisStoryIntel.database.addEntity(type, enriched);
    }

    updateUI();
    closeModal('#vsi-edit-modal');
}

function openNPCProfileModal(npcId) {
    const npc = window.ValdrisStoryIntel.database.getEntity('npc', npcId);
    if (!npc) return;
    currentNPCId = npcId;
    const initials = npc.name
        .split(' ')
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
    $('#profile-initials').text(initials);
    $('#profile-name').text(npc.name);
    $('#profile-title').text(npc.title || '');
    $('#profile-rel-type').text(npc.playerRelationship?.type || 'neutral');
    $('#profile-disp-num').text(npc.playerRelationship?.disposition || 0);
    const dispPercent = Math.max(0, Math.min(100, ((npc.playerRelationship?.disposition || 0) + 100) / 2));
    $('#profile-disp-fill').css('width', `${dispPercent}%`);

    const appearanceGrid = $('#profile-appearance');
    appearanceGrid.empty();
    const appearanceFields = {
        Height: npc.appearance?.height,
        Build: npc.appearance?.build,
        Hair: [npc.appearance?.hairColor, npc.appearance?.hairStyle].filter(Boolean).join(', '),
        Eyes: npc.appearance?.eyeColor,
        Skin: npc.appearance?.skinTone,
        FacialHair: npc.appearance?.facialHair
    };
    Object.entries(appearanceFields).forEach(([label, value]) => {
        if (!value) return;
        appearanceGrid.append(
            `<div class="app-item"><span class="app-label">${label}</span><span class="app-value">${value}</span></div>`
        );
    });
    const rawDesc = npc.appearance?.rawDescriptions?.slice(-1)[0] || '';
    $('#profile-appearance-raw').text(rawDesc);

    const traitCloud = $('#profile-traits');
    traitCloud.empty();
    (npc.personality?.traits || []).forEach((trait) => {
        traitCloud.append(`<span class="trait">${trait}</span>`);
    });

    const personalityDetails = $('#profile-personality');
    personalityDetails.html(`
        <div>Likes: ${(npc.personality?.likes || []).join(', ') || 'Unknown'}</div>
        <div>Dislikes: ${(npc.personality?.dislikes || []).join(', ') || 'Unknown'}</div>
        <div>Goals: ${(npc.personality?.goals || []).join(', ') || 'Unknown'}</div>
    `);

    const backgroundInfo = $('#profile-background');
    backgroundInfo.html(`
        <div>Occupation: ${npc.background?.occupation || 'Unknown'}</div>
        <div>Affiliations: ${(npc.background?.affiliations || []).join(', ') || 'Unknown'}</div>
        <div>Hometown: ${npc.background?.hometown || 'Unknown'}</div>
    `);

    const conversations = $('#profile-conversations');
    conversations.empty();
    (npc.conversations || []).slice(-5).forEach((conv) => {
        conversations.append(`
            <div class="conv-item">
                <div class="conv-date">${conv.date || ''}</div>
                <div class="conv-topics">${(conv.topics || []).join(', ') || 'general'}</div>
                <div class="conv-quote">${conv.importantQuotes?.[0] ? `"${conv.importantQuotes[0]}"` : ''}</div>
            </div>
        `);
    });

    const relationships = $('#profile-relationships');
    relationships.empty();
    const related = window.ValdrisStoryIntel.npcTracker.getRelatedNPCs(npcId);
    if (related.length === 0) {
        relationships.append('<div class="vsi-empty">No relationships tracked.</div>');
    } else {
        related.forEach((rel) => {
            relationships.append(`<div>${rel.npc.name} — ${rel.relationship.type || 'related'}</div>`);
        });
    }

    openModal('#vsi-npc-profile-modal');
}

function openNPCEditModal(npcId) {
    const npc = window.ValdrisStoryIntel.database.getEntity('npc', npcId);
    if (!npc) return;
    currentNPCId = npcId;
    $('.edit-tab').removeClass('active');
    $('.edit-tab-content').removeClass('active');
    $('.edit-tab[data-tab="identity"]').addClass('active');
    $('#edit-identity').addClass('active');
    $('#edit-npc-name').val(npc.name || '');
    $('#edit-npc-aliases').val((npc.aliases || []).join(', '));
    $('#edit-npc-title').val(npc.title || '');
    $('#edit-npc-race').val(npc.race || '');
    $('#edit-npc-gender').val(npc.gender || '');
    $('#edit-npc-age').val(npc.age || '');

    $('#edit-npc-height').val(npc.appearance?.height || '');
    $('#edit-npc-build').val(npc.appearance?.build || '');
    $('#edit-npc-hair-color').val(npc.appearance?.hairColor || '');
    $('#edit-npc-hair-style').val(npc.appearance?.hairStyle || '');
    $('#edit-npc-eye-color').val(npc.appearance?.eyeColor || '');
    $('#edit-npc-skin-tone').val(npc.appearance?.skinTone || '');
    $('#edit-npc-facial-hair').val(npc.appearance?.facialHair || '');
    $('#edit-npc-scars').val((npc.appearance?.scars || []).join('\\n'));
    $('#edit-npc-voice').val(npc.appearance?.voiceDescription || '');
    $('#edit-npc-mannerisms').val((npc.appearance?.mannerisms || []).join('\\n'));
    $('#edit-npc-clothing').val(npc.appearance?.typicalClothing || '');

    $('#edit-npc-traits').val((npc.personality?.traits || []).join(', '));
    $('#edit-npc-demeanor').val(npc.personality?.demeanor || '');
    $('#edit-npc-likes').val((npc.personality?.likes || []).join(', '));
    $('#edit-npc-dislikes').val((npc.personality?.dislikes || []).join(', '));
    $('#edit-npc-goals').val((npc.personality?.goals || []).join(', '));

    $('#edit-npc-occupation').val(npc.background?.occupation || '');
    $('#edit-npc-affiliations').val((npc.background?.affiliations || []).join(', '));
    $('#edit-npc-status').val(npc.background?.socialStatus || '');
    $('#edit-npc-hometown').val(npc.background?.hometown || '');
    $('#edit-npc-backstory').val((npc.background?.backstory || []).join('\\n'));

    $('#edit-npc-rel-type').val(npc.playerRelationship?.type || 'neutral');
    $('#edit-npc-disposition').val(npc.playerRelationship?.disposition || 0);
    $('#edit-npc-disp-value').text(npc.playerRelationship?.disposition || 0);
    $('#edit-npc-trust').val(npc.playerRelationship?.trust || 50);
    $('#edit-npc-trust-value').text(npc.playerRelationship?.trust || 50);
    $('#edit-npc-first-met').val(npc.playerRelationship?.firstMet?.location || '');
    $('#edit-npc-rel-notes').val((npc.playerRelationship?.milestones || []).join('\\n'));

    openModal('#vsi-npc-edit-modal');
}

function saveNPCEdit() {
    if (!currentNPCId) return;
    const parseComma = (value) =>
        value
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);
    const parseLines = (value) =>
        value
            .split('\n')
            .map((item) => item.trim())
            .filter(Boolean);

    const updates = {
        name: $('#edit-npc-name').val().trim(),
        aliases: parseComma($('#edit-npc-aliases').val()),
        title: $('#edit-npc-title').val().trim(),
        race: $('#edit-npc-race').val().trim(),
        gender: $('#edit-npc-gender').val(),
        age: $('#edit-npc-age').val().trim(),
        appearance: {
            height: $('#edit-npc-height').val().trim(),
            build: $('#edit-npc-build').val().trim(),
            hairColor: $('#edit-npc-hair-color').val().trim(),
            hairStyle: $('#edit-npc-hair-style').val().trim(),
            eyeColor: $('#edit-npc-eye-color').val().trim(),
            skinTone: $('#edit-npc-skin-tone').val().trim(),
            facialHair: $('#edit-npc-facial-hair').val().trim(),
            scars: parseLines($('#edit-npc-scars').val()),
            voiceDescription: $('#edit-npc-voice').val().trim(),
            mannerisms: parseLines($('#edit-npc-mannerisms').val()),
            typicalClothing: $('#edit-npc-clothing').val().trim()
        },
        personality: {
            traits: parseComma($('#edit-npc-traits').val()),
            demeanor: $('#edit-npc-demeanor').val(),
            likes: parseComma($('#edit-npc-likes').val()),
            dislikes: parseComma($('#edit-npc-dislikes').val()),
            goals: parseComma($('#edit-npc-goals').val())
        },
        background: {
            occupation: $('#edit-npc-occupation').val().trim(),
            affiliations: parseComma($('#edit-npc-affiliations').val()),
            socialStatus: $('#edit-npc-status').val(),
            hometown: $('#edit-npc-hometown').val().trim(),
            backstory: parseLines($('#edit-npc-backstory').val())
        },
        playerRelationship: {
            ...window.ValdrisStoryIntel.database.getEntity('npc', currentNPCId)?.playerRelationship,
            type: $('#edit-npc-rel-type').val(),
            disposition: Number($('#edit-npc-disposition').val()),
            trust: Number($('#edit-npc-trust').val()),
            firstMet: {
                location: $('#edit-npc-first-met').val().trim(),
                date: window.ValdrisStoryIntel.database.getEntity('npc', currentNPCId)?.playerRelationship?.firstMet
                    ?.date
            },
            milestones: parseLines($('#edit-npc-rel-notes').val())
        },
        meta: {
            ...(window.ValdrisStoryIntel.database.getEntity('npc', currentNPCId)?.meta || {}),
            manuallyEdited: true
        }
    };

    if (!updates.name) {
        showToast('Name is required.', 'error');
        return;
    }

    window.ValdrisStoryIntel.database.updateEntity('npc', currentNPCId, updates);
    closeModal('#vsi-npc-edit-modal');
    updateUI();
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

function registerNPCDetection(entityDetector, npcTracker, entityDatabase) {
    entityDetector.onEntityDetected((entity) => {
        if (entity.type !== 'npc') return;
        const existing = entityDatabase.getEntityByName('npc', entity.name);
        if (existing && !existing.appearance) {
            const profile = npcTracker.createNPCProfile(existing);
            entityDatabase.updateEntity('npc', existing.id, profile);
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
