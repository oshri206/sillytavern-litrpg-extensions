/**
 * Valdris Rumor Mill
 * ==================
 * Dynamic rumor generation based on world state. Some true, some false!
 * 
 * Install folder:
 *   SillyTavern/public/scripts/extensions/third-party/valdris-rumors/
 */

const EXT_NAME = 'valdris-rumors';
const META_KEY = 'vrum_state_v1';

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
  console.error('[Rumors] Failed to import extensions.js', e);
}

try {
  const scriptModule = await import('../../../../script.js');
  eventSource = scriptModule.eventSource;
  event_types = scriptModule.event_types;
  if (!saveSettingsDebounced) saveSettingsDebounced = scriptModule.saveSettingsDebounced;
} catch (e) {
  console.error('[Rumors] Failed to import script.js', e);
}

// ══════════════════════════════════════════════════════════════════════════════
// RUMOR SOURCES
// ══════════════════════════════════════════════════════════════════════════════

const RUMOR_SOURCES = {
  drunk_peasant: {
    name: 'Drunk Peasant',
    icon: '🍺',
    reliability: 0.3,
    desc: 'Slurring their words at the bar',
    flavorStart: [
      '"I heard from my cousin\'s friend that..."',
      '"*hic* You didn\'t hear this from me, but..."',
      '"Everyone\'s talking about how..."',
      '"My neighbor says..."',
    ],
  },
  traveling_merchant: {
    name: 'Traveling Merchant',
    icon: '🧳',
    reliability: 0.6,
    desc: 'Well-traveled and connected',
    flavorStart: [
      '"In my travels, I\'ve heard..."',
      '"The merchants\' guild is buzzing about..."',
      '"Along the trade routes, word is..."',
      '"I saw it with my own eyes—"',
    ],
  },
  town_guard: {
    name: 'Town Guard',
    icon: '⚔️',
    reliability: 0.7,
    desc: 'Official but biased sources',
    flavorStart: [
      '"Official word from the barracks is..."',
      '"Command passed down that..."',
      '"We\'ve been told to watch for..."',
      '"The captain mentioned..."',
    ],
  },
  tavern_keeper: {
    name: 'Tavern Keeper',
    icon: '🍻',
    reliability: 0.5,
    desc: 'Hears everything, verifies little',
    flavorStart: [
      '"You hear all sorts in this line of work..."',
      '"A stranger came through last night, said..."',
      '"Between you and me..."',
      '"The regulars have been saying..."',
    ],
  },
  noble_servant: {
    name: 'Noble\'s Servant',
    icon: '🎩',
    reliability: 0.75,
    desc: 'Privy to high society secrets',
    flavorStart: [
      '"I shouldn\'t say this, but my lord mentioned..."',
      '"At the last ball, I overheard..."',
      '"The nobility is concerned about..."',
      '"In confidence, the household is preparing for..."',
    ],
  },
  street_urchin: {
    name: 'Street Urchin',
    icon: '👦',
    reliability: 0.4,
    desc: 'Sees everything, understands little',
    flavorStart: [
      '"Mister, mister! I saw something!"',
      '"Give me a coin and I\'ll tell you..."',
      '"The other kids are all scared because..."',
      '"I was hiding and I heard..."',
    ],
  },
  mysterious_stranger: {
    name: 'Mysterious Stranger',
    icon: '🎭',
    reliability: 0.5,
    desc: 'Could be anyone',
    flavorStart: [
      '"*whispers* You seem trustworthy..."',
      '"I know things others don\'t..."',
      '"Consider this a warning..."',
      '"The shadows speak of..."',
    ],
  },
  temple_acolyte: {
    name: 'Temple Acolyte',
    icon: '⛪',
    reliability: 0.65,
    desc: 'Religious perspective on events',
    flavorStart: [
      '"The gods have shown signs that..."',
      '"Pilgrims from afar speak of..."',
      '"The high priest is troubled by..."',
      '"Divine portents suggest..."',
    ],
  },
  old_veteran: {
    name: 'Old Veteran',
    icon: '🎖️',
    reliability: 0.7,
    desc: 'Experienced and cynical',
    flavorStart: [
      '"I\'ve seen this before, back in the war..."',
      '"Mark my words, this means..."',
      '"Old soldiers like me know the signs..."',
      '"The young ones don\'t remember, but..."',
    ],
  },
  bard: {
    name: 'Traveling Bard',
    icon: '🎸',
    reliability: 0.55,
    desc: 'Dramatic but informative',
    flavorStart: [
      '"*strums lute* Let me tell you a tale..."',
      '"The songs speak of..."',
      '"In distant lands, they sing of..."',
      '"A new verse is being written about..."',
    ],
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// RUMOR TEMPLATES
// ══════════════════════════════════════════════════════════════════════════════

// True rumors - generated from actual world state
const TRUE_RUMOR_TEMPLATES = {
  war_declared: [
    'War has broken out between {faction1} and {faction2}!',
    '{faction1} marches against {faction2} as we speak.',
    'Blood will flow—{faction1} and {faction2} are at war.',
  ],
  war_ongoing: [
    'The war between {faction1} and {faction2} rages on.',
    '{winner} is winning the war against {loser}, or so they say.',
    'Soldiers from {faction1} are being conscripted for the {faction2} front.',
  ],
  peace_treaty: [
    '{faction1} and {faction2} have signed a peace treaty.',
    'The war is over! {faction1} and {faction2} lay down arms.',
    'Diplomats from {faction1} and {faction2} reached an accord.',
  ],
  alliance_formed: [
    '{faction1} and {faction2} have formed an alliance!',
    'A new alliance binds {faction1} to {faction2}.',
    'The {faction1}-{faction2} alliance changes everything.',
  ],
  tension_rising: [
    'Tensions are rising between {faction1} and {faction2}.',
    'Border skirmishes between {faction1} and {faction2} grow frequent.',
    '{faction1} and {faction2} are on the brink of war.',
  ],
  faction_weak: [
    '{faction} is struggling—their military is depleted.',
    '{faction}\'s economy is in shambles.',
    'Internal strife plagues {faction}.',
  ],
  faction_strong: [
    '{faction} grows stronger by the day.',
    '{faction}\'s military is at peak readiness.',
    '{faction}\'s coffers overflow with gold.',
  ],
  trade_route_blocked: [
    'Trade routes to {faction} are blocked—prices will rise.',
    'Merchants can\'t reach {faction} anymore.',
    'The {faction} trade road is too dangerous to travel.',
  ],
  world_tension: [
    'The whole world feels on edge lately.',
    'Something big is coming—you can feel it in the air.',
    'Too many factions sharpening swords for this to end well.',
  ],
};

// False rumors - misinformation, outdated, or pure fiction
const FALSE_RUMOR_TEMPLATES = {
  fake_war: [
    '{faction1} is about to declare war on {faction2}!',
    'I heard {faction1} assassinated {faction2}\'s leader!',
    '{faction1} and {faction2} are secretly at war.',
  ],
  fake_alliance: [
    '{faction1} and {faction2} are forming a secret alliance.',
    'An alliance between {faction1} and {faction2} is imminent.',
    '{faction1} has pledged troops to {faction2}.',
  ],
  fake_death: [
    'The ruler of {faction} is dead!',
    '{faction}\'s general was assassinated last night!',
    'Plague has killed half of {faction}\'s nobility.',
  ],
  fake_treasure: [
    'Ancient treasure was found near {location}!',
    'A dragon\'s hoard lies hidden in the {terrain}!',
    'The lost crown of {faction} has been discovered!',
  ],
  fake_monster: [
    'A terrible beast stalks the roads near {location}.',
    'Dragons have been seen flying over {faction} territory!',
    'The dead are rising in the {terrain}!',
  ],
  fake_conspiracy: [
    '{faction1} has spies everywhere in {faction2}.',
    'The merchants\' guild secretly controls {faction}.',
    '{faction} is building a secret weapon.',
  ],
  fake_prophecy: [
    'A prophecy foretells {faction}\'s doom!',
    'The stars predict war by month\'s end.',
    'An ancient evil awakens beneath {location}.',
  ],
  outdated_info: [
    '{faction1} and {faction2} are still at peace.', // When actually at war
    'The roads to {faction} are safe for travel.', // When actually blocked
    '{faction} has never been stronger.', // When actually weak
  ],
  pure_gossip: [
    'The {faction} queen has taken a secret lover.',
    '{faction}\'s prince gambled away the treasury.',
    'Nobles in {faction} practice dark magic.',
  ],
};

// Generic rumors (neutral, always available)
const GENERIC_RUMORS = [
  'Strange lights were seen in the sky last night.',
  'The harvest this year will be poor, mark my words.',
  'Bandits are getting bolder on the roads.',
  'A new adventuring party came through yesterday.',
  'The local lord raised taxes again.',
  'Someone\'s been stealing chickens in the village.',
  'The well water tastes strange lately.',
  'Old Marta\'s predictions haven\'t been wrong yet.',
  'The blacksmith\'s apprentice ran off with a merchant\'s daughter.',
  'They found strange ruins in the forest.',
  'The fishing\'s been poor this season.',
  'Wolves have been howling closer to town.',
  'A caravan went missing on the north road.',
  'The herbalist is selling love potions again.',
  'Someone saw ghost lights in the old cemetery.',
];

// Quest hook rumors
const QUEST_RUMORS = [
  { text: 'The mayor is looking for someone to clear out the {terrain} of monsters.', type: 'combat' },
  { text: 'A merchant needs an escort to {faction} territory.', type: 'escort' },
  { text: 'Someone\'s been kidnapped—the family is offering a reward.', type: 'rescue' },
  { text: 'The bounty on the bandit leader just doubled.', type: 'bounty' },
  { text: 'An archaeologist needs protection for a dig site.', type: 'exploration' },
  { text: 'The temple seeks holy relics lost in the {terrain}.', type: 'fetch' },
  { text: 'A noble will pay handsomely for... discreet services.', type: 'intrigue' },
  { text: 'Monster attacks are increasing—someone should investigate.', type: 'investigation' },
  { text: 'The guild is hiring anyone with combat experience.', type: 'military' },
  { text: 'Strange disappearances in the {terrain}—someone should look into it.', type: 'mystery' },
];

// ══════════════════════════════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════════════════════════════

function newEmptyState() {
  return {
    version: 1,
    rumors: [],              // All known rumors
    heardRumors: [],         // IDs of rumors player has heard
    currentLocation: 'tavern',
    lastGenerateDay: 0,
    revealedTruth: {},       // Rumors whose truth has been revealed
    hasVisitedSocialLocation: false,  // GATE: Must visit tavern/social spot first!
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
  
  // Ensure gate field exists for old states (migration)
  if (md[META_KEY].hasVisitedSocialLocation === undefined) {
    md[META_KEY].hasVisitedSocialLocation = false;
    // Clear any pre-existing rumors from before the gate was added
    md[META_KEY].rumors = [];
    md[META_KEY].heardRumors = [];
  }
  
  return md[META_KEY];
}

async function commitState(state) {
  const md = getChatMetadata();
  if (md) md[META_KEY] = state;
  await saveChatMetadata();
}

// ══════════════════════════════════════════════════════════════════════════════
// FACTION HELPERS
// ══════════════════════════════════════════════════════════════════════════════

const FACTION_NAMES = {
  valdran_empire: 'Valdran Empire',
  magocracy: 'Magocracy',
  solarus_theocracy: 'Solarus Theocracy',
  elven_courts: 'Elven Courts',
  dwarven_holds: 'Dwarven Holds',
  orcish_dominion: 'Orcish Dominion',
  free_cities: 'Free Cities',
  shadow_consortium: 'Shadow Consortium',
  beastkin_tribes: 'Beastkin Tribes',
  undead_kingdoms: 'Undead Kingdoms',
  sea_kingdoms: 'Sea Kingdoms',
  nomad_confederacy: 'Nomad Confederacy',
};

const TERRAIN_TYPES = ['forest', 'mountains', 'swamps', 'plains', 'desert', 'coast', 'underground'];
const LOCATIONS = ['the old ruins', 'the northern pass', 'the eastern woods', 'the western hills', 'the southern marshes', 'the crossroads', 'the abandoned mine'];

function getRandomFaction() {
  const factions = Object.keys(FACTION_NAMES);
  return factions[Math.floor(Math.random() * factions.length)];
}

function getRandomFactionName() {
  return FACTION_NAMES[getRandomFaction()];
}

function getFactionName(id) {
  return FACTION_NAMES[id] || id;
}

function getRandomTerrain() {
  return TERRAIN_TYPES[Math.floor(Math.random() * TERRAIN_TYPES.length)];
}

function getRandomLocation() {
  return LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
}

// ══════════════════════════════════════════════════════════════════════════════
// RUMOR GENERATION
// ══════════════════════════════════════════════════════════════════════════════

function getCurrentDay() {
  if (window.VTSS) {
    const vtss = window.VTSS.getState();
    if (vtss?.time) {
      return (vtss.time.year * 360) + (vtss.time.month * 36) + vtss.time.day;
    }
  }
  return Math.floor(Date.now() / 86400000);
}

function generateRumors(st, count = 5) {
  // ULTIMATE GATE CHECK - NO MATTER WHERE THIS IS CALLED FROM!
  if (!st.hasVisitedSocialLocation) {
    console.log('[Rumors] generateRumors BLOCKED - gate locked! hasVisitedSocialLocation:', st.hasVisitedSocialLocation);
    return [];
  }
  
  const newRumors = [];
  
  // Get world state from diplomacy
  const diplomacy = window.VDiplomacy;
  const wars = diplomacy?.getActiveWars?.() || [];
  const worldState = diplomacy?.getState?.() || null;
  
  for (let i = 0; i < count; i++) {
    const rumorType = Math.random();
    let rumor = null;
    
    if (rumorType < 0.4 && worldState) {
      // 40% chance: True rumor based on world state
      rumor = generateTrueRumor(worldState, wars);
    } else if (rumorType < 0.7) {
      // 30% chance: False rumor
      rumor = generateFalseRumor(worldState, wars);
    } else if (rumorType < 0.85) {
      // 15% chance: Quest hook
      rumor = generateQuestRumor();
    } else {
      // 15% chance: Generic gossip
      rumor = generateGenericRumor();
    }
    
    if (rumor) {
      rumor.id = `rum_${Date.now()}_${i}`;
      rumor.createdDay = getCurrentDay();
      rumor.source = getRandomSource();
      newRumors.push(rumor);
    }
  }
  
  return newRumors;
}

function generateTrueRumor(worldState, wars) {
  const templates = [];
  
  // Check for active wars
  if (wars.length > 0) {
    const war = wars[Math.floor(Math.random() * wars.length)];
    const faction1 = getFactionName(war.attacker);
    const faction2 = getFactionName(war.defender);
    const winner = war.warScore > 0 ? faction1 : faction2;
    const loser = war.warScore > 0 ? faction2 : faction1;
    
    if (Math.random() < 0.5) {
      templates.push(...TRUE_RUMOR_TEMPLATES.war_ongoing.map(t => 
        t.replace('{faction1}', faction1)
         .replace('{faction2}', faction2)
         .replace('{winner}', winner)
         .replace('{loser}', loser)
      ));
    }
  }
  
  // Check faction strengths
  if (worldState?.factions) {
    for (const faction of worldState.factions) {
      if (faction.military < 50 || faction.economy < 40 || faction.stability < 40) {
        templates.push(...TRUE_RUMOR_TEMPLATES.faction_weak.map(t =>
          t.replace('{faction}', getFactionName(faction.id))
        ));
      }
      if (faction.military > 80 && faction.economy > 70) {
        templates.push(...TRUE_RUMOR_TEMPLATES.faction_strong.map(t =>
          t.replace('{faction}', getFactionName(faction.id))
        ));
      }
    }
  }
  
  // Check relationships for tensions
  if (worldState?.relationships) {
    for (const [f1, relations] of Object.entries(worldState.relationships)) {
      for (const [f2, value] of Object.entries(relations)) {
        if (value < -50 && !wars.some(w => 
          (w.attacker === f1 && w.defender === f2) || 
          (w.attacker === f2 && w.defender === f1)
        )) {
          templates.push(...TRUE_RUMOR_TEMPLATES.tension_rising.map(t =>
            t.replace('{faction1}', getFactionName(f1))
             .replace('{faction2}', getFactionName(f2))
          ));
        }
      }
    }
  }
  
  // World tension
  if (worldState?.worldTension > 60) {
    templates.push(...TRUE_RUMOR_TEMPLATES.world_tension);
  }
  
  if (templates.length === 0) {
    return generateGenericRumor();
  }
  
  const text = templates[Math.floor(Math.random() * templates.length)];
  
  return {
    text,
    isTrue: true,
    category: 'political',
    importance: 'high',
  };
}

function generateFalseRumor(worldState, wars) {
  const category = ['fake_war', 'fake_alliance', 'fake_death', 'fake_treasure', 
                    'fake_monster', 'fake_conspiracy', 'fake_prophecy', 
                    'outdated_info', 'pure_gossip'][Math.floor(Math.random() * 9)];
  
  const templates = FALSE_RUMOR_TEMPLATES[category];
  let text = templates[Math.floor(Math.random() * templates.length)];
  
  // Fill in placeholders
  text = text.replace('{faction1}', getRandomFactionName());
  text = text.replace('{faction2}', getRandomFactionName());
  text = text.replace('{faction}', getRandomFactionName());
  text = text.replace('{location}', getRandomLocation());
  text = text.replace('{terrain}', getRandomTerrain());
  
  return {
    text,
    isTrue: false,
    category: category.replace('fake_', '').replace('_', ' '),
    importance: category.includes('war') || category.includes('death') ? 'high' : 'medium',
  };
}

function generateQuestRumor() {
  const quest = QUEST_RUMORS[Math.floor(Math.random() * QUEST_RUMORS.length)];
  let text = quest.text;
  
  text = text.replace('{faction}', getRandomFactionName());
  text = text.replace('{terrain}', getRandomTerrain());
  text = text.replace('{location}', getRandomLocation());
  
  return {
    text,
    isTrue: true, // Quest rumors are always "true" in the sense they're available
    category: 'quest',
    questType: quest.type,
    importance: 'medium',
  };
}

function generateGenericRumor() {
  const text = GENERIC_RUMORS[Math.floor(Math.random() * GENERIC_RUMORS.length)];
  
  return {
    text,
    isTrue: Math.random() < 0.5, // 50/50 for generic
    category: 'gossip',
    importance: 'low',
  };
}

function getRandomSource() {
  const sources = Object.keys(RUMOR_SOURCES);
  return sources[Math.floor(Math.random() * sources.length)];
}

// ══════════════════════════════════════════════════════════════════════════════
// RUMOR MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════

function refreshRumors(st) {
  const currentDay = getCurrentDay();
  
  // GATE: Only generate rumors if player has visited a social location!
  // Check Journey context for tavern, market, social tags
  const hasVisitedSocialLocation = st.hasVisitedSocialLocation || false;
  
  if (!hasVisitedSocialLocation) {
    // Don't generate rumors until player visits appropriate location
    console.log('[Rumors] Waiting for player to visit tavern/social location');
    return;
  }
  
  // Generate new rumors every day (only if we've visited a social location)
  if (currentDay > st.lastGenerateDay) {
    const daysPassed = Math.min(currentDay - st.lastGenerateDay, 7);
    const newCount = Math.min(daysPassed * 2, 10);
    
    const newRumors = generateRumors(st, newCount);
    st.rumors = [...newRumors, ...st.rumors];
    
    // Keep only last 50 rumors
    if (st.rumors.length > 50) {
      st.rumors = st.rumors.slice(0, 50);
    }
    
    st.lastGenerateDay = currentDay;
  }
  
  // Mark old rumors as stale
  const staleDays = 10;
  for (const rumor of st.rumors) {
    if (currentDay - rumor.createdDay > staleDays) {
      rumor.stale = true;
    }
  }
}

function hearRumor(st) {
  // Get unheard rumors
  const unheard = st.rumors.filter(r => !st.heardRumors.includes(r.id) && !r.stale);
  
  if (unheard.length === 0) {
    // All rumors heard, return a generic one
    return {
      text: "Nothing new to report. Same old gossip.",
      source: 'tavern_keeper',
      isTrue: true,
      category: 'gossip',
      importance: 'low',
      alreadyHeard: true,
    };
  }
  
  // Weighted random selection (higher importance = more likely to be shared)
  const weighted = [];
  for (const rumor of unheard) {
    const weight = rumor.importance === 'high' ? 3 : rumor.importance === 'medium' ? 2 : 1;
    for (let i = 0; i < weight; i++) {
      weighted.push(rumor);
    }
  }
  
  const selected = weighted[Math.floor(Math.random() * weighted.length)];
  st.heardRumors.push(selected.id);
  
  return selected;
}

function formatRumorForDisplay(rumor) {
  const source = RUMOR_SOURCES[rumor.source] || RUMOR_SOURCES.tavern_keeper;
  const flavorStart = source.flavorStart[Math.floor(Math.random() * source.flavorStart.length)];
  
  return {
    ...rumor,
    sourceName: source.name,
    sourceIcon: source.icon,
    sourceReliability: source.reliability,
    formattedText: `${flavorStart} ${rumor.text}`,
  };
}

function formatRumorForNarrative(rumor) {
  const formatted = formatRumorForDisplay(rumor);
  return `[RUMOR from ${formatted.sourceName}]\n${formatted.formattedText}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// UI
// ══════════════════════════════════════════════════════════════════════════════

const UI = {
  mounted: false,
  root: null,
  panelOpen: false,
  showHeardOnly: false,
};

function mountUI() {
  if (UI.mounted) return;
  UI.mounted = true;
  
  // Launcher
  const launcher = document.createElement('button');
  launcher.id = 'vrum_launcher';
  launcher.className = 'vrum_launcher';
  launcher.innerHTML = '👂';
  launcher.title = 'Rumor Mill';
  launcher.addEventListener('click', togglePanel);
  document.body.appendChild(launcher);
  
  // Main panel
  const panel = document.createElement('div');
  panel.id = 'vrum_root';
  panel.className = 'vrum_panel vrum_hidden';
  panel.innerHTML = `
    <div class="vrum_header">
      <div class="vrum_title">
        <span class="vrum_title_icon">👂</span>
        <span>Rumor Mill</span>
      </div>
      <div class="vrum_header_actions">
        <button class="vrum_btn" id="vrum_btn_hear" title="Hear a Rumor">🎲 Hear Rumor</button>
        <button class="vrum_btn" id="vrum_btn_close" title="Close">✕</button>
      </div>
    </div>
    
    <div class="vrum_body">
      <!-- Current Rumor Display -->
      <div class="vrum_current" id="vrum_current">
        <div class="vrum_current_empty">
          <span class="vrum_current_icon">🍺</span>
          <span>Step into the tavern and listen...</span>
        </div>
      </div>
      
      <!-- Filter -->
      <div class="vrum_filter_bar">
        <label class="vrum_filter_toggle">
          <input type="checkbox" id="vrum_show_heard">
          <span>Show heard rumors</span>
        </label>
        <div class="vrum_stats" id="vrum_stats">0 rumors available</div>
      </div>
      
      <!-- Rumor List -->
      <div class="vrum_list_title">Available Rumors</div>
      <div class="vrum_list" id="vrum_list">
        <!-- Populated by JS -->
      </div>
    </div>
    
    <div class="vrum_footer">
      <div class="vrum_legend">
        <span class="vrum_leg_high">🔴 Important</span>
        <span class="vrum_leg_med">🟡 Notable</span>
        <span class="vrum_leg_low">⚪ Gossip</span>
        <span class="vrum_leg_quest">❗ Quest</span>
      </div>
    </div>
  `;
  
  document.body.appendChild(panel);
  UI.root = panel;
  
  setupEventListeners();
  render();
  
  console.log('[Rumors] UI mounted');
}

function setupEventListeners() {
  document.getElementById('vrum_btn_close').addEventListener('click', togglePanel);
  document.getElementById('vrum_btn_hear').addEventListener('click', onHearRumor);
  
  document.getElementById('vrum_show_heard').addEventListener('change', (e) => {
    UI.showHeardOnly = e.target.checked;
    renderRumorList();
  });
}

function togglePanel() {
  UI.panelOpen = !UI.panelOpen;
  UI.root.classList.toggle('vrum_hidden', !UI.panelOpen);
  if (UI.panelOpen) {
    const st = getChatState();
    
    // GATE CHECK: Clear any existing rumors if we haven't unlocked yet!
    if (!st.hasVisitedSocialLocation) {
      st.rumors = [];
      st.heardRumors = [];
      console.log('[Rumors] Gate locked - clearing any pre-existing rumors');
    }
    
    refreshRumors(st);
    commitState(st);
    render();
  }
}

async function onHearRumor() {
  const st = getChatState();
  
  // GATE CHECK: Can't hear rumors if you haven't been to a social location!
  if (!st.hasVisitedSocialLocation) {
    displayCurrentRumor({
      text: "You haven't visited any taverns or social gatherings yet. Find a place where people gossip!",
      source: 'system',
      isTrue: true,
      category: 'gossip',
      importance: 'low',
      locked: true,
    });
    return;
  }
  
  refreshRumors(st);
  
  const rumor = hearRumor(st);
  await commitState(st);
  
  displayCurrentRumor(rumor);
  renderRumorList();
}

function render() {
  const st = getChatState();
  
  // GATE CHECK: Ensure rumors are cleared if gate is locked
  if (!st.hasVisitedSocialLocation && st.rumors.length > 0) {
    st.rumors = [];
    st.heardRumors = [];
    commitState(st);
  }
  
  renderStats(st);
  renderRumorList();
}

function renderStats(st) {
  const unheard = st.rumors.filter(r => !st.heardRumors.includes(r.id) && !r.stale).length;
  document.getElementById('vrum_stats').textContent = `${unheard} rumors available`;
}

function displayCurrentRumor(rumor) {
  const container = document.getElementById('vrum_current');
  const formatted = formatRumorForDisplay(rumor);
  
  const importanceClass = {
    high: 'vrum_importance_high',
    medium: 'vrum_importance_med',
    low: 'vrum_importance_low',
  }[rumor.importance] || 'vrum_importance_low';
  
  const categoryIcon = {
    political: '🏛️',
    quest: '❗',
    gossip: '💬',
    war: '⚔️',
    alliance: '🤝',
    death: '💀',
    treasure: '💎',
    monster: '👹',
    conspiracy: '🕵️',
    prophecy: '🔮',
  }[rumor.category] || '📢';
  
  container.innerHTML = `
    <div class="vrum_rumor_card ${importanceClass}">
      <div class="vrum_rumor_header">
        <span class="vrum_source_icon">${formatted.sourceIcon}</span>
        <span class="vrum_source_name">${formatted.sourceName}</span>
        <span class="vrum_reliability" title="Reliability">${Math.round(formatted.sourceReliability * 100)}% reliable</span>
      </div>
      <div class="vrum_rumor_text">${formatted.formattedText}</div>
      <div class="vrum_rumor_footer">
        <span class="vrum_category">${categoryIcon} ${rumor.category}</span>
        ${rumor.questType ? `<span class="vrum_quest_type">Quest: ${rumor.questType}</span>` : ''}
        <button class="vrum_copy_btn" onclick="navigator.clipboard.writeText(\`${formatRumorForNarrative(rumor).replace(/`/g, "'")}\`)">📋 Copy</button>
      </div>
    </div>
  `;
}

function renderRumorList() {
  const st = getChatState();
  const container = document.getElementById('vrum_list');
  
  let rumors = st.rumors.filter(r => !r.stale);
  
  if (!UI.showHeardOnly) {
    rumors = rumors.filter(r => !st.heardRumors.includes(r.id));
  }
  
  if (rumors.length === 0) {
    container.innerHTML = '<div class="vrum_empty">No rumors available. Check back later!</div>';
    return;
  }
  
  let html = '';
  for (const rumor of rumors.slice(0, 20)) {
    const heard = st.heardRumors.includes(rumor.id);
    const source = RUMOR_SOURCES[rumor.source] || RUMOR_SOURCES.tavern_keeper;
    
    const importanceIcon = {
      high: '🔴',
      medium: '🟡',
      low: '⚪',
    }[rumor.importance] || '⚪';
    
    html += `
      <div class="vrum_list_item ${heard ? 'vrum_heard' : ''}" data-id="${rumor.id}">
        <span class="vrum_list_importance">${importanceIcon}</span>
        <span class="vrum_list_source">${source.icon}</span>
        <span class="vrum_list_text">${rumor.text.substring(0, 60)}${rumor.text.length > 60 ? '...' : ''}</span>
        ${rumor.category === 'quest' ? '<span class="vrum_list_quest">❗</span>' : ''}
      </div>
    `;
  }
  
  container.innerHTML = html;
  
  // Click to hear specific rumor
  container.querySelectorAll('.vrum_list_item').forEach(item => {
    item.addEventListener('click', async () => {
      const id = item.dataset.id;
      const rumor = st.rumors.find(r => r.id === id);
      if (rumor) {
        if (!st.heardRumors.includes(id)) {
          st.heardRumors.push(id);
          await commitState(st);
        }
        displayCurrentRumor(rumor);
        renderRumorList();
      }
    });
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// GLOBAL API
// ══════════════════════════════════════════════════════════════════════════════

window.VRumors = {
  open: () => { UI.panelOpen = true; UI.root.classList.remove('vrum_hidden'); render(); },
  close: () => { UI.panelOpen = false; UI.root.classList.add('vrum_hidden'); },
  toggle: togglePanel,
  
  getState: getChatState,
  
  hear: async () => {
    const st = getChatState();
    refreshRumors(st);
    const rumor = hearRumor(st);
    await commitState(st);
    return formatRumorForDisplay(rumor);
  },
  
  hearForNarrative: async () => {
    const st = getChatState();
    refreshRumors(st);
    const rumor = hearRumor(st);
    await commitState(st);
    return formatRumorForNarrative(rumor);
  },
  
  generateFresh: async (count = 5) => {
    const st = getChatState();
    
    // GATE CHECK: Can't generate if locked!
    if (!st.hasVisitedSocialLocation) {
      console.log('[Rumors] generateFresh blocked - gate locked');
      return [];
    }
    
    const newRumors = generateRumors(st, count);
    st.rumors = [...newRumors, ...st.rumors].slice(0, 50);
    await commitState(st);
    render();
    return newRumors;
  },
  
  getUnheard: () => {
    const st = getChatState();
    return st.rumors.filter(r => !st.heardRumors.includes(r.id) && !r.stale);
  },
  
  getAllRumors: () => getChatState().rumors,
  
  revealTruth: async (rumorId) => {
    const st = getChatState();
    const rumor = st.rumors.find(r => r.id === rumorId);
    if (rumor) {
      st.revealedTruth[rumorId] = rumor.isTrue;
      await commitState(st);
      return rumor.isTrue;
    }
    return null;
  },
  
  isRevealed: (rumorId) => {
    const st = getChatState();
    return st.revealedTruth[rumorId];
  },
  
  format: formatRumorForDisplay,
  formatNarrative: formatRumorForNarrative,
  
  render,
};

// ══════════════════════════════════════════════════════════════════════════════
// JOURNEY INTEGRATION - Rumors relevant to character's journey!
// ══════════════════════════════════════════════════════════════════════════════

function subscribeToJourney() {
  if (!window.VJourney) {
    console.log('[Rumors] VJourney not available yet, retrying...');
    setTimeout(subscribeToJourney, 1000);
    return;
  }
  
  // Subscribe to faction encounters - generate relevant rumors
  window.VJourney.subscribe(window.VJourney.EVENTS.FACTION_ENCOUNTERED, async (data) => {
    console.log('[Rumors] Faction context from Journey:', data.faction);
    const st = getChatState();
    st.narrativeFaction = data.faction;
    st.factionsEncountered = data.allFactions || [data.faction];
    await commitState(st);
  });
  
  // Subscribe to location changes - taverns = more rumors!
  window.VJourney.subscribe(window.VJourney.EVENTS.LOCATION_CHANGED, async (data) => {
    const st = getChatState();
    
    // Check if this is a social location where gossip happens
    // NOTE: 'rest' tag is NOT social - you can rest at home but not hear gossip!
    const isSocialLocation = data.tags?.includes('social') || 
                             data.tags?.includes('rumors') ||
                             data.location === 'tavern' ||
                             data.location === 'market' ||
                             data.location === 'inn';
    
    if (isSocialLocation) {
      // UNLOCK RUMOR GENERATION - player has visited a gossip spot!
      st.hasVisitedSocialLocation = true;
      refreshRumors(st);
      await commitState(st);
      console.log('[Rumors] Social location detected - rumors UNLOCKED and refreshed!');
    }
  });
  
  // Subscribe to context updates for richer rumors
  window.VJourney.subscribe(window.VJourney.EVENTS.CONTEXT_UPDATED, (data) => {
    // Store full context for generating relevant rumors
    const st = getChatState();
    st.journeyContext = {
      location: data.location,
      faction: data.faction,
      npcs: data.npcsKnown,
      factions: data.factionsEncountered,
    };
    commitState(st);
  });
  
  // Sync with current journey state
  const ctx = window.VJourney.getContext();
  if (ctx.faction) {
    const st = getChatState();
    st.narrativeFaction = ctx.faction;
    commitState(st);
  }
  
  console.log('[Rumors] Subscribed to Journey Tracker!');
}

// Override generateRumors to be context-aware
const originalGenerateRumors = generateRumors;
generateRumors = function(st, count = 5) {
  // DOUBLE CHECK GATE IN OVERRIDE TOO!
  if (!st.hasVisitedSocialLocation) {
    console.log('[Rumors] generateRumors override BLOCKED - gate still locked!');
    return [];
  }
  
  // Bias rumor generation toward factions the player has encountered
  const journeyFactions = st.factionsEncountered || [];
  
  // Call original but it will now have access to narrative context
  st.narrativeFactions = journeyFactions;
  return originalGenerateRumors(st, count);
};

// ══════════════════════════════════════════════════════════════════════════════
// LIFECYCLE
// ══════════════════════════════════════════════════════════════════════════════

function registerEvents() {
  if (!eventSource || !event_types) return;
  
  eventSource.on(event_types.CHAT_CHANGED, () => {
    console.log('[Rumors] Chat changed');
    if (UI.panelOpen) render();
  });
  
  // Refresh rumors periodically - BUT RESPECT THE GATE!
  eventSource.on(event_types.MESSAGE_RECEIVED, () => {
    setTimeout(async () => {
      try {
        const st = getChatState();
        
        // GATE CHECK: Don't do anything if locked!
        if (!st.hasVisitedSocialLocation) {
          // Clear any old rumors that shouldn't exist
          if (st.rumors.length > 0) {
            st.rumors = [];
            st.heardRumors = [];
            await commitState(st);
            console.log('[Rumors] Gate locked - cleared stale rumors');
          }
          return;
        }
        
        refreshRumors(st);
        await commitState(st);
        if (UI.panelOpen) render();
      } catch (e) {
        console.error('[Rumors] Refresh error:', e);
      }
    }, 300);
  });
  
  // Subscribe to Journey Tracker
  setTimeout(subscribeToJourney, 500);
}

(async function main() {
  console.log('[Rumors] Loading...');
  try {
    mountUI();
    registerEvents();
    console.log('[Rumors] Ready!');
  } catch (e) {
    console.error('[Rumors] Init failed:', e);
  }
})();
