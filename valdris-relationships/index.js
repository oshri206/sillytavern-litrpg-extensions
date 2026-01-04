/**
 * Valdris NPC Relationship Web
 * ============================
 * Visual network graph of NPCs, their relationships to each other,
 * and their disposition toward the player.
 * 
 * Features:
 * - Auto-detects NPCs from Journey Tracker
 * - Visual web/graph layout
 * - Relationship lines between connected NPCs
 * - Player disposition tracking
 * - Manual NPC addition
 * - Click to view/edit NPC details
 * - Drag nodes to rearrange
 */

const EXT_NAME = 'valdris-relationships';
const META_KEY = 'vrel_state_v1';

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
  console.error('[Relationships] Failed to import extensions.js', e);
}

try {
  const scriptModule = await import('../../../../script.js');
  eventSource = scriptModule.eventSource;
  event_types = scriptModule.event_types;
  if (!saveSettingsDebounced) saveSettingsDebounced = scriptModule.saveSettingsDebounced;
} catch (e) {
  console.error('[Relationships] Failed to import script.js', e);
}

// ══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════════════════════

const DISPOSITION_LEVELS = {
  hostile: { value: -100, label: 'Hostile', color: '#dc2626', icon: '💀' },
  unfriendly: { value: -50, label: 'Unfriendly', color: '#ea580c', icon: '😠' },
  wary: { value: -25, label: 'Wary', color: '#f59e0b', icon: '🤨' },
  neutral: { value: 0, label: 'Neutral', color: '#6b7280', icon: '😐' },
  acquaintance: { value: 25, label: 'Acquaintance', color: '#3b82f6', icon: '🤝' },
  friendly: { value: 50, label: 'Friendly', color: '#22c55e', icon: '😊' },
  close: { value: 75, label: 'Close', color: '#a855f7', icon: '💜' },
  devoted: { value: 100, label: 'Devoted', color: '#ec4899', icon: '💖' },
};

const RELATIONSHIP_TYPES = {
  family: { label: 'Family', color: '#ec4899', icon: '👨‍👩‍👧', lineStyle: 'solid' },
  romantic: { label: 'Romantic', color: '#f43f5e', icon: '💕', lineStyle: 'solid' },
  friend: { label: 'Friend', color: '#22c55e', icon: '🤝', lineStyle: 'solid' },
  ally: { label: 'Ally', color: '#3b82f6', icon: '🛡️', lineStyle: 'dashed' },
  rival: { label: 'Rival', color: '#f59e0b', icon: '⚔️', lineStyle: 'dashed' },
  enemy: { label: 'Enemy', color: '#dc2626', icon: '💀', lineStyle: 'dotted' },
  employer: { label: 'Employer', color: '#8b5cf6', icon: '💼', lineStyle: 'solid' },
  employee: { label: 'Employee', color: '#8b5cf6', icon: '👷', lineStyle: 'solid' },
  mentor: { label: 'Mentor', color: '#06b6d4', icon: '📚', lineStyle: 'solid' },
  student: { label: 'Student', color: '#06b6d4', icon: '🎓', lineStyle: 'solid' },
  acquaintance: { label: 'Acquaintance', color: '#6b7280', icon: '👋', lineStyle: 'dotted' },
  unknown: { label: 'Unknown', color: '#374151', icon: '❓', lineStyle: 'dotted' },
};

const NPC_ROLES = [
  'Merchant', 'Guard', 'Noble', 'Commoner', 'Adventurer', 'Mage', 'Priest',
  'Innkeeper', 'Blacksmith', 'Thief', 'Assassin', 'Knight', 'Soldier', 'Captain',
  'Scholar', 'Alchemist', 'Bard', 'Hunter', 'Farmer', 'Healer', 'Spy',
  'King', 'Queen', 'Prince', 'Princess', 'Lord', 'Lady', 'Elder', 'Chief',
  'Guildmaster', 'Shopkeeper', 'Bartender', 'Courier', 'Hermit', 'Wanderer',
  'Other',
];

// ══════════════════════════════════════════════════════════════════════════════
// RELATIONSHIP PARSING PATTERNS
// ══════════════════════════════════════════════════════════════════════════════

const RELATIONSHIP_PATTERNS = {
  // Vex-style explicit: [Character relationship: Elena +10] or [Elena: Friendly (65/100)]
  explicitChange: /\[(?:Character\s+)?[Rr]elationship:\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*([+-]\d+)\]/g,
  explicitStatus: /\[([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?):\s*(\w+)\s*\((-?\d+)\/100\)\]/g,
  
  // Faction reputation style: [Faction reputation: Free Cities +5]
  factionRep: /\[Faction\s+reputation:\s*([^+-]+)\s*([+-]\d+)\]/g,
  
  // NPC-to-NPC relationship hints: "Elena is [Name]'s sister" or "[Name] and [Name] are rivals"
  npcRelationHint: /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:is|are)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)'s\s+(mother|father|sister|brother|spouse|wife|husband|friend|rival|enemy|mentor|student|employer|ally)/gi,
  npcRelationAre: /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+and\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+are\s+(friends|rivals|enemies|siblings|lovers|married|allies)/gi,
};

