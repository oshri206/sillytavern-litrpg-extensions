/**
 * Valdris Auto-Lorebook Generator
 * ================================
 * Fully automatic lorebook entry generation from narrative.
 * NO manual work - just play and the lorebook GROWS!
 * 
 * Features:
 * - Auto-detects NPCs, locations, items, factions, events
 * - Captures descriptions when entities are introduced
 * - Creates lorebook entries with smart keywords
 * - Integrates with Journey Tracker
 * - Zero configuration needed
 */

const EXT_NAME = 'valdris-autolore';
const META_KEY = 'vautolore_state_v1';

// ══════════════════════════════════════════════════════════════════════════════
// Imports
// ══════════════════════════════════════════════════════════════════════════════
let extension_settings, getContext, saveSettingsDebounced;
let eventSource, event_types;

try {
  const extModule = await import('../../../extensions.js');
  extension_settings = extModule.extension_settings;
  getContext = extModule.getContext;
  saveSettingsDebounced = extModule.saveSettingsDebounced;
} catch (e) {
  console.error('[AutoLore] Failed to import extensions.js', e);
}

try {
  const scriptModule = await import('../../../../script.js');
  eventSource = scriptModule.eventSource;
  event_types = scriptModule.event_types;
  if (!saveSettingsDebounced) saveSettingsDebounced = scriptModule.saveSettingsDebounced;
} catch (e) {
  console.error('[AutoLore] Failed to import script.js', e);
}

// ══════════════════════════════════════════════════════════════════════════════
// ENTITY TYPES
// ══════════════════════════════════════════════════════════════════════════════

const ENTITY_TYPES = {
  npc: { 
    label: 'NPC', 
    icon: '👤', 
    color: '#8b5cf6',
    priority: 100,  // Higher = triggered more easily
  },
  location: { 
    label: 'Location', 
    icon: '📍', 
    color: '#22c55e',
    priority: 80,
  },
  item: { 
    label: 'Item', 
    icon: '🎒', 
    color: '#f59e0b',
    priority: 60,
  },
  faction: { 
    label: 'Faction', 
    icon: '🏛️', 
    color: '#3b82f6',
    priority: 70,
  },
  creature: { 
    label: 'Creature', 
    icon: '🐉', 
    color: '#dc2626',
    priority: 65,
  },
  event: { 
    label: 'Event', 
    icon: '⚡', 
    color: '#ec4899',
    priority: 50,
  },
  lore: { 
    label: 'Lore', 
    icon: '📜', 
    color: '#06b6d4',
    priority: 40,
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// DETECTION PATTERNS
// ══════════════════════════════════════════════════════════════════════════════

const DETECTION_PATTERNS = {
  // NPC Introduction patterns - capture name and surrounding description
  npcIntro: [
    // "Elena Thorne, a weathered captain with..."
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),\s+(?:a|an|the)\s+([^.]{10,100})/g,
    // "Captain Elena stands..." or "The merchant Marcus looks..."
    /(?:Captain|Lord|Lady|Sir|Master|Commander|Chief|Elder|King|Queen|Prince|Princess)\s+([A-Z][a-z]+)(?:\s+[A-Z][a-z]+)?\s+([^.]{5,80})/gi,
    // "meet Elena Thorne, who..." 
    /(?:meet|meets|met|introduce|introduces|introduced to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)[,.]?\s*(?:who|she|he|they)?\s*([^.]{0,100})/gi,
  ],
  
  // Location introduction - capture place and description
  locationIntro: [
    // "The Rusty Anchor, a dimly lit tavern..."
    /(?:The\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}),\s+(?:a|an)\s+(tavern|inn|shop|temple|castle|tower|dungeon|village|city|town|forest|mountain|cave|ruins?|market|guild|manor|estate|fortress|palace|shrine|sanctuary)[^.]{0,80}/gi,
    // "entered the Whispering Woods, a dense forest..."
    /(?:enter|enters|entered|arrive|arrives|arrived at|reach|reaches|reached)\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})[,.]?\s*([^.]{0,100})/gi,
    // "[Location: Elena's Home | ..."
    /\[Location:\s*([^|]+)/gi,
  ],
  
  // Item introduction - capture item and description
  itemIntro: [
    // "[+1 Enchanted Sword]" or "[+Health Potion]"
    /\[\+(?:\d+\s+)?([A-Za-z][A-Za-z\s]+?)\]/g,
    // "found a gleaming sword with..."
    /(?:found|finds|discovered|discovers|received|receives|obtained|obtains|acquired|acquires)\s+(?:a|an|the)\s+([a-z]+(?:\s+[a-z]+){0,3})\s+([^.]{0,60})/gi,
    // "the Sword of Flames, a legendary weapon..."
    /(?:the\s+)?([A-Z][a-z]+(?:\s+(?:of|the)\s+[A-Z][a-z]+)+)[,.]?\s*(?:a|an)?\s*(legendary|ancient|magical|enchanted|cursed|blessed|rare|unique|powerful)?\s*([^.]{0,80})/gi,
  ],
  
  // Faction mentions
  factionIntro: [
    // "The Shadow Consortium, a secretive organization..."
    /(?:The\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}(?:\s+(?:Consortium|Guild|Order|Brotherhood|Sisterhood|Alliance|Empire|Kingdom|Republic|Dominion|Tribes?|Confederacy|League|Court|Hold|Theocracy|Magocracy)))[,.]?\s*([^.]{0,100})/gi,
    // "[Faction reputation: Free Cities +5]"
    /\[Faction\s+reputation:\s*([^+-]+)/gi,
  ],
  
  // Creature/monster mentions
  creatureIntro: [
    // "a massive dragon with scales..."
    /(?:a|an|the)\s+(massive|giant|huge|small|ancient|young|fearsome|terrible|beautiful|magnificent)?\s*(dragon|wolf|bear|spider|goblin|orc|troll|demon|undead|skeleton|zombie|vampire|werewolf|beast|creature|monster|serpent|wyrm|hydra|griffon|phoenix)[s]?\s+([^.]{0,80})/gi,
  ],
  
  // Event/history mentions
  eventIntro: [
    // "The Corsair Wars, a bloody conflict..."
    /(?:The\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}(?:\s+(?:War|Wars|Battle|Siege|Conflict|Rebellion|Revolution|Catastrophe|Disaster|Plague|Crisis)))[,.]?\s*([^.]{0,100})/gi,
    // "during the Fall of Valdran..."
    /(?:during|after|before|since)\s+(?:the\s+)?([A-Z][a-z]+(?:\s+(?:of|the)\s+[A-Z][a-z]+)+)[,.]?\s*([^.]{0,80})/gi,
  ],
  
  // Lore/world-building mentions
  loreIntro: [
    // "The Vex System, a mysterious force that..."
    /(?:The\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?(?:\s+(?:System|Magic|Power|Force|Energy|Art|Craft|Law|Code|Prophecy|Legend)))[,.]?\s*([^.]{0,100})/gi,
  ],
};