// Sentiment patterns for automatic disposition changes
const SENTIMENT_PATTERNS = {
  veryPositive: {
    patterns: [
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:hugs?|embraces?|kisses?)\s+you/gi,
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:loves?|adores?)\s+you/gi,
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:saves?|rescues?)\s+(?:your life|you)/gi,
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:confesses?|declares?)\s+(?:love|feelings)/gi,
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)'s\s+eyes\s+(?:light up|sparkle|shine)\s+(?:when|as)/gi,
    ],
    delta: 15,
  },
  positive: {
    patterns: [
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:smiles?|grins?|beams?)\s+(?:warmly|brightly|happily)?\s*(?:at you|toward you)?/gi,
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:thanks?|appreciates?)\s+you/gi,
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:nods?\s+approvingly|gives?\s+(?:a\s+)?thumbs?\s+up)/gi,
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:laughs?|chuckles?)\s+(?:warmly|with you|genuinely)/gi,
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:helps?|assists?|supports?)\s+you/gi,
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:offers?|gives?|hands?)\s+you\s+(?:a\s+)?(?:gift|present|reward)/gi,
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:trusts?|believes?\s+in)\s+you/gi,
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:welcomes?|greets?)\s+you\s+warmly/gi,
    ],
    delta: 5,
  },
  slightPositive: {
    patterns: [
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:nods?|waves?|acknowledges?)/gi,
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:seems?\s+)?(?:pleased|happy|satisfied)/gi,
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:relaxes?|softens?)/gi,
    ],
    delta: 2,
  },
  slightNegative: {
    patterns: [
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:frowns?|sighs?|looks?\s+away)/gi,
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:seems?\s+)?(?:annoyed|irritated|frustrated)/gi,
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:rolls?\s+(?:her|his|their)\s+eyes)/gi,
    ],
    delta: -2,
  },
  negative: {
    patterns: [
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:glares?|scowls?|sneers?)\s+(?:at you)?/gi,
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:insults?|mocks?|ridicules?)\s+you/gi,
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:refuses?|rejects?|denies?)\s+(?:you|your)/gi,
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:pushes?|shoves?)\s+you\s+away/gi,
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:curses?|swears?)\s+at\s+you/gi,
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:turns?\s+(?:her|his|their)\s+back)/gi,
    ],
    delta: -5,
  },
  veryNegative: {
    patterns: [
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:attacks?|strikes?|hits?)\s+you/gi,
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:betrays?|deceives?|tricks?)\s+you/gi,
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:threatens?|menaces?)\s+you/gi,
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:hates?|despises?|loathes?)\s+you/gi,
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:tries?\s+to\s+kill|attempts?\s+to\s+murder)/gi,
    ],
    delta: -15,
  },
};

// Map relationship words to types
const RELATIONSHIP_WORD_MAP = {
  mother: 'family', father: 'family', sister: 'family', brother: 'family',
  spouse: 'romantic', wife: 'romantic', husband: 'romantic', lovers: 'romantic', married: 'romantic',
  friend: 'friend', friends: 'friend',
  rival: 'rival', rivals: 'rival',
  enemy: 'enemy', enemies: 'enemy',
  mentor: 'mentor', student: 'student',
  employer: 'employer', employee: 'employee',
  ally: 'ally', allies: 'ally',
  siblings: 'family',
};

// ══════════════════════════════════════════════════════════════════════════════
// STATE MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════

function newEmptyState() {
  return {
    version: 1,
    npcs: {},           // { npcId: { name, role, faction, location, disposition, notes, portrait, x, y } }
    relationships: [],  // [{ from: npcId, to: npcId, type: relationshipType, notes }]
    playerName: 'Player',
    lastUpdated: Date.now(),
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
  state.lastUpdated = Date.now();
  const md = getChatMetadata();
  if (md) md[META_KEY] = state;
  await saveChatMetadata();
}

// ══════════════════════════════════════════════════════════════════════════════
// AUTOMATIC RELATIONSHIP PARSING
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Parse a message for relationship changes and update state automatically
 * @param {string} text - The narrative message to parse
 * @returns {object} Changes detected
 */
function parseRelationshipEvents(text) {
  const changes = {
    dispositionChanges: [],  // { npcName, delta, reason }
    relationshipHints: [],   // { npc1, npc2, type }
    newNpcs: [],
  };
  
  // 1. Check for explicit Vex-style relationship changes: [Character relationship: Elena +10]
  let match;
  const explicitPattern = /\[(?:Character\s+)?[Rr]elationship:\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*([+-]\d+)\]/g;
  while ((match = explicitPattern.exec(text)) !== null) {
    changes.dispositionChanges.push({
      npcName: match[1],
      delta: parseInt(match[2]),
      reason: 'explicit',
    });
  }
  
  // 2. Check for explicit status: [Elena: Friendly (65/100)]
  const statusPattern = /\[([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?):\s*(\w+)\s*\((-?\d+)\/100\)\]/g;
  while ((match = statusPattern.exec(text)) !== null) {
    changes.dispositionChanges.push({
      npcName: match[1],
      absoluteValue: parseInt(match[3]),
      reason: 'status_update',
    });
  }
  
  // 3. Check sentiment patterns for implicit disposition changes
  for (const [sentiment, config] of Object.entries(SENTIMENT_PATTERNS)) {
    for (const pattern of config.patterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      while ((match = regex.exec(text)) !== null) {
        const npcName = match[1];
        // Avoid duplicates for same NPC in same message
        if (!changes.dispositionChanges.find(c => c.npcName === npcName && c.reason === sentiment)) {
          changes.dispositionChanges.push({
            npcName,
            delta: config.delta,
            reason: sentiment,
          });
        }
      }
    }
  }
  
  // 4. Check for NPC-to-NPC relationship hints: "Elena is Marcus's sister"
  const npcRelPattern1 = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:is|are)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)'s\s+(mother|father|sister|brother|spouse|wife|husband|friend|rival|enemy|mentor|student|employer|ally)/gi;
  while ((match = npcRelPattern1.exec(text)) !== null) {
    const relType = RELATIONSHIP_WORD_MAP[match[3].toLowerCase()] || 'acquaintance';
    changes.relationshipHints.push({
      npc1: match[1],
      npc2: match[2],
      type: relType,
      description: match[3],
    });
  }
  
  // 5. Check for "X and Y are friends/rivals/etc"
  const npcRelPattern2 = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+and\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+are\s+(friends|rivals|enemies|siblings|lovers|married|allies)/gi;
  while ((match = npcRelPattern2.exec(text)) !== null) {
    const relType = RELATIONSHIP_WORD_MAP[match[3].toLowerCase()] || 'acquaintance';
    changes.relationshipHints.push({
      npc1: match[1],
      npc2: match[2],
      type: relType,
      description: match[3],
    });
  }
  
  return changes;
}

/**
 * Apply parsed relationship changes to state
 */
async function applyRelationshipChanges(changes) {
  const st = getChatState();
  let updated = false;
  const notifications = [];
  
  // Apply disposition changes
  for (const change of changes.dispositionChanges) {
    // Find NPC by name
    const npc = Object.values(st.npcs).find(
      n => n.name.toLowerCase() === change.npcName.toLowerCase()
    );
    
    if (npc) {
      const oldDisp = npc.disposition;
      
      if (change.absoluteValue !== undefined) {
        // Set to absolute value
        npc.disposition = Math.max(-100, Math.min(100, change.absoluteValue));
      } else {
        // Apply delta
        npc.disposition = Math.max(-100, Math.min(100, npc.disposition + change.delta));
      }
      
      if (npc.disposition !== oldDisp) {
        updated = true;
        const oldLevel = getDispositionLevel(oldDisp);
        const newLevel = getDispositionLevel(npc.disposition);
        
        if (oldLevel.label !== newLevel.label) {
          notifications.push({
            npc: npc.name,
            from: oldLevel,
            to: newLevel,
            delta: change.delta,
          });
        }
        
        console.log(`[Relationships] ${npc.name}: ${oldDisp} → ${npc.disposition} (${change.reason})`);
      }
    }
  }
  
  // Apply NPC-to-NPC relationship hints
  for (const hint of changes.relationshipHints) {
    // Find both NPCs
    const npc1 = Object.values(st.npcs).find(
      n => n.name.toLowerCase() === hint.npc1.toLowerCase()
    );
    const npc2 = Object.values(st.npcs).find(
      n => n.name.toLowerCase() === hint.npc2.toLowerCase()
    );
    
    if (npc1 && npc2) {
      // Check if relationship already exists
      const existing = st.relationships.find(
        r => (r.from === npc1.id && r.to === npc2.id) || (r.from === npc2.id && r.to === npc1.id)
      );
      
      if (!existing) {
        st.relationships.push({
          from: npc1.id,
          to: npc2.id,
          type: hint.type,
          notes: `Discovered: ${hint.description}`,
        });
        updated = true;
        console.log(`[Relationships] Discovered: ${npc1.name} ↔ ${npc2.name} (${hint.type})`);
      }
    }
  }
  
  if (updated) {
    await commitState(st);
    if (UI.panelOpen) render();
    
    // Show notifications for significant changes
    for (const notif of notifications) {
      showRelationshipNotification(notif);
    }
  }
  
  return { updated, notifications };
}

/**
 * Show a notification when relationship status changes significantly
 */