// Common words to filter out as false positives
const FILTER_WORDS = [
  'the', 'and', 'but', 'for', 'you', 'your', 'they', 'their', 'this', 'that',
  'what', 'who', 'how', 'why', 'when', 'where', 'which', 'there', 'here',
  'have', 'has', 'had', 'been', 'being', 'will', 'would', 'could', 'should',
  'just', 'only', 'even', 'also', 'very', 'much', 'more', 'most', 'some',
  'nothing', 'something', 'anything', 'everything', 'someone', 'anyone',
  'location', 'weather', 'quest', 'combat', 'system', 'level', 'skill',
  'chapter', 'scene', 'part', 'section', 'update', 'status',
];

// ══════════════════════════════════════════════════════════════════════════════
// STATE MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════

function newEmptyState() {
  return {
    version: 1,
    entries: {},         // { entryId: { type, name, keywords, content, source, created, updated } }
    pendingEntries: [],  // Entries waiting for more description
    knownEntities: {},   // { normalizedName: entryId } for deduplication
    settings: {
      autoCreateLorebook: true,
      minDescriptionLength: 20,
      notifyOnCreate: true,
      captureNpcs: true,
      captureLocations: true,
      captureItems: true,
      captureFactions: true,
      captureCreatures: true,
      captureEvents: true,
      captureLore: true,
    },
    stats: {
      totalEntries: 0,
      entriesByType: {},
      lastGenerated: null,
    },
  };
}

function getChatMetadata() {
  const ctx = SillyTavern?.getContext ? SillyTavern.getContext() : (getContext ? getContext() : null);
  return ctx?.chatMetadata;
}

async function saveChatMetadata() {
  const ctx = SillyTavern?.getContext ? SillyTavern.getContext() : (getContext ? getContext() : null);
  if (ctx?.saveMetadata) return await ctx.saveMetadata();
  if (ctx?.saveMetadataDebounced) return await ctx.saveMetadataDebounced();
}