function showRelationshipNotification(notif) {
  const direction = notif.delta > 0 ? '📈' : '📉';
  const message = `${notif.npc}: ${notif.from.icon} ${notif.from.label} → ${notif.to.icon} ${notif.to.label}`;
  
  // Create toast notification
  const toast = document.createElement('div');
  toast.className = 'vrel_toast';
  toast.innerHTML = `
    <span class="vrel_toast_icon">${direction}</span>
    <span class="vrel_toast_text">${message}</span>
  `;
  
  document.body.appendChild(toast);
  
  // Animate in
  setTimeout(() => toast.classList.add('vrel_toast_show'), 10);
  
  // Remove after 4 seconds
  setTimeout(() => {
    toast.classList.remove('vrel_toast_show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ══════════════════════════════════════════════════════════════════════════════
// NPC MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════

function generateNpcId(name) {
  return `npc_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`;
}

function addNpc(st, npcData) {
  const id = generateNpcId(npcData.name);
  
  // Check if NPC with same name exists
  const existing = Object.values(st.npcs).find(
    n => n.name.toLowerCase() === npcData.name.toLowerCase()
  );
  if (existing) {
    console.log('[Relationships] NPC already exists:', npcData.name);
    return existing;
  }
  
  // Position new NPC randomly in the web area
  const angle = Math.random() * Math.PI * 2;
  const radius = 100 + Math.random() * 150;
  
  st.npcs[id] = {
    id,
    name: npcData.name,
    role: npcData.role || 'Unknown',
    faction: npcData.faction || null,
    location: npcData.location || null,
    disposition: npcData.disposition || 0,
    notes: npcData.notes || '',
    portrait: npcData.portrait || null,
    firstMet: npcData.firstMet || Date.now(),
    lastSeen: Date.now(),
    x: 300 + Math.cos(angle) * radius,
    y: 250 + Math.sin(angle) * radius,
  };
  
  console.log('[Relationships] Added NPC:', st.npcs[id]);
  return st.npcs[id];
}

function updateNpc(st, npcId, updates) {
  if (!st.npcs[npcId]) return null;
  
  Object.assign(st.npcs[npcId], updates);
  st.npcs[npcId].lastSeen = Date.now();
  
  return st.npcs[npcId];
}

function removeNpc(st, npcId) {
  if (!st.npcs[npcId]) return false;
  
  // Remove all relationships involving this NPC
  st.relationships = st.relationships.filter(
    r => r.from !== npcId && r.to !== npcId
  );
  
  delete st.npcs[npcId];
  return true;
}

function addRelationship(st, fromId, toId, type, notes = '') {
  // Check if relationship already exists
  const existing = st.relationships.find(
    r => (r.from === fromId && r.to === toId) || (r.from === toId && r.to === fromId)
  );
  
  if (existing) {
    existing.type = type;
    existing.notes = notes;
    return existing;
  }
  
  const rel = { from: fromId, to: toId, type, notes };
  st.relationships.push(rel);
  return rel;
}

function removeRelationship(st, fromId, toId) {
  st.relationships = st.relationships.filter(
    r => !((r.from === fromId && r.to === toId) || (r.from === toId && r.to === fromId))
  );
}

function getDispositionLevel(value) {
  if (value <= -75) return DISPOSITION_LEVELS.hostile;
  if (value <= -40) return DISPOSITION_LEVELS.unfriendly;
  if (value <= -10) return DISPOSITION_LEVELS.wary;
  if (value <= 10) return DISPOSITION_LEVELS.neutral;
  if (value <= 35) return DISPOSITION_LEVELS.acquaintance;
  if (value <= 60) return DISPOSITION_LEVELS.friendly;
  if (value <= 85) return DISPOSITION_LEVELS.close;
  return DISPOSITION_LEVELS.devoted;
}

// ══════════════════════════════════════════════════════════════════════════════
// UI
// ══════════════════════════════════════════════════════════════════════════════

const UI = {
  mounted: false,
  root: null,
  panelOpen: false,
  selectedNpc: null,
  draggingNpc: null,
  dragOffset: { x: 0, y: 0 },
  connecting: null,  // NPC we're drawing a connection from
  zoom: 1,
  pan: { x: 0, y: 0 },
};

function mountUI() {
  if (UI.mounted) return;
  
  // Launcher button
  const launcher = document.createElement('div');
  launcher.id = 'vrel_launcher';
  launcher.innerHTML = '🕸️';
  launcher.title = 'NPC Relationship Web';
  launcher.addEventListener('click', togglePanel);
  document.body.appendChild(launcher);
  
  // Main panel
  const root = document.createElement('div');
  root.id = 'vrel_root';
  root.className = 'vrel_hidden';
  root.innerHTML = `
    <div class="vrel_panel">
      <div class="vrel_header">
        <span class="vrel_title">🕸️ Relationship Web</span>
        <div class="vrel_header_btns">
          <button class="vrel_btn" id="vrel_btn_add" title="Add NPC">➕ Add NPC</button>
          <button class="vrel_btn vrel_btn_close" id="vrel_btn_close" title="Close">✕</button>
        </div>
      </div>
      
      <div class="vrel_toolbar">
        <span id="vrel_npc_count">0 NPCs</span>
        <div class="vrel_zoom_controls">
          <button class="vrel_zoom_btn" id="vrel_zoom_out">−</button>
          <span id="vrel_zoom_level">100%</span>
          <button class="vrel_zoom_btn" id="vrel_zoom_in">+</button>
        </div>
      </div>
      
      <div class="vrel_web_container" id="vrel_web_container">
        <svg class="vrel_lines" id="vrel_lines"></svg>
        <div class="vrel_nodes" id="vrel_nodes"></div>
        <div class="vrel_player_node" id="vrel_player">
          <div class="vrel_player_icon">⭐</div>
          <div class="vrel_player_label">You</div>
        </div>
      </div>
      
      <div class="vrel_details" id="vrel_details"></div>
    </div>
  `;
  
  document.body.appendChild(root);
  UI.root = root;
  UI.mounted = true;
  
  attachEventListeners();
  console.log('[Relationships] UI mounted');
}

function attachEventListeners() {
  document.getElementById('vrel_btn_close').addEventListener('click', togglePanel);
  document.getElementById('vrel_btn_add').addEventListener('click', showAddNpcModal);
  document.getElementById('vrel_zoom_in').addEventListener('click', () => adjustZoom(0.1));
  document.getElementById('vrel_zoom_out').addEventListener('click', () => adjustZoom(-0.1));
  
  const container = document.getElementById('vrel_web_container');
  
  // Pan the view
  let isPanning = false;
  let panStart = { x: 0, y: 0 };
  
  container.addEventListener('mousedown', (e) => {
    if (e.target === container || e.target.classList.contains('vrel_lines')) {
      isPanning = true;
      panStart = { x: e.clientX - UI.pan.x, y: e.clientY - UI.pan.y };
      container.style.cursor = 'grabbing';
    }
  });
  
  container.addEventListener('mousemove', (e) => {
    if (isPanning) {
      UI.pan.x = e.clientX - panStart.x;
      UI.pan.y = e.clientY - panStart.y;
      updateWebTransform();
    }
  });
  
  container.addEventListener('mouseup', () => {
    isPanning = false;
    container.style.cursor = 'grab';
  });
  
  container.addEventListener('mouseleave', () => {
    isPanning = false;
    container.style.cursor = 'grab';
  });
  
  // Zoom with scroll
  container.addEventListener('wheel', (e) => {
    e.preventDefault();
    adjustZoom(e.deltaY > 0 ? -0.1 : 0.1);
  });
}

function adjustZoom(delta) {
  UI.zoom = Math.max(0.3, Math.min(2, UI.zoom + delta));
  document.getElementById('vrel_zoom_level').textContent = `${Math.round(UI.zoom * 100)}%`;
  updateWebTransform();
}

function updateWebTransform() {
  const nodes = document.getElementById('vrel_nodes');
  const lines = document.getElementById('vrel_lines');
  const player = document.getElementById('vrel_player');
  
  const transform = `translate(${UI.pan.x}px, ${UI.pan.y}px) scale(${UI.zoom})`;
  nodes.style.transform = transform;
  lines.style.transform = transform;
  player.style.transform = transform;
}

function togglePanel() {
  UI.panelOpen = !UI.panelOpen;
  UI.root.classList.toggle('vrel_hidden', !UI.panelOpen);
  if (UI.panelOpen) {
    render();
  }
}

function render() {
  const st = getChatState();
  
  // Update NPC count
  const count = Object.keys(st.npcs).length;
  document.getElementById('vrel_npc_count').textContent = `${count} NPC${count !== 1 ? 's' : ''}`;
  
  renderNodes(st);
  renderLines(st);
  renderDetails(st);
}

function renderNodes(st) {
  const container = document.getElementById('vrel_nodes');
  container.innerHTML = '';
  
  for (const [id, npc] of Object.entries(st.npcs)) {
    const dispLevel = getDispositionLevel(npc.disposition);
    
    const node = document.createElement('div');
    node.className = `vrel_node ${UI.selectedNpc === id ? 'vrel_selected' : ''}`;
    node.dataset.npcId = id;
    node.style.left = `${npc.x}px`;
    node.style.top = `${npc.y}px`;
    node.style.borderColor = dispLevel.color;
    
    node.innerHTML = `
      <div class="vrel_node_portrait" style="background-color: ${dispLevel.color}20">
        ${npc.portrait ? `<img src="${npc.portrait}" alt="${npc.name}">` : dispLevel.icon}
      </div>
      <div class="vrel_node_name">${npc.name}</div>
      <div class="vrel_node_role">${npc.role || ''}</div>
    `;
    
    // Click to select
    node.addEventListener('click', (e) => {
      e.stopPropagation();
      if (UI.connecting) {
        // Finish connection
        showConnectModal(UI.connecting, id);
        UI.connecting = null;
        document.querySelectorAll('.vrel_node').forEach(n => n.classList.remove('vrel_connecting'));
      } else {
        selectNpc(id);
      }
    });
    
    // Drag to move
    node.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      
      UI.draggingNpc = id;
      const rect = node.getBoundingClientRect();
      UI.dragOffset = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
      node.classList.add('vrel_dragging');
    });
    
    container.appendChild(node);
  }
  
  // Global mouse handlers for dragging
  document.addEventListener('mousemove', handleNodeDrag);
  document.addEventListener('mouseup', handleNodeDragEnd);
}

function handleNodeDrag(e) {
  if (!UI.draggingNpc) return;
  
  const container = document.getElementById('vrel_web_container');
  const containerRect = container.getBoundingClientRect();
  
  const st = getChatState();
  const npc = st.npcs[UI.draggingNpc];
  if (!npc) return;
  
  // Calculate new position accounting for zoom and pan
  npc.x = (e.clientX - containerRect.left - UI.pan.x) / UI.zoom - UI.dragOffset.x + 40;
  npc.y = (e.clientY - containerRect.top - UI.pan.y) / UI.zoom - UI.dragOffset.y + 40;
  
  // Update node position
  const node = document.querySelector(`[data-npc-id="${UI.draggingNpc}"]`);
  if (node) {
    node.style.left = `${npc.x}px`;
    node.style.top = `${npc.y}px`;
  }
  
  // Update lines
  renderLines(st);
}

async function handleNodeDragEnd() {
  if (!UI.draggingNpc) return;
  
  const node = document.querySelector(`[data-npc-id="${UI.draggingNpc}"]`);
  if (node) node.classList.remove('vrel_dragging');
  
  const st = getChatState();
  await commitState(st);
  
  UI.draggingNpc = null;
}

function renderLines(st) {
  const svg = document.getElementById('vrel_lines');
  svg.innerHTML = '';
  
  const playerNode = document.getElementById('vrel_player');
  const playerRect = { x: 300, y: 250 };  // Player is at center
  
  // Draw lines from player to each NPC (disposition lines)
  for (const [id, npc] of Object.entries(st.npcs)) {
    const dispLevel = getDispositionLevel(npc.disposition);
    
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', playerRect.x);
    line.setAttribute('y1', playerRect.y);
    line.setAttribute('x2', npc.x + 40);
    line.setAttribute('y2', npc.y + 40);
    line.setAttribute('stroke', dispLevel.color);
    line.setAttribute('stroke-width', '2');
    line.setAttribute('stroke-opacity', '0.4');
    line.setAttribute('stroke-dasharray', npc.disposition < 0 ? '5,5' : 'none');
    
    svg.appendChild(line);
  }
  
  // Draw relationship lines between NPCs
  for (const rel of st.relationships) {
    const fromNpc = st.npcs[rel.from];
    const toNpc = st.npcs[rel.to];
    if (!fromNpc || !toNpc) continue;
    
    const relType = RELATIONSHIP_TYPES[rel.type] || RELATIONSHIP_TYPES.unknown;
    
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', fromNpc.x + 40);
    line.setAttribute('y1', fromNpc.y + 40);
    line.setAttribute('x2', toNpc.x + 40);
    line.setAttribute('y2', toNpc.y + 40);
    line.setAttribute('stroke', relType.color);
    line.setAttribute('stroke-width', '3');
    
    if (relType.lineStyle === 'dashed') {
      line.setAttribute('stroke-dasharray', '10,5');
    } else if (relType.lineStyle === 'dotted') {
      line.setAttribute('stroke-dasharray', '3,3');
    }
    
    svg.appendChild(line);
    
    // Add relationship icon at midpoint
    const midX = (fromNpc.x + toNpc.x) / 2 + 40;
    const midY = (fromNpc.y + toNpc.y) / 2 + 40;
    
    const iconGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    iconGroup.innerHTML = `
      <circle cx="${midX}" cy="${midY}" r="12" fill="#1e1e2e" stroke="${relType.color}" stroke-width="2"/>
      <text x="${midX}" y="${midY}" text-anchor="middle" dominant-baseline="central" font-size="12">${relType.icon}</text>
    `;
    svg.appendChild(iconGroup);
  }
}

function renderDetails(st) {
  const container = document.getElementById('vrel_details');
  
  if (!UI.selectedNpc || !st.npcs[UI.selectedNpc]) {
    container.innerHTML = `
      <div class="vrel_details_empty">
        Click an NPC to view details
      </div>
    `;
    return;
  }
  
  const npc = st.npcs[UI.selectedNpc];
  const dispLevel = getDispositionLevel(npc.disposition);
  
  // Get relationships for this NPC
  const rels = st.relationships.filter(r => r.from === UI.selectedNpc || r.to === UI.selectedNpc);
  
  container.innerHTML = `
    <div class="vrel_detail_card">
      <div class="vrel_detail_header">
        <div class="vrel_detail_portrait" style="background-color: ${dispLevel.color}30; border-color: ${dispLevel.color}">
          ${dispLevel.icon}
        </div>
        <div class="vrel_detail_info">
          <div class="vrel_detail_name">${npc.name}</div>
          <div class="vrel_detail_role">${npc.role || 'Unknown'}</div>
          ${npc.faction ? `<div class="vrel_detail_faction">🏛️ ${npc.faction}</div>` : ''}
        </div>
        <div class="vrel_detail_actions">
          <button class="vrel_action_btn" id="vrel_edit_btn" title="Edit">✏️</button>
          <button class="vrel_action_btn" id="vrel_connect_btn" title="Add Connection">🔗</button>
          <button class="vrel_action_btn vrel_action_delete" id="vrel_delete_btn" title="Delete">🗑️</button>
        </div>
      </div>
      
      <div class="vrel_disposition_section">
        <label>Disposition toward you: <span class="vrel_auto_label">(auto-tracked)</span></label>
        <div class="vrel_disposition_bar">
          <div class="vrel_disposition_fill" style="width: ${(npc.disposition + 100) / 2}%; background: ${dispLevel.color}"></div>
          <div class="vrel_disposition_marker" style="left: ${(npc.disposition + 100) / 2}%"></div>
        </div>
        <div class="vrel_disposition_label" style="color: ${dispLevel.color}">
          ${dispLevel.icon} ${dispLevel.label} (${npc.disposition > 0 ? '+' : ''}${npc.disposition})
        </div>
      </div>
      
      ${npc.location ? `<div class="vrel_detail_row">📍 Last seen: ${npc.location}</div>` : ''}
      
      ${npc.notes ? `
        <div class="vrel_notes_section">
          <label>Notes:</label>
          <div class="vrel_notes_text">${npc.notes}</div>
        </div>
      ` : ''}
      
      ${rels.length > 0 ? `
        <div class="vrel_relationships_section">
          <label>Relationships:</label>
          ${rels.map(r => {
            const otherId = r.from === UI.selectedNpc ? r.to : r.from;
            const other = st.npcs[otherId];
            if (!other) return '';
            const relType = RELATIONSHIP_TYPES[r.type] || RELATIONSHIP_TYPES.unknown;
            return `
              <div class="vrel_rel_item" data-rel-from="${r.from}" data-rel-to="${r.to}">
                <span class="vrel_rel_icon">${relType.icon}</span>
                <span class="vrel_rel_type">${relType.label}</span>
                <span class="vrel_rel_with">with ${other.name}</span>
                <button class="vrel_rel_remove" title="Remove">✕</button>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
  
  // Event listeners
  document.getElementById('vrel_edit_btn')?.addEventListener('click', () => showEditNpcModal(UI.selectedNpc));
  document.getElementById('vrel_delete_btn')?.addEventListener('click', () => deleteNpc(UI.selectedNpc));
  document.getElementById('vrel_connect_btn')?.addEventListener('click', () => startConnection(UI.selectedNpc));
  
  // Relationship remove buttons
  container.querySelectorAll('.vrel_rel_remove').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const item = btn.closest('.vrel_rel_item');
      const from = item.dataset.relFrom;
      const to = item.dataset.relTo;
      const st = getChatState();
      removeRelationship(st, from, to);
      await commitState(st);
      render();
    });
  });
}

function selectNpc(npcId) {
  UI.selectedNpc = npcId;
  render();
}

function startConnection(fromId) {
  UI.connecting = fromId;
  const node = document.querySelector(`[data-npc-id="${fromId}"]`);
  if (node) node.classList.add('vrel_connecting');
  
  // Visual feedback
  document.querySelectorAll('.vrel_node').forEach(n => {
    if (n.dataset.npcId !== fromId) {
      n.classList.add('vrel_connect_target');
    }
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// MODALS
// ══════════════════════════════════════════════════════════════════════════════

function showAddNpcModal() {
  const modal = document.createElement('div');
  modal.className = 'vrel_modal';
  modal.innerHTML = `
    <div class="vrel_modal_content">
      <div class="vrel_modal_header">
        <span>➕ Add New NPC</span>
        <button class="vrel_modal_close">✕</button>
      </div>
      <div class="vrel_modal_body">
        <div class="vrel_form_group">
          <label>Name *</label>
          <input type="text" id="vrel_add_name" placeholder="NPC name" required>
        </div>
        <div class="vrel_form_group">
          <label>Role</label>
          <select id="vrel_add_role">
            <option value="">Select role...</option>
            ${NPC_ROLES.map(r => `<option value="${r}">${r}</option>`).join('')}
          </select>
        </div>
        <div class="vrel_form_group">
          <label>Faction</label>
          <input type="text" id="vrel_add_faction" placeholder="e.g., Free Cities, Shadow Consortium">
        </div>
        <div class="vrel_form_group">
          <label>Location Met</label>
          <input type="text" id="vrel_add_location" placeholder="Where did you meet?">
        </div>
        <div class="vrel_form_group">
          <label>Initial Disposition: <span id="vrel_add_disp_val">0</span></label>
          <input type="range" id="vrel_add_disposition" min="-100" max="100" value="0">
        </div>
        <div class="vrel_form_group">
          <label>Notes</label>
          <textarea id="vrel_add_notes" rows="3" placeholder="Physical description, personality, secrets..."></textarea>
        </div>
      </div>
      <div class="vrel_modal_footer">
        <button class="vrel_btn vrel_btn_secondary vrel_modal_cancel">Cancel</button>
        <button class="vrel_btn vrel_btn_primary" id="vrel_add_submit">Add NPC</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Event listeners
  modal.querySelector('.vrel_modal_close').addEventListener('click', () => modal.remove());
  modal.querySelector('.vrel_modal_cancel').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  
  const dispSlider = modal.querySelector('#vrel_add_disposition');
  const dispVal = modal.querySelector('#vrel_add_disp_val');
  dispSlider.addEventListener('input', () => { dispVal.textContent = dispSlider.value; });
  
  modal.querySelector('#vrel_add_submit').addEventListener('click', async () => {
    const name = document.getElementById('vrel_add_name').value.trim();
    if (!name) {
      alert('Name is required!');
      return;
    }
    
    const st = getChatState();
    addNpc(st, {
      name,
      role: document.getElementById('vrel_add_role').value,
      faction: document.getElementById('vrel_add_faction').value.trim(),
      location: document.getElementById('vrel_add_location').value.trim(),
      disposition: parseInt(document.getElementById('vrel_add_disposition').value),
      notes: document.getElementById('vrel_add_notes').value.trim(),
    });
    
    await commitState(st);
    modal.remove();
    render();
  });
  
  // Focus name input
  setTimeout(() => document.getElementById('vrel_add_name').focus(), 100);
}

function showEditNpcModal(npcId) {
  const st = getChatState();
  const npc = st.npcs[npcId];
  if (!npc) return;
  
  const modal = document.createElement('div');
  modal.className = 'vrel_modal';
  modal.innerHTML = `
    <div class="vrel_modal_content">
      <div class="vrel_modal_header">
        <span>✏️ Edit ${npc.name}</span>
        <button class="vrel_modal_close">✕</button>
      </div>
      <div class="vrel_modal_body">
        <div class="vrel_form_group">
          <label>Name</label>
          <input type="text" id="vrel_edit_name" value="${npc.name}">
        </div>
        <div class="vrel_form_group">
          <label>Role</label>
          <select id="vrel_edit_role">
            <option value="">Select role...</option>
            ${NPC_ROLES.map(r => `<option value="${r}" ${r === npc.role ? 'selected' : ''}>${r}</option>`).join('')}
          </select>
        </div>
        <div class="vrel_form_group">
          <label>Faction</label>
          <input type="text" id="vrel_edit_faction" value="${npc.faction || ''}">
        </div>
        <div class="vrel_form_group">
          <label>Location</label>
          <input type="text" id="vrel_edit_location" value="${npc.location || ''}">
        </div>
        <div class="vrel_form_group">
          <label>Notes</label>
          <textarea id="vrel_edit_notes" rows="4">${npc.notes || ''}</textarea>
        </div>
      </div>
      <div class="vrel_modal_footer">
        <button class="vrel_btn vrel_btn_secondary vrel_modal_cancel">Cancel</button>
        <button class="vrel_btn vrel_btn_primary" id="vrel_edit_submit">Save</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  modal.querySelector('.vrel_modal_close').addEventListener('click', () => modal.remove());
  modal.querySelector('.vrel_modal_cancel').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  
  modal.querySelector('#vrel_edit_submit').addEventListener('click', async () => {
    const st = getChatState();
    updateNpc(st, npcId, {
      name: document.getElementById('vrel_edit_name').value.trim(),
      role: document.getElementById('vrel_edit_role').value,
      faction: document.getElementById('vrel_edit_faction').value.trim(),
      location: document.getElementById('vrel_edit_location').value.trim(),
      notes: document.getElementById('vrel_edit_notes').value.trim(),
    });
    
    await commitState(st);
    modal.remove();
    render();
  });
}

function showConnectModal(fromId, toId) {
  const st = getChatState();
  const fromNpc = st.npcs[fromId];
  const toNpc = st.npcs[toId];
  if (!fromNpc || !toNpc) return;
  
  // Check existing relationship
  const existing = st.relationships.find(
    r => (r.from === fromId && r.to === toId) || (r.from === toId && r.to === fromId)
  );
  
  const modal = document.createElement('div');
  modal.className = 'vrel_modal';
  modal.innerHTML = `
    <div class="vrel_modal_content">
      <div class="vrel_modal_header">
        <span>🔗 ${existing ? 'Edit' : 'Add'} Relationship</span>
        <button class="vrel_modal_close">✕</button>
      </div>
      <div class="vrel_modal_body">
        <div class="vrel_connect_display">
          <span class="vrel_connect_name">${fromNpc.name}</span>
          <span class="vrel_connect_arrow">↔</span>
          <span class="vrel_connect_name">${toNpc.name}</span>
        </div>
        <div class="vrel_form_group">
          <label>Relationship Type</label>
          <select id="vrel_connect_type">
            ${Object.entries(RELATIONSHIP_TYPES).map(([key, val]) => `
              <option value="${key}" ${existing?.type === key ? 'selected' : ''}>
                ${val.icon} ${val.label}
              </option>
            `).join('')}
          </select>
        </div>
        <div class="vrel_form_group">
          <label>Notes</label>
          <textarea id="vrel_connect_notes" rows="2" placeholder="How do they know each other?">${existing?.notes || ''}</textarea>
        </div>
      </div>
      <div class="vrel_modal_footer">
        <button class="vrel_btn vrel_btn_secondary vrel_modal_cancel">Cancel</button>
        <button class="vrel_btn vrel_btn_primary" id="vrel_connect_submit">${existing ? 'Update' : 'Connect'}</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Clear connecting state
  document.querySelectorAll('.vrel_node').forEach(n => {
    n.classList.remove('vrel_connecting', 'vrel_connect_target');
  });
  
  modal.querySelector('.vrel_modal_close').addEventListener('click', () => modal.remove());
  modal.querySelector('.vrel_modal_cancel').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  
  modal.querySelector('#vrel_connect_submit').addEventListener('click', async () => {
    const st = getChatState();
    addRelationship(
      st,
      fromId,
      toId,
      document.getElementById('vrel_connect_type').value,
      document.getElementById('vrel_connect_notes').value.trim()
    );
    
    await commitState(st);
    modal.remove();
    render();
  });
}

async function deleteNpc(npcId) {
  const st = getChatState();
  const npc = st.npcs[npcId];
  if (!npc) return;
  
  if (!confirm(`Delete ${npc.name}? This will also remove all their relationships.`)) {
    return;
  }
  
  removeNpc(st, npcId);
  UI.selectedNpc = null;
  await commitState(st);
  render();
}

// ══════════════════════════════════════════════════════════════════════════════
// JOURNEY TRACKER INTEGRATION
// ══════════════════════════════════════════════════════════════════════════════

function subscribeToJourney() {
  if (!window.VJourney) {
    console.log('[Relationships] VJourney not available yet, retrying...');
    setTimeout(subscribeToJourney, 1000);
    return;
  }
  
  // Subscribe to NPC discoveries
  window.VJourney.subscribe(window.VJourney.EVENTS.NPC_DISCOVERED, async (data) => {
    console.log('[Relationships] NPC discovered from Journey:', data);
    const st = getChatState();
    
    // Check if NPC already exists
    const existing = Object.values(st.npcs).find(
      n => n.name.toLowerCase() === data.name.toLowerCase()
    );
    
    if (!existing) {
      addNpc(st, {
        name: data.name,
        location: data.location,
        faction: data.faction,
        disposition: 0,  // Start neutral
      });
      await commitState(st);
      
      if (UI.panelOpen) render();
      console.log('[Relationships] Auto-added NPC from Journey:', data.name);
    }
  });
  
  // Subscribe to context updates for faction info
  window.VJourney.subscribe(window.VJourney.EVENTS.CONTEXT_UPDATED, async (data) => {
    if (data.npcsKnown && data.npcsKnown.length > 0) {
      const st = getChatState();
      let updated = false;
      
      for (const journeyNpc of data.npcsKnown) {
        const existing = Object.values(st.npcs).find(
          n => n.name.toLowerCase() === journeyNpc.name.toLowerCase()
        );
        
        if (!existing) {
          addNpc(st, {
            name: journeyNpc.name,
            location: journeyNpc.location,
            faction: journeyNpc.faction,
          });
          updated = true;
        }
      }
      
      if (updated) {
        await commitState(st);
        if (UI.panelOpen) render();
      }
    }
  });
  
  // Sync existing NPCs from Journey
  const ctx = window.VJourney.getContext();
  if (ctx.npcsKnown && ctx.npcsKnown.length > 0) {
    const st = getChatState();
    let updated = false;
    
    for (const journeyNpc of ctx.npcsKnown) {
      const existing = Object.values(st.npcs).find(
        n => n.name.toLowerCase() === journeyNpc.name.toLowerCase()
      );
      
      if (!existing) {
        addNpc(st, {
          name: journeyNpc.name,
          location: journeyNpc.location,
          faction: journeyNpc.faction,
        });
        updated = true;
      }
    }
    
    if (updated) {
      commitState(st);
    }
  }
  
  console.log('[Relationships] Subscribed to Journey Tracker!');
}

// ══════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════════════════════════

window.VRelationships = {
  open: () => { UI.panelOpen = true; UI.root?.classList.remove('vrel_hidden'); render(); },
  close: () => { UI.panelOpen = false; UI.root?.classList.add('vrel_hidden'); },
  toggle: togglePanel,
  
  getState: getChatState,
  
  addNpc: async (npcData) => {
    const st = getChatState();
    const npc = addNpc(st, npcData);
    await commitState(st);
    if (UI.panelOpen) render();
    return npc;
  },
  
  updateNpc: async (npcId, updates) => {
    const st = getChatState();
    const npc = updateNpc(st, npcId, updates);
    await commitState(st);
    if (UI.panelOpen) render();
    return npc;
  },
  
  removeNpc: async (npcId) => {
    const st = getChatState();
    removeNpc(st, npcId);
    await commitState(st);
    if (UI.panelOpen) render();
  },
  
  addRelationship: async (fromId, toId, type, notes = '') => {
    const st = getChatState();
    const rel = addRelationship(st, fromId, toId, type, notes);
    await commitState(st);
    if (UI.panelOpen) render();
    return rel;
  },
  
  setDisposition: async (npcId, value) => {
    const st = getChatState();
    if (st.npcs[npcId]) {
      st.npcs[npcId].disposition = Math.max(-100, Math.min(100, value));
      await commitState(st);
      if (UI.panelOpen) render();
    }
  },
  
  adjustDisposition: async (npcId, delta) => {
    const st = getChatState();
    if (st.npcs[npcId]) {
      const current = st.npcs[npcId].disposition || 0;
      st.npcs[npcId].disposition = Math.max(-100, Math.min(100, current + delta));
      await commitState(st);
      if (UI.panelOpen) render();
      return st.npcs[npcId].disposition;
    }
  },
  
  getNpc: (npcId) => getChatState().npcs[npcId],
  
  getNpcByName: (name) => {
    const st = getChatState();
    return Object.values(st.npcs).find(n => n.name.toLowerCase() === name.toLowerCase());
  },
  
  getAllNpcs: () => Object.values(getChatState().npcs),
  
  getRelationships: (npcId) => {
    const st = getChatState();
    return st.relationships.filter(r => r.from === npcId || r.to === npcId);
  },
  
  render,
};

// ══════════════════════════════════════════════════════════════════════════════
// LIFECYCLE
// ══════════════════════════════════════════════════════════════════════════════

function registerEvents() {
  if (!eventSource || !event_types) return;
  
  eventSource.on(event_types.CHAT_CHANGED, () => {
    console.log('[Relationships] Chat changed');
    UI.selectedNpc = null;
    if (UI.panelOpen) render();
  });
  
  // Parse messages for relationship events!
  eventSource.on(event_types.MESSAGE_RECEIVED, () => {
    setTimeout(async () => {
      try {
        // Get the last message
        const ctx = SillyTavern?.getContext ? SillyTavern.getContext() : (getContext ? getContext() : null);
        if (!ctx?.chat || ctx.chat.length === 0) return;
        
        const lastMessage = ctx.chat[ctx.chat.length - 1];
        if (!lastMessage?.mes) return;
        
        // Parse for relationship events
        const changes = parseRelationshipEvents(lastMessage.mes);
        
        if (changes.dispositionChanges.length > 0 || changes.relationshipHints.length > 0) {
          console.log('[Relationships] Detected changes:', changes);
          await applyRelationshipChanges(changes);
        }
      } catch (e) {
        console.error('[Relationships] Parse error:', e);
      }
    }, 300);
  });
  
  // Subscribe to Journey Tracker
  setTimeout(subscribeToJourney, 500);
}

(async function main() {
  console.log('[Relationships] Loading...');
  try {
    mountUI();
    registerEvents();
    console.log('[Relationships] Ready!');
  } catch (e) {
    console.error('[Relationships] Init failed:', e);
  }
})();