function getChatState() {
  const md = getChatMetadata();
  if (!md) return newEmptyState();
  if (!md[META_KEY]) md[META_KEY] = newEmptyState();
  return md[META_KEY];
}

async function commitState(state) {
  state.stats.lastUpdated = Date.now();
  const md = getChatMetadata();
  if (md) md[META_KEY] = state;
  await saveChatMetadata();
}

// ══════════════════════════════════════════════════════════════════════════════
// ENTITY DETECTION
// ══════════════════════════════════════════════════════════════════════════════

function normalizeEntityName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

function generateKeywords(name, type, description = '') {
  const keywords = [];
  
  // Add the full name
  keywords.push(name);
  
  // Add name parts
  const nameParts = name.split(/\s+/);
  if (nameParts.length > 1) {
    nameParts.forEach(part => {
      if (part.length > 2 && !FILTER_WORDS.includes(part.toLowerCase())) {
        keywords.push(part);
      }
    });
  }
  
  // Add type-specific keywords
  if (type === 'npc') {
    // Add title if present
    const titleMatch = name.match(/^(Captain|Lord|Lady|Sir|Master|King|Queen|Prince|Princess|Elder|Chief)\s+/i);
    if (titleMatch) {
      keywords.push(titleMatch[1]);
    }
  }
  
  // Extract keywords from description
  if (description) {
    // Look for quoted terms or proper nouns
    const properNouns = description.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || [];
    properNouns.forEach(noun => {
      if (!FILTER_WORDS.includes(noun.toLowerCase()) && !keywords.includes(noun)) {
        keywords.push(noun);
      }
    });
  }
  
  // Deduplicate and return
  return [...new Set(keywords)].slice(0, 10);  // Max 10 keywords
}

/**
 * Parse a message for new entities
 */
function detectEntities(text) {
  const detected = [];
  const st = getChatState();
  
  // Check each entity type
  for (const [typeName, patterns] of Object.entries({
    npc: DETECTION_PATTERNS.npcIntro,
    location: DETECTION_PATTERNS.locationIntro,
    item: DETECTION_PATTERNS.itemIntro,
    faction: DETECTION_PATTERNS.factionIntro,
    creature: DETECTION_PATTERNS.creatureIntro,
    event: DETECTION_PATTERNS.eventIntro,
    lore: DETECTION_PATTERNS.loreIntro,
  })) {
    // Check settings
    const settingKey = `capture${typeName.charAt(0).toUpperCase() + typeName.slice(1)}s`;
    if (st.settings[settingKey] === false) continue;
    
    for (const pattern of patterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      
      while ((match = regex.exec(text)) !== null) {
        const name = (match[1] || '').trim();
        const description = (match[2] || match[3] || '').trim();
        
        // Filter invalid names
        if (!name || name.length < 2 || name.length > 50) continue;
        if (FILTER_WORDS.includes(name.toLowerCase())) continue;
        if (!/[A-Z]/.test(name)) continue;  // Must have capital letter
        
        // Check if already known
        const normalized = normalizeEntityName(name);
        if (st.knownEntities[normalized]) continue;
        
        // Add to detected
        detected.push({
          type: typeName,
          name,
          description,
          normalized,
          source: match[0].substring(0, 200),  // Store source for context
        });
      }
    }
  }
  
  return detected;
}

/**
 * Create a lorebook entry from detected entity
 */
function createLoreEntry(entity) {
  const typeInfo = ENTITY_TYPES[entity.type];
  const keywords = generateKeywords(entity.name, entity.type, entity.description);
  
  // Build the content
  let content = `**${entity.name}**`;
  if (typeInfo) {
    content += ` (${typeInfo.label})`;
  }
  content += '\n\n';
  
  if (entity.description) {
    content += entity.description;
  } else {
    content += `A ${entity.type} encountered during the journey.`;
  }
  
  return {
    id: `vlore_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    type: entity.type,
    name: entity.name,
    keywords,
    content,
    source: entity.source,
    created: Date.now(),
    updated: Date.now(),
    messageIndex: -1,  // Will be set when added
  };
}

/**
 * Process a message and create entries for new entities
 */
async function processMessage(messageText, messageIndex = -1) {
  const st = getChatState();
  const detected = detectEntities(messageText);
  const newEntries = [];
  
  for (const entity of detected) {
    // Skip if already known
    if (st.knownEntities[entity.normalized]) continue;
    
    // Create entry
    const entry = createLoreEntry(entity);
    entry.messageIndex = messageIndex;
    
    // Add to state
    st.entries[entry.id] = entry;
    st.knownEntities[entity.normalized] = entry.id;
    st.stats.totalEntries++;
    st.stats.entriesByType[entity.type] = (st.stats.entriesByType[entity.type] || 0) + 1;
    st.stats.lastGenerated = Date.now();
    
    newEntries.push(entry);
    
    console.log(`[AutoLore] Created entry: ${entity.name} (${entity.type})`);
  }
  
  if (newEntries.length > 0) {
    await commitState(st);
    
    // Show notifications
    if (st.settings.notifyOnCreate) {
      for (const entry of newEntries) {
        showEntryNotification(entry);
      }
    }
    
    // Sync to actual SillyTavern lorebook if enabled
    if (st.settings.autoCreateLorebook) {
      for (const entry of newEntries) {
        await addToSillyTavernLorebook(entry);
      }
    }
    
    // Update UI
    if (UI.panelOpen) render();
  }
  
  return newEntries;
}

// ══════════════════════════════════════════════════════════════════════════════
// SILLYTAVERN LOREBOOK INTEGRATION
// ══════════════════════════════════════════════════════════════════════════════

async function addToSillyTavernLorebook(entry) {
  try {
    const ctx = SillyTavern?.getContext ? SillyTavern.getContext() : (getContext ? getContext() : null);
    if (!ctx) {
      console.log('[AutoLore] No context available for lorebook');
      return false;
    }
    
    // Get the chat's bound lorebook
    const chatLorebook = ctx.chatMetadata?.world_info;
    if (!chatLorebook) {
      console.log('[AutoLore] No lorebook bound to chat');
      return false;
    }
    
    // Try to access world info API
    if (typeof SillyTavern !== 'undefined' && SillyTavern.getWorldInfoApi) {
      const wiApi = SillyTavern.getWorldInfoApi();
      if (wiApi && wiApi.addEntry) {
        await wiApi.addEntry(chatLorebook, {
          key: entry.keywords,
          keysecondary: [],
          content: entry.content,
          comment: `[AutoLore] ${entry.name}`,
          disable: false,
          position: 4,  // After character defs
          order: 100,
          depth: 4,
          selectiveLogic: 0,
          probability: 100,
          extensions: {
            valdris_autolore: {
              id: entry.id,
              type: entry.type,
              created: entry.created,
            }
          }
        });
        console.log(`[AutoLore] Added to ST lorebook: ${entry.name}`);
        return true;
      }
    }
    
    console.log('[AutoLore] World Info API not available');
    return false;
  } catch (e) {
    console.error('[AutoLore] Failed to add to lorebook:', e);
    return false;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// JOURNEY TRACKER INTEGRATION
// ══════════════════════════════════════════════════════════════════════════════

function subscribeToJourney() {
  if (!window.VJourney) {
    console.log('[AutoLore] VJourney not available yet, retrying...');
    setTimeout(subscribeToJourney, 1000);
    return;
  }
  
  // Subscribe to NPC discoveries
  window.VJourney.subscribe(window.VJourney.EVENTS.NPC_DISCOVERED, async (data) => {
    const st = getChatState();
    const normalized = normalizeEntityName(data.name);
    
    if (!st.knownEntities[normalized]) {
      const entry = createLoreEntry({
        type: 'npc',
        name: data.name,
        description: `First met at ${data.location || 'unknown location'}. ${data.faction ? `Associated with ${data.faction}.` : ''}`,
        normalized,
      });
      
      st.entries[entry.id] = entry;
      st.knownEntities[normalized] = entry.id;
      st.stats.totalEntries++;
      st.stats.entriesByType.npc = (st.stats.entriesByType.npc || 0) + 1;
      
      await commitState(st);
      
      if (st.settings.notifyOnCreate) {
        showEntryNotification(entry);
      }
      
      if (st.settings.autoCreateLorebook) {
        await addToSillyTavernLorebook(entry);
      }
      
      if (UI.panelOpen) render();
    }
  });
  
  // Subscribe to location changes
  window.VJourney.subscribe(window.VJourney.EVENTS.LOCATION_CHANGED, async (data) => {
    if (!data.location || data.location === 'unknown') return;
    
    const st = getChatState();
    const normalized = normalizeEntityName(data.location);
    
    if (!st.knownEntities[normalized] && st.settings.captureLocations) {
      const entry = createLoreEntry({
        type: 'location',
        name: data.location,
        description: `A ${data.locationType || 'place'} in ${data.terrain || 'unknown'} terrain. ${data.tags?.join(', ') || ''}`,
        normalized,
      });
      
      st.entries[entry.id] = entry;
      st.knownEntities[normalized] = entry.id;
      st.stats.totalEntries++;
      st.stats.entriesByType.location = (st.stats.entriesByType.location || 0) + 1;
      
      await commitState(st);
      
      if (st.settings.notifyOnCreate) {
        showEntryNotification(entry);
      }
      
      if (st.settings.autoCreateLorebook) {
        await addToSillyTavernLorebook(entry);
      }
      
      if (UI.panelOpen) render();
    }
  });
  
  // Subscribe to faction encounters
  window.VJourney.subscribe(window.VJourney.EVENTS.FACTION_ENCOUNTERED, async (data) => {
    if (!data.faction) return;
    
    const st = getChatState();
    const normalized = normalizeEntityName(data.faction);
    
    if (!st.knownEntities[normalized] && st.settings.captureFactions) {
      const entry = createLoreEntry({
        type: 'faction',
        name: data.faction,
        description: `A faction encountered during the journey.`,
        normalized,
      });
      
      st.entries[entry.id] = entry;
      st.knownEntities[normalized] = entry.id;
      st.stats.totalEntries++;
      st.stats.entriesByType.faction = (st.stats.entriesByType.faction || 0) + 1;
      
      await commitState(st);
      
      if (st.settings.notifyOnCreate) {
        showEntryNotification(entry);
      }
      
      if (st.settings.autoCreateLorebook) {
        await addToSillyTavernLorebook(entry);
      }
      
      if (UI.panelOpen) render();
    }
  });
  
  console.log('[AutoLore] Subscribed to Journey Tracker!');
}

// ══════════════════════════════════════════════════════════════════════════════
// UI
// ══════════════════════════════════════════════════════════════════════════════

const UI = {
  mounted: false,
  root: null,
  panelOpen: false,
  filterType: 'all',
  searchQuery: '',
};

function mountUI() {
  if (UI.mounted) return;
  
  // Launcher button
  const launcher = document.createElement('div');
  launcher.id = 'vlore_launcher';
  launcher.innerHTML = '📖';
  launcher.title = 'Auto-Lorebook';
  launcher.addEventListener('click', togglePanel);
  document.body.appendChild(launcher);
  
  // Main panel
  const root = document.createElement('div');
  root.id = 'vlore_root';
  root.className = 'vlore_hidden';
  document.body.appendChild(root);
  UI.root = root;
  UI.mounted = true;
  
  render();
  console.log('[AutoLore] UI mounted');
}

function togglePanel() {
  UI.panelOpen = !UI.panelOpen;
  UI.root.classList.toggle('vlore_hidden', !UI.panelOpen);
  if (UI.panelOpen) render();
}

function render() {
  const st = getChatState();
  const entries = Object.values(st.entries);
  
  // Filter entries
  let filtered = entries;
  if (UI.filterType !== 'all') {
    filtered = filtered.filter(e => e.type === UI.filterType);
  }
  if (UI.searchQuery) {
    const q = UI.searchQuery.toLowerCase();
    filtered = filtered.filter(e => 
      e.name.toLowerCase().includes(q) || 
      e.content.toLowerCase().includes(q) ||
      e.keywords.some(k => k.toLowerCase().includes(q))
    );
  }
  
  // Sort by created date (newest first)
  filtered.sort((a, b) => b.created - a.created);
  
  UI.root.innerHTML = `
    <div class="vlore_panel">
      <div class="vlore_header">
        <span class="vlore_title">📖 Auto-Lorebook</span>
        <div class="vlore_header_btns">
          <button class="vlore_btn" id="vlore_btn_settings" title="Settings">⚙️</button>
          <button class="vlore_btn vlore_btn_close" id="vlore_btn_close" title="Close">✕</button>
        </div>
      </div>
      
      <div class="vlore_stats">
        <div class="vlore_stat_item">
          <span class="vlore_stat_num">${st.stats.totalEntries}</span>
          <span class="vlore_stat_label">Entries</span>
        </div>
        ${Object.entries(st.stats.entriesByType).map(([type, count]) => `
          <div class="vlore_stat_item" data-type="${type}">
            <span class="vlore_stat_icon">${ENTITY_TYPES[type]?.icon || '📝'}</span>
            <span class="vlore_stat_num">${count}</span>
          </div>
        `).join('')}
      </div>
      
      <div class="vlore_toolbar">
        <input type="text" class="vlore_search" id="vlore_search" placeholder="Search entries..." value="${UI.searchQuery}">
        <select class="vlore_filter" id="vlore_filter">
          <option value="all" ${UI.filterType === 'all' ? 'selected' : ''}>All Types</option>
          ${Object.entries(ENTITY_TYPES).map(([type, info]) => `
            <option value="${type}" ${UI.filterType === type ? 'selected' : ''}>${info.icon} ${info.label}</option>
          `).join('')}
        </select>
      </div>
      
      <div class="vlore_entries" id="vlore_entries">
        ${filtered.length === 0 ? `
          <div class="vlore_empty">
            <div class="vlore_empty_icon">📖</div>
            <div class="vlore_empty_text">No entries yet</div>
            <div class="vlore_empty_hint">Play the game and entries will auto-generate!</div>
          </div>
        ` : filtered.map(entry => renderEntry(entry)).join('')}
      </div>
    </div>
  `;
  
  attachEventListeners();
}

function renderEntry(entry) {
  const typeInfo = ENTITY_TYPES[entry.type] || { icon: '📝', label: 'Unknown', color: '#666' };
  const date = new Date(entry.created).toLocaleDateString();
  
  return `
    <div class="vlore_entry" data-id="${entry.id}" style="border-left-color: ${typeInfo.color}">
      <div class="vlore_entry_header">
        <span class="vlore_entry_icon" style="background: ${typeInfo.color}20; color: ${typeInfo.color}">${typeInfo.icon}</span>
        <span class="vlore_entry_name">${entry.name}</span>
        <span class="vlore_entry_type">${typeInfo.label}</span>
      </div>
      <div class="vlore_entry_content">${entry.content.substring(0, 150)}${entry.content.length > 150 ? '...' : ''}</div>
      <div class="vlore_entry_footer">
        <div class="vlore_entry_keywords">
          ${entry.keywords.slice(0, 5).map(k => `<span class="vlore_keyword">${k}</span>`).join('')}
        </div>
        <span class="vlore_entry_date">${date}</span>
      </div>
      <div class="vlore_entry_actions">
        <button class="vlore_action_btn" data-action="edit" title="Edit">✏️</button>
        <button class="vlore_action_btn" data-action="copy" title="Copy">📋</button>
        <button class="vlore_action_btn vlore_action_delete" data-action="delete" title="Delete">🗑️</button>
      </div>
    </div>
  `;
}

function attachEventListeners() {
  document.getElementById('vlore_btn_close')?.addEventListener('click', togglePanel);
  document.getElementById('vlore_btn_settings')?.addEventListener('click', showSettingsModal);
  
  document.getElementById('vlore_search')?.addEventListener('input', (e) => {
    UI.searchQuery = e.target.value;
    render();
  });
  
  document.getElementById('vlore_filter')?.addEventListener('change', (e) => {
    UI.filterType = e.target.value;
    render();
  });
  
  // Entry actions
  document.querySelectorAll('.vlore_entry').forEach(el => {
    el.querySelectorAll('.vlore_action_btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const entryId = el.dataset.id;
        
        if (action === 'delete') {
          await deleteEntry(entryId);
        } else if (action === 'copy') {
          copyEntry(entryId);
        } else if (action === 'edit') {
          showEditModal(entryId);
        }
      });
    });
  });
}

async function deleteEntry(entryId) {
  const st = getChatState();
  const entry = st.entries[entryId];
  if (!entry) return;
  
  if (!confirm(`Delete "${entry.name}"?`)) return;
  
  // Remove from known entities
  const normalized = normalizeEntityName(entry.name);
  delete st.knownEntities[normalized];
  
  // Remove from entries
  delete st.entries[entryId];
  
  // Update stats
  st.stats.totalEntries--;
  if (st.stats.entriesByType[entry.type]) {
    st.stats.entriesByType[entry.type]--;
  }
  
  await commitState(st);
  render();
}

function copyEntry(entryId) {
  const st = getChatState();
  const entry = st.entries[entryId];
  if (!entry) return;
  
  const text = `# ${entry.name}\n\n${entry.content}\n\nKeywords: ${entry.keywords.join(', ')}`;
  navigator.clipboard.writeText(text);
  
  showToast('Copied to clipboard!', '📋');
}

function showEditModal(entryId) {
  const st = getChatState();
  const entry = st.entries[entryId];
  if (!entry) return;
  
  const modal = document.createElement('div');
  modal.className = 'vlore_modal';
  modal.innerHTML = `
    <div class="vlore_modal_content">
      <div class="vlore_modal_header">
        <span>✏️ Edit Entry</span>
        <button class="vlore_modal_close">✕</button>
      </div>
      <div class="vlore_modal_body">
        <div class="vlore_form_group">
          <label>Name</label>
          <input type="text" id="vlore_edit_name" value="${entry.name}">
        </div>
        <div class="vlore_form_group">
          <label>Type</label>
          <select id="vlore_edit_type">
            ${Object.entries(ENTITY_TYPES).map(([type, info]) => `
              <option value="${type}" ${type === entry.type ? 'selected' : ''}>${info.icon} ${info.label}</option>
            `).join('')}
          </select>
        </div>
        <div class="vlore_form_group">
          <label>Content</label>
          <textarea id="vlore_edit_content" rows="5">${entry.content}</textarea>
        </div>
        <div class="vlore_form_group">
          <label>Keywords (comma-separated)</label>
          <input type="text" id="vlore_edit_keywords" value="${entry.keywords.join(', ')}">
        </div>
      </div>
      <div class="vlore_modal_footer">
        <button class="vlore_btn vlore_btn_secondary vlore_modal_cancel">Cancel</button>
        <button class="vlore_btn vlore_btn_primary" id="vlore_edit_save">Save</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  modal.querySelector('.vlore_modal_close').addEventListener('click', () => modal.remove());
  modal.querySelector('.vlore_modal_cancel').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  
  modal.querySelector('#vlore_edit_save').addEventListener('click', async () => {
    const st = getChatState();
    const entry = st.entries[entryId];
    if (!entry) return;
    
    // Update entry
    entry.name = document.getElementById('vlore_edit_name').value.trim();
    entry.type = document.getElementById('vlore_edit_type').value;
    entry.content = document.getElementById('vlore_edit_content').value.trim();
    entry.keywords = document.getElementById('vlore_edit_keywords').value.split(',').map(k => k.trim()).filter(k => k);
    entry.updated = Date.now();
    
    await commitState(st);
    modal.remove();
    render();
  });
}

function showSettingsModal() {
  const st = getChatState();
  
  const modal = document.createElement('div');
  modal.className = 'vlore_modal';
  modal.innerHTML = `
    <div class="vlore_modal_content">
      <div class="vlore_modal_header">
        <span>⚙️ Auto-Lorebook Settings</span>
        <button class="vlore_modal_close">✕</button>
      </div>
      <div class="vlore_modal_body">
        <div class="vlore_setting">
          <label>
            <input type="checkbox" id="vlore_set_notify" ${st.settings.notifyOnCreate ? 'checked' : ''}>
            Show notifications when entries are created
          </label>
        </div>
        <div class="vlore_setting">
          <label>
            <input type="checkbox" id="vlore_set_autolore" ${st.settings.autoCreateLorebook ? 'checked' : ''}>
            Auto-add to SillyTavern lorebook
          </label>
        </div>
        
        <div class="vlore_setting_divider">Capture Types</div>
        
        <div class="vlore_setting">
          <label><input type="checkbox" id="vlore_set_npcs" ${st.settings.captureNpcs ? 'checked' : ''}> 👤 NPCs</label>
        </div>
        <div class="vlore_setting">
          <label><input type="checkbox" id="vlore_set_locations" ${st.settings.captureLocations ? 'checked' : ''}> 📍 Locations</label>
        </div>
        <div class="vlore_setting">
          <label><input type="checkbox" id="vlore_set_items" ${st.settings.captureItems ? 'checked' : ''}> 🎒 Items</label>
        </div>
        <div class="vlore_setting">
          <label><input type="checkbox" id="vlore_set_factions" ${st.settings.captureFactions ? 'checked' : ''}> 🏛️ Factions</label>
        </div>
        <div class="vlore_setting">
          <label><input type="checkbox" id="vlore_set_creatures" ${st.settings.captureCreatures ? 'checked' : ''}> 🐉 Creatures</label>
        </div>
        <div class="vlore_setting">
          <label><input type="checkbox" id="vlore_set_events" ${st.settings.captureEvents ? 'checked' : ''}> ⚡ Events</label>
        </div>
        <div class="vlore_setting">
          <label><input type="checkbox" id="vlore_set_lore" ${st.settings.captureLore ? 'checked' : ''}> 📜 Lore</label>
        </div>
      </div>
      <div class="vlore_modal_footer">
        <button class="vlore_btn vlore_btn_secondary vlore_modal_cancel">Cancel</button>
        <button class="vlore_btn vlore_btn_primary" id="vlore_settings_save">Save</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  modal.querySelector('.vlore_modal_close').addEventListener('click', () => modal.remove());
  modal.querySelector('.vlore_modal_cancel').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  
  modal.querySelector('#vlore_settings_save').addEventListener('click', async () => {
    const st = getChatState();
    
    st.settings.notifyOnCreate = document.getElementById('vlore_set_notify').checked;
    st.settings.autoCreateLorebook = document.getElementById('vlore_set_autolore').checked;
    st.settings.captureNpcs = document.getElementById('vlore_set_npcs').checked;
    st.settings.captureLocations = document.getElementById('vlore_set_locations').checked;
    st.settings.captureItems = document.getElementById('vlore_set_items').checked;
    st.settings.captureFactions = document.getElementById('vlore_set_factions').checked;
    st.settings.captureCreatures = document.getElementById('vlore_set_creatures').checked;
    st.settings.captureEvents = document.getElementById('vlore_set_events').checked;
    st.settings.captureLore = document.getElementById('vlore_set_lore').checked;
    
    await commitState(st);
    modal.remove();
    showToast('Settings saved!', '✓');
  });
}

function showEntryNotification(entry) {
  const typeInfo = ENTITY_TYPES[entry.type] || { icon: '📝' };
  showToast(`New: ${entry.name}`, typeInfo.icon);
}

function showToast(message, icon = '📖') {
  const toast = document.createElement('div');
  toast.className = 'vlore_toast';
  toast.innerHTML = `
    <span class="vlore_toast_icon">${icon}</span>
    <span class="vlore_toast_text">${message}</span>
  `;
  
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('vlore_toast_show'), 10);
  setTimeout(() => {
    toast.classList.remove('vlore_toast_show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ══════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════════════════════════

window.VAutoLore = {
  open: () => { UI.panelOpen = true; UI.root?.classList.remove('vlore_hidden'); render(); },
  close: () => { UI.panelOpen = false; UI.root?.classList.add('vlore_hidden'); },
  toggle: togglePanel,
  
  getState: getChatState,
  getEntries: () => Object.values(getChatState().entries),
  getEntry: (id) => getChatState().entries[id],
  
  processMessage,
  detectEntities,
  
  addEntry: async (entityData) => {
    const entry = createLoreEntry(entityData);
    const st = getChatState();
    st.entries[entry.id] = entry;
    st.knownEntities[normalizeEntityName(entry.name)] = entry.id;
    st.stats.totalEntries++;
    st.stats.entriesByType[entry.type] = (st.stats.entriesByType[entry.type] || 0) + 1;
    await commitState(st);
    if (UI.panelOpen) render();
    return entry;
  },
  
  render,
};

// ══════════════════════════════════════════════════════════════════════════════
// LIFECYCLE
// ══════════════════════════════════════════════════════════════════════════════

function registerEvents() {
  if (!eventSource || !event_types) return;
  
  eventSource.on(event_types.CHAT_CHANGED, () => {
    console.log('[AutoLore] Chat changed');
    if (UI.panelOpen) render();
  });
  
  // Parse every message for new entities!
  eventSource.on(event_types.MESSAGE_RECEIVED, () => {
    setTimeout(async () => {
      try {
        const ctx = SillyTavern?.getContext ? SillyTavern.getContext() : (getContext ? getContext() : null);
        if (!ctx?.chat || ctx.chat.length === 0) return;
        
        const lastMessage = ctx.chat[ctx.chat.length - 1];
        if (!lastMessage?.mes) return;
        
        await processMessage(lastMessage.mes, ctx.chat.length - 1);
      } catch (e) {
        console.error('[AutoLore] Parse error:', e);
      }
    }, 500);
  });
  
  // Subscribe to Journey Tracker
  setTimeout(subscribeToJourney, 500);
}

(async function main() {
  console.log('[AutoLore] Loading...');
  try {
    mountUI();
    registerEvents();
    console.log('[AutoLore] Ready!');
  } catch (e) {
    console.error('[AutoLore] Init failed:', e);
  }
})();
