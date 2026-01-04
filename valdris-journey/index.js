/**
 * Valdris Journey Tracker
 * =======================
 * Central narrative parser that tracks the character's journey through chat.
 * Broadcasts context to all other Valdris extensions for coherent, story-driven generation.
 * 
 * Install folder:
 *   SillyTavern/public/scripts/extensions/third-party/valdris-journey/
 * 
 * MUST LOAD FIRST (loading_order: 1) so other extensions can subscribe!
 */

const EXT_NAME = 'valdris-journey';
const META_KEY = 'vjourney_state_v1';

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
  console.error('[Journey] Failed to import extensions.js', e);
}

try {
  const scriptModule = await import('../../../../script.js');
  eventSource = scriptModule.eventSource;
  event_types = scriptModule.event_types;
  if (!saveSettingsDebounced) saveSettingsDebounced = scriptModule.saveSettingsDebounced;
} catch (e) {
  console.error('[Journey] Failed to import script.js', e);
}

// ══════════════════════════════════════════════════════════════════════════════
// DETECTION PATTERNS
// ══════════════════════════════════════════════════════════════════════════════

// Location/Place Detection
const LOCATION_PATTERNS = {
  tavern: {
    patterns: [/\b(tavern|inn|bar|pub|alehouse|drinking hall)\b/i, /\border(s|ed|ing)?\s+(ale|drink|mead|wine)\b/i],
    type: 'building',
    terrain: 'urban',
    tags: ['social', 'rest', 'rumors'],
  },
  market: {
    patterns: [/\b(market|bazaar|shop|store|merchant|trading post|stall)\b/i, /\b(buy|sell|trade|haggle|barter)\b/i],
    type: 'building',
    terrain: 'urban',
    tags: ['trade', 'social'],
  },
  temple: {
    patterns: [/\b(temple|church|shrine|cathedral|chapel|sanctuary|altar)\b/i, /\b(pray|worship|blessing|holy|sacred)\b/i],
    type: 'building',
    terrain: 'urban',
    tags: ['religious', 'healing'],
  },
  castle: {
    patterns: [/\b(castle|palace|keep|fortress|citadel|throne room|court)\b/i, /\b(king|queen|lord|lady|noble|royal)\b/i],
    type: 'building',
    terrain: 'urban',
    tags: ['political', 'noble'],
  },
  guild: {
    patterns: [/\b(guild|guild hall|adventurer|mercenary|bounty board)\b/i],
    type: 'building',
    terrain: 'urban',
    tags: ['quests', 'social'],
  },
  blacksmith: {
    patterns: [/\b(blacksmith|forge|anvil|smithy|armorer|weaponsmith)\b/i],
    type: 'building',
    terrain: 'urban',
    tags: ['trade', 'crafting'],
  },
  library: {
    patterns: [/\b(library|archive|study|scriptorium|tome|scroll)\b/i],
    type: 'building',
    terrain: 'urban',
    tags: ['knowledge', 'magic'],
  },
  dungeon: {
    patterns: [/\b(dungeon|crypt|catacomb|tomb|vault|underground|cavern|cave)\b/i],
    type: 'dungeon',
    terrain: 'underground',
    tags: ['danger', 'exploration', 'loot'],
  },
  forest: {
    patterns: [/\b(forest|woods|grove|thicket|woodland|trees|clearing)\b/i],
    type: 'wilderness',
    terrain: 'forest',
    tags: ['nature', 'hunting', 'danger'],
  },
  mountain: {
    patterns: [/\b(mountain|peak|summit|cliff|ridge|highland|pass)\b/i],
    type: 'wilderness',
    terrain: 'mountain',
    tags: ['danger', 'exploration'],
  },
  swamp: {
    patterns: [/\b(swamp|marsh|bog|wetland|fen|mire)\b/i],
    type: 'wilderness',
    terrain: 'swamp',
    tags: ['danger', 'disease'],
  },
  desert: {
    patterns: [/\b(desert|dune|sand|oasis|wasteland|arid)\b/i],
    type: 'wilderness',
    terrain: 'desert',
    tags: ['danger', 'heat'],
  },
  coast: {
    patterns: [/\b(coast|beach|shore|harbor|port|dock|pier|ship|boat|sea|ocean)\b/i],
    type: 'wilderness',
    terrain: 'coastal',
    tags: ['travel', 'trade'],
  },
  home: {
    patterns: [/\b(home|house|residence|apartment|quarters|bedroom|kitchen|living room)\b/i, /\b([A-Z][a-z]+'s (?:home|house|place|residence))\b/i],
    type: 'building',
    terrain: 'urban',
    tags: ['rest', 'safe', 'private'],
  },
  road: {
    patterns: [/\b(road|path|trail|highway|trade route)\b/i, /\b(travel(?:ing|ed|s)? (?:along|down|the|toward))\b/i],
    type: 'travel',
    terrain: 'road',
    tags: ['travel', 'encounters'],
  },
  village: {
    patterns: [/\b(village|hamlet|settlement|town|city)\b/i],
    type: 'settlement',
    terrain: 'urban',
    tags: ['social', 'rest', 'trade'],
  },
  camp: {
    patterns: [/\b(camp|campfire|tent|rest|sleep|make camp|set up camp)\b/i],
    type: 'temporary',
    terrain: 'plains',
    tags: ['rest', 'vulnerable'],
  },
  ruins: {
    patterns: [/\b(ruin|ancient|abandoned|crumbling|forgotten|lost)\b/i],
    type: 'dungeon',
    terrain: 'ruins',
    tags: ['exploration', 'danger', 'loot'],
  },
  plains: {
    patterns: [/\b(plain|field|meadow|grassland|prairie|open land)\b/i],
    type: 'wilderness',
    terrain: 'plains',
    tags: ['travel', 'open'],
  },
  tundra: {
    patterns: [/\b(tundra|frozen|ice|snow|glacier|arctic|cold)\b/i],
    type: 'wilderness',
    terrain: 'tundra',
    tags: ['cold', 'danger'],
  },
};

// Faction Detection
const FACTION_PATTERNS = {
  valdran_empire: {
    patterns: [/\b(valdran|empire|imperial|emperor|legion)\b/i],
    aliases: ['empire', 'valdran', 'imperial'],
  },
  magocracy: {
    patterns: [/\b(magocracy|arcana|mage|wizard|sorcerer|magic council|archmage)\b/i],
    aliases: ['mages', 'wizards', 'magocracy'],
  },
  solarus_theocracy: {
    patterns: [/\b(solarus|theocracy|sun god|solar|holy order|inquisitor|paladin)\b/i],
    aliases: ['church', 'theocracy', 'solarus'],
  },
  elven_courts: {
    patterns: [/\b(elven|elf|elves|fey|sylvan|woodland realm)\b/i],
    aliases: ['elves', 'elven'],
  },
  dwarven_holds: {
    patterns: [/\b(dwarven|dwarf|dwarves|dwarven hold|mountain king|undermountain)\b/i],
    aliases: ['dwarves', 'dwarven'],
  },
  orcish_dominion: {
    patterns: [/\b(orcish|orc|orcs|orcish dominion|warchief|orc horde)\b/i],
    aliases: ['orcs', 'orcish'],
  },
  free_cities: {
    patterns: [/\b(free cit|merchant guild|trade league|mercantia|merchant republic|trade guild)\b/i],
    aliases: ['free cities', 'merchants', 'mercantia'],
  },
  shadow_consortium: {
    patterns: [/\b(shadow consortium|thieves guild|assassin guild|black market syndicate)\b/i],
    aliases: ['shadows', 'thieves'],
  },
  beastkin_tribes: {
    patterns: [/\b(beastkin|beastkin tribe|beast tribe|shifter clan|werewolf|lycanthrope)\b/i],
    aliases: ['beastkin', 'tribes'],
  },
  undead_kingdoms: {
    patterns: [/\b(undead kingdom|necromancer|lich king|vampire lord|death knight order)\b/i],
    aliases: ['undead', 'necromancers'],
  },
  sea_kingdoms: {
    patterns: [/\b(sea kingdom|pirate fleet|naval fleet|admiral|corsair)\b/i],
    aliases: ['sailors', 'pirates', 'sea'],
  },
  nomad_confederacy: {
    patterns: [/\b(nomad confederacy|horse lord|steppe rider|wandering tribe|caravan master)\b/i],
    aliases: ['nomads', 'wanderers'],
  },
};

// Weather Detection
const WEATHER_PATTERNS = {
  clear: [/\b(clear|sunny|bright|cloudless|fair weather)\b/i],
  cloudy: [/\b(cloud|overcast|grey sk|gray sk)\b/i],
  rain: [/\b(rain|drizzle|downpour|shower|wet|soaked)\b/i],
  storm: [/\b(storm|thunder|lightning|tempest)\b/i],
  snow: [/\b(snow|blizzard|frost|frozen|ice|sleet)\b/i],
  fog: [/\b(fog|mist|haze|visibility)\b/i],
  wind: [/\b(wind|gust|gale|breeze)\b/i],
  hot: [/\b(hot|heat|swelter|scorch|burn)\b/i],
};

// Time of Day Detection
const TIME_PATTERNS = {
  dawn: [/\b(dawn|sunrise|daybreak|first light|early morning)\b/i],
  morning: [/\b(morning|forenoon|mid-morning)\b/i],
  noon: [/\b(noon|midday|high sun)\b/i],
  afternoon: [/\b(afternoon|late day)\b/i],
  dusk: [/\b(dusk|sunset|twilight|evening)\b/i],
  night: [/\b(night|midnight|dark|moonlight|stars)\b/i],
};

// NPC Detection (extracts names near key words)
const NPC_PATTERNS = [
  // "met Elena Thorne", "spoke to Captain Elena"
  /(?:meet|met|spoke to|talk to|speaking with|conversation with|greeted by|introduced to)\s+(?:Captain\s+|Lord\s+|Lady\s+|Sir\s+|Master\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g,
  // "Elena says", "Elena Thorne replied"
  /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:says|said|tells|told|asks|asked|replies|replied|speaks|spoke|demands|demanded|whispers|whispered|shouts|shouted)/g,
  // "the captain Elena", "Captain Elena Thorne"
  /(?:Captain|Lord|Lady|Sir|Master|Commander|General|Chief|Elder)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
  // "Elena's home", "Elena's kitchen" - possessive indicates named character
  /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)'s\s+(?:home|house|room|kitchen|shop|store|office|quarters)/gi,
  // "belongs to Captain Elena Thorne"
  /belongs to\s+(?:Captain\s+|Lord\s+|Lady\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
];

// Item Detection - ONLY actual item gain/loss patterns, NOT dialogue!
const ITEM_PATTERNS = [
  // [+1 Iron Sword] or [+Iron Sword] - item gained with plus sign
  /\[\+(\d+\s+)?([A-Za-z][A-Za-z\s]+?)\]/g,
  // [-1 Gold] or [-Health Potion] - item lost with minus sign  
  /\[-(\d+\s+)?([A-Za-z][A-Za-z\s]+?)\]/g,
  // [Acquired: Health Potion x3]
  /\[Acquired:\s*([A-Za-z][A-Za-z\s\dx]+?)\]/gi,
  // [Received: Cloak]
  /\[Received:\s*([A-Za-z][A-Za-z\s]+?)\]/gi,
  // [Lost: 50 Gold]
  /\[Lost:\s*([A-Za-z\d][A-Za-z\s\d]+?)\]/gi,
  // Narrative item gains - "received a sword", "found a potion"
  /(?:receive[sd]?|obtained|found|picked up|acquired|looted)\s+(?:a|an|the|some|\d+)?\s*([A-Za-z][A-Za-z\s]{2,25}?)(?:\.|,|!|\n|from|$)/gi,
];

// Patterns to IGNORE - these are Vex system messages, not items!
const IGNORE_BRACKET_PATTERNS = [
  /^\[(?:Well|Oh|I |You |Don't|Trust|Try|That|This|Let|How|Why|What|The |My |Your |Yes|No|Now|Here|Good|First|Quest|Weather|HP|MP|SP|STR|DEX|CON|INT|WIS|CHA|Level|Skill|Location|Free Cities|Elena)/i,
  /^\[.*(?:reputation|relationship|Update|Started|Complete|Objective|Check).*\]/i,
  /^\[Oops/i,
  /^\[\.\.\./i,
  /^\[.*\?\]/,  // Questions are Vex dialogue
];

// Combat Detection - need multiple strong signals, not just one word!
const COMBAT_PATTERNS = [
  // Active combat verbs (present/immediate)
  /\b(attacks?|strikes?|slashes?|stabs?|swings? (?:at|toward)|parries?|blocks?|dodges?)\b/i,
  // Combat state indicators
  /\b(in combat|battle (?:begins|starts|erupts)|fight breaks out|combat stance|draw(?:s|ing)? (?:sword|weapon|blade))\b/i,
  // Damage/wounds happening NOW
  /\b(takes? \d+ damage|wounds? you|injures?|blood (?:flows|sprays)|pain lances)\b/i,
  // Enemy engagement
  /\b(enemy attacks?|enemies? approach|hostile|ambush(?:ed)?|bandits? attack|monster lunges)\b/i,
];

// Words that should NOT trigger combat (past tense death scenes, metaphors, etc)
const COMBAT_EXCLUDE_PATTERNS = [
  /you die|you died|death|dying|was killed|were killed|last breath|heart stopped/i,
  /could kill|would kill|might kill/i,  // Hypotheticals
  /kill.*boredom|fight.*urge/i,  // Metaphors
];

// Quest-related Detection
const QUEST_PATTERNS = [
  /\b(quest|mission|task|job|assignment|bounty|contract)\b/i,
  /\b(reward|payment|gold|coin|treasure)\b/i,
  /\b(complete|finish|accomplish|succeed|fail)\b/i,
];

// ══════════════════════════════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════════════════════════════

function newEmptyState() {
  return {
    version: 1,
    // Current context
    currentLocation: null,
    currentLocationType: null,
    currentTerrain: 'plains',
    currentFaction: null,
    currentWeather: null,
    currentTimeOfDay: null,
    
    // Journey history
    locationsVisited: [],
    factionsEncountered: [],
    npcsKnown: [],
    itemsNoted: [],
    
    // Activity tracking
    inCombat: false,
    lastCombatDay: 0,
    recentActivities: [], // Last 20 activities
    
    // Context tags (for other systems)
    contextTags: [],
    
    // Parsing settings
    autoParseEnabled: true,
    lastParsedMessageId: null,
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
  const md = getChatMetadata();
  if (md) md[META_KEY] = state;
  await saveChatMetadata();
}

// ══════════════════════════════════════════════════════════════════════════════
// EVENT SYSTEM - Other extensions subscribe here!
// ══════════════════════════════════════════════════════════════════════════════

const journeyEvents = {
  subscribers: {},
  
  subscribe(event, callback) {
    if (!this.subscribers[event]) this.subscribers[event] = [];
    this.subscribers[event].push(callback);
    return () => {
      this.subscribers[event] = this.subscribers[event].filter(cb => cb !== callback);
    };
  },
  
  emit(event, data) {
    if (this.subscribers[event]) {
      for (const callback of this.subscribers[event]) {
        try {
          callback(data);
        } catch (e) {
          console.error(`[Journey] Event handler error for ${event}:`, e);
        }
      }
    }
  },
};

// Event types that other extensions can subscribe to
const JOURNEY_EVENTS = {
  LOCATION_CHANGED: 'location_changed',
  TERRAIN_CHANGED: 'terrain_changed',
  FACTION_ENCOUNTERED: 'faction_encountered',
  NPC_MET: 'npc_met',
  ITEM_NOTED: 'item_noted',
  COMBAT_STARTED: 'combat_started',
  COMBAT_ENDED: 'combat_ended',
  WEATHER_CHANGED: 'weather_changed',
  TIME_CHANGED: 'time_changed',
  CONTEXT_UPDATED: 'context_updated',
};

// ══════════════════════════════════════════════════════════════════════════════
// MESSAGE PARSING
// ══════════════════════════════════════════════════════════════════════════════

function parseMessage(text, st) {
  const updates = {
    locationChanged: false,
    terrainChanged: false,
    factionEncountered: null,
    npcsFound: [],
    itemsFound: [],
    combatDetected: false,
    weatherDetected: null,
    timeDetected: null,
  };
  
  // Location Detection
  for (const [locId, locData] of Object.entries(LOCATION_PATTERNS)) {
    for (const pattern of locData.patterns) {
      if (pattern.test(text)) {
        if (st.currentLocation !== locId) {
          st.currentLocation = locId;
          st.currentLocationType = locData.type;
          updates.locationChanged = true;
          
          // Add to visited
          if (!st.locationsVisited.includes(locId)) {
            st.locationsVisited.push(locId);
          }
          
          // Update terrain
          if (st.currentTerrain !== locData.terrain) {
            st.currentTerrain = locData.terrain;
            updates.terrainChanged = true;
          }
          
          // Update context tags
          st.contextTags = [...new Set([...st.contextTags.filter(t => !Object.values(LOCATION_PATTERNS).flatMap(l => l.tags).includes(t)), ...locData.tags])];
        }
        break;
      }
    }
    if (updates.locationChanged) break;
  }
  
  // Faction Detection
  for (const [factionId, factionData] of Object.entries(FACTION_PATTERNS)) {
    for (const pattern of factionData.patterns) {
      if (pattern.test(text)) {
        if (!st.factionsEncountered.includes(factionId)) {
          st.factionsEncountered.push(factionId);
        }
        st.currentFaction = factionId;
        updates.factionEncountered = factionId;
        break;
      }
    }
    if (updates.factionEncountered) break;
  }
  
  // Weather Detection
  for (const [weatherId, patterns] of Object.entries(WEATHER_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        st.currentWeather = weatherId;
        updates.weatherDetected = weatherId;
        break;
      }
    }
    if (updates.weatherDetected) break;
  }
  
  // Time Detection
  for (const [timeId, patterns] of Object.entries(TIME_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        st.currentTimeOfDay = timeId;
        updates.timeDetected = timeId;
        break;
      }
    }
    if (updates.timeDetected) break;
  }
  
  // NPC Detection
  for (const pattern of NPC_PATTERNS) {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);
    while ((match = regex.exec(text)) !== null) {
      const npcName = match[1] || match[2];
      if (npcName && npcName.length > 2 && npcName.length < 30) {
        // Filter out common words and system terms
        const commonWords = ['the', 'and', 'but', 'for', 'you', 'your', 'they', 'their', 'him', 'her', 'his',
                            'that', 'this', 'what', 'who', 'how', 'why', 'when', 'where', 'which',
                            'captain', 'lord', 'lady', 'sir', 'master', 'commander', 'general',
                            'someone', 'anyone', 'everyone', 'nobody', 'something', 'nothing',
                            'location', 'weather', 'quest', 'skill', 'spell', 'level'];
        const cleanName = npcName.trim();
        if (!commonWords.includes(cleanName.toLowerCase()) && /^[A-Z]/.test(cleanName)) {
          if (!st.npcsKnown.find(n => n.name.toLowerCase() === cleanName.toLowerCase())) {
            const npc = {
              name: cleanName,
              firstMet: Date.now(),
              location: st.currentLocation,
              faction: st.currentFaction,
            };
            st.npcsKnown.push(npc);
            updates.npcsFound.push(npc);
          }
        }
      }
    }
  }
  
  // Item Detection - with exclusion filtering for Vex dialogue!
  for (const pattern of ITEM_PATTERNS) {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);
    while ((match = regex.exec(text)) !== null) {
      // Get the full bracket match if it exists, or the captured group
      const fullMatch = match[0];
      const itemName = (match[2] || match[1])?.trim();
      
      // Skip if this looks like Vex dialogue
      let isVexDialogue = false;
      for (const ignorePattern of IGNORE_BRACKET_PATTERNS) {
        if (ignorePattern.test(fullMatch)) {
          isVexDialogue = true;
          break;
        }
      }
      if (isVexDialogue) continue;
      
      if (itemName && itemName.length > 2 && itemName.length < 40) {
        // Filter common words and system keywords
        const skipWords = ['it', 'them', 'this', 'that', 'something', 'anything', 'nothing', 
                          'quest', 'objective', 'complete', 'started', 'updated', 'weather',
                          'reputation', 'relationship', 'level', 'skill', 'hp', 'mp', 'sp',
                          'location', 'combat', 'safe', 'check', 'update'];
        if (!skipWords.includes(itemName.toLowerCase())) {
          if (!st.itemsNoted.find(i => i.name.toLowerCase() === itemName.toLowerCase())) {
            const item = {
              name: itemName,
              noted: Date.now(),
              location: st.currentLocation,
            };
            st.itemsNoted.push(item);
            updates.itemsFound.push(item);
          }
        }
      }
    }
  }
  
  // Combat Detection - with exclusion filtering for death scenes/metaphors
  let combatScore = 0;
  
  // First check if we should exclude (death scene, hypothetical, etc)
  let excludeCombat = false;
  for (const excludePattern of COMBAT_EXCLUDE_PATTERNS) {
    if (excludePattern.test(text)) {
      excludeCombat = true;
      break;
    }
  }
  
  if (!excludeCombat) {
    for (const pattern of COMBAT_PATTERNS) {
      if (pattern.test(text)) combatScore++;
    }
  }
  
  // Need at least 2 combat signals to trigger combat state
  if (combatScore >= 2) {
    st.inCombat = true;
    updates.combatDetected = true;
    if (!st.contextTags.includes('combat')) {
      st.contextTags.push('combat');
    }
  } else if (combatScore === 0 && st.inCombat) {
    st.inCombat = false;
    st.contextTags = st.contextTags.filter(t => t !== 'combat');
  }
  
  // Add to recent activities
  const activity = {
    timestamp: Date.now(),
    location: st.currentLocation,
    terrain: st.currentTerrain,
    faction: st.currentFaction,
    inCombat: st.inCombat,
    tags: [...st.contextTags],
  };
  st.recentActivities.unshift(activity);
  if (st.recentActivities.length > 20) {
    st.recentActivities = st.recentActivities.slice(0, 20);
  }
  
  return updates;
}

function emitUpdates(updates, st) {
  if (updates.locationChanged) {
    journeyEvents.emit(JOURNEY_EVENTS.LOCATION_CHANGED, {
      location: st.currentLocation,
      type: st.currentLocationType,
      tags: st.contextTags,
    });
  }
  
  if (updates.terrainChanged) {
    journeyEvents.emit(JOURNEY_EVENTS.TERRAIN_CHANGED, {
      terrain: st.currentTerrain,
    });
  }
  
  if (updates.factionEncountered) {
    journeyEvents.emit(JOURNEY_EVENTS.FACTION_ENCOUNTERED, {
      faction: updates.factionEncountered,
      allFactions: st.factionsEncountered,
    });
  }
  
  for (const npc of updates.npcsFound) {
    journeyEvents.emit(JOURNEY_EVENTS.NPC_MET, { npc });
  }
  
  for (const item of updates.itemsFound) {
    journeyEvents.emit(JOURNEY_EVENTS.ITEM_NOTED, { item });
  }
  
  if (updates.combatDetected) {
    journeyEvents.emit(JOURNEY_EVENTS.COMBAT_STARTED, {});
  }
  
  if (updates.weatherDetected) {
    journeyEvents.emit(JOURNEY_EVENTS.WEATHER_CHANGED, {
      weather: updates.weatherDetected,
    });
  }
  
  if (updates.timeDetected) {
    journeyEvents.emit(JOURNEY_EVENTS.TIME_CHANGED, {
      timeOfDay: updates.timeDetected,
    });
  }
  
  // Always emit context update
  journeyEvents.emit(JOURNEY_EVENTS.CONTEXT_UPDATED, {
    location: st.currentLocation,
    locationType: st.currentLocationType,
    terrain: st.currentTerrain,
    faction: st.currentFaction,
    weather: st.currentWeather,
    timeOfDay: st.currentTimeOfDay,
    inCombat: st.inCombat,
    tags: st.contextTags,
    npcsKnown: st.npcsKnown,
    factionsEncountered: st.factionsEncountered,
    itemsNoted: st.itemsNoted,
    locationsVisited: st.locationsVisited,
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// BULK PARSE - Parse entire chat history
// ══════════════════════════════════════════════════════════════════════════════

function parseAllMessages(st) {
  const ctx = SillyTavern?.getContext ? SillyTavern.getContext() : (getContext ? getContext() : null);
  if (!ctx?.chat) return;
  
  // Reset state for fresh parse
  st.currentLocation = null;
  st.currentLocationType = null;
  st.currentTerrain = 'plains';
  st.currentFaction = null;
  st.locationsVisited = [];
  st.factionsEncountered = [];
  st.npcsKnown = [];
  st.itemsNoted = [];
  st.contextTags = [];
  st.recentActivities = [];
  
  // Parse each message in order
  for (const msg of ctx.chat) {
    if (msg.mes) {
      parseMessage(msg.mes, st);
    }
  }
  
  console.log('[Journey] Parsed all messages:', {
    location: st.currentLocation,
    terrain: st.currentTerrain,
    factions: st.factionsEncountered.length,
    npcs: st.npcsKnown.length,
    items: st.itemsNoted.length,
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// UI
// ══════════════════════════════════════════════════════════════════════════════

const UI = {
  mounted: false,
  root: null,
  panelOpen: false,
};

function mountUI() {
  if (UI.mounted) return;
  UI.mounted = true;
  
  // Launcher
  const launcher = document.createElement('button');
  launcher.id = 'vjourney_launcher';
  launcher.className = 'vjourney_launcher';
  launcher.innerHTML = '🧭';
  launcher.title = 'Journey Tracker';
  launcher.addEventListener('click', togglePanel);
  document.body.appendChild(launcher);
  
  // Main panel
  const panel = document.createElement('div');
  panel.id = 'vjourney_root';
  panel.className = 'vjourney_panel vjourney_hidden';
  panel.innerHTML = `
    <div class="vjourney_header">
      <div class="vjourney_title">
        <span class="vjourney_title_icon">🧭</span>
        <span>Journey Tracker</span>
      </div>
      <div class="vjourney_header_actions">
        <button class="vjourney_btn" id="vjourney_btn_rescan" title="Rescan Chat">🔄 Rescan</button>
        <button class="vjourney_btn" id="vjourney_btn_close" title="Close">✕</button>
      </div>
    </div>
    
    <div class="vjourney_body">
      <!-- Current Context -->
      <div class="vjourney_section vjourney_current">
        <div class="vjourney_section_title">Current Context</div>
        <div class="vjourney_context_grid" id="vjourney_context">
          <!-- Rendered by JS -->
        </div>
      </div>
      
      <!-- Context Tags -->
      <div class="vjourney_section">
        <div class="vjourney_section_title">Active Tags</div>
        <div class="vjourney_tags" id="vjourney_tags">
          <!-- Rendered by JS -->
        </div>
      </div>
      
      <!-- Journey Stats -->
      <div class="vjourney_section">
        <div class="vjourney_section_title">Journey Statistics</div>
        <div class="vjourney_stats" id="vjourney_stats">
          <!-- Rendered by JS -->
        </div>
      </div>
      
      <!-- Known NPCs -->
      <div class="vjourney_section">
        <div class="vjourney_section_title">Known NPCs</div>
        <div class="vjourney_npcs" id="vjourney_npcs">
          <!-- Rendered by JS -->
        </div>
      </div>
      
      <!-- Noted Items -->
      <div class="vjourney_section">
        <div class="vjourney_section_title">Noted Items</div>
        <div class="vjourney_items" id="vjourney_items">
          <!-- Rendered by JS -->
        </div>
      </div>
      
      <!-- Factions -->
      <div class="vjourney_section">
        <div class="vjourney_section_title">Factions Encountered</div>
        <div class="vjourney_factions" id="vjourney_factions">
          <!-- Rendered by JS -->
        </div>
      </div>
    </div>
    
    <div class="vjourney_footer">
      <label class="vjourney_toggle">
        <input type="checkbox" id="vjourney_auto_parse" checked>
        <span>Auto-parse messages</span>
      </label>
    </div>
  `;
  
  document.body.appendChild(panel);
  UI.root = panel;
  
  setupEventListeners();
  render();
  
  console.log('[Journey] UI mounted');
}

function setupEventListeners() {
  document.getElementById('vjourney_btn_close').addEventListener('click', togglePanel);
  document.getElementById('vjourney_btn_rescan').addEventListener('click', rescanChat);
  
  document.getElementById('vjourney_auto_parse').addEventListener('change', async (e) => {
    const st = getChatState();
    st.autoParseEnabled = e.target.checked;
    await commitState(st);
  });
}

function togglePanel() {
  UI.panelOpen = !UI.panelOpen;
  UI.root.classList.toggle('vjourney_hidden', !UI.panelOpen);
  if (UI.panelOpen) {
    render();
  }
}

async function rescanChat() {
  const st = getChatState();
  parseAllMessages(st);
  await commitState(st);
  emitUpdates({ contextUpdated: true }, st);
  render();
}

function render() {
  const st = getChatState();
  
  renderContext(st);
  renderTags(st);
  renderStats(st);
  renderNPCs(st);
  renderItems(st);
  renderFactions(st);
  
  document.getElementById('vjourney_auto_parse').checked = st.autoParseEnabled !== false;
}

function renderContext(st) {
  const container = document.getElementById('vjourney_context');
  
  const locationInfo = LOCATION_PATTERNS[st.currentLocation] || {};
  const locationName = st.currentLocation ? st.currentLocation.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Unknown';
  
  container.innerHTML = `
    <div class="vjourney_ctx_item">
      <span class="vjourney_ctx_icon">📍</span>
      <span class="vjourney_ctx_label">Location</span>
      <span class="vjourney_ctx_value">${locationName}</span>
    </div>
    <div class="vjourney_ctx_item">
      <span class="vjourney_ctx_icon">🗺️</span>
      <span class="vjourney_ctx_label">Terrain</span>
      <span class="vjourney_ctx_value">${st.currentTerrain || 'Unknown'}</span>
    </div>
    <div class="vjourney_ctx_item">
      <span class="vjourney_ctx_icon">🏴</span>
      <span class="vjourney_ctx_label">Faction</span>
      <span class="vjourney_ctx_value">${st.currentFaction ? st.currentFaction.replace(/_/g, ' ') : 'None'}</span>
    </div>
    <div class="vjourney_ctx_item">
      <span class="vjourney_ctx_icon">🌤️</span>
      <span class="vjourney_ctx_label">Weather</span>
      <span class="vjourney_ctx_value">${st.currentWeather || 'Unknown'}</span>
    </div>
    <div class="vjourney_ctx_item">
      <span class="vjourney_ctx_icon">🕐</span>
      <span class="vjourney_ctx_label">Time</span>
      <span class="vjourney_ctx_value">${st.currentTimeOfDay || 'Unknown'}</span>
    </div>
    <div class="vjourney_ctx_item">
      <span class="vjourney_ctx_icon">⚔️</span>
      <span class="vjourney_ctx_label">Combat</span>
      <span class="vjourney_ctx_value ${st.inCombat ? 'vjourney_combat_active' : ''}">${st.inCombat ? 'In Combat!' : 'Safe'}</span>
    </div>
  `;
}

function renderTags(st) {
  const container = document.getElementById('vjourney_tags');
  
  if (st.contextTags.length === 0) {
    container.innerHTML = '<span class="vjourney_no_tags">No active context tags</span>';
    return;
  }
  
  container.innerHTML = st.contextTags.map(tag => 
    `<span class="vjourney_tag">${tag}</span>`
  ).join('');
}

function renderStats(st) {
  const container = document.getElementById('vjourney_stats');
  
  container.innerHTML = `
    <div class="vjourney_stat">
      <span class="vjourney_stat_value">${st.locationsVisited.length}</span>
      <span class="vjourney_stat_label">Locations</span>
    </div>
    <div class="vjourney_stat">
      <span class="vjourney_stat_value">${st.factionsEncountered.length}</span>
      <span class="vjourney_stat_label">Factions</span>
    </div>
    <div class="vjourney_stat">
      <span class="vjourney_stat_value">${st.npcsKnown.length}</span>
      <span class="vjourney_stat_label">NPCs</span>
    </div>
    <div class="vjourney_stat">
      <span class="vjourney_stat_value">${st.itemsNoted.length}</span>
      <span class="vjourney_stat_label">Items</span>
    </div>
  `;
}

function renderNPCs(st) {
  const container = document.getElementById('vjourney_npcs');
  
  if (st.npcsKnown.length === 0) {
    container.innerHTML = '<span class="vjourney_empty">No NPCs encountered yet</span>';
    return;
  }
  
  container.innerHTML = st.npcsKnown.slice(0, 10).map(npc => `
    <div class="vjourney_npc">
      <span class="vjourney_npc_name">👤 ${npc.name}</span>
      ${npc.location ? `<span class="vjourney_npc_loc">@ ${npc.location}</span>` : ''}
    </div>
  `).join('');
}

function renderItems(st) {
  const container = document.getElementById('vjourney_items');
  
  if (st.itemsNoted.length === 0) {
    container.innerHTML = '<span class="vjourney_empty">No items noted yet</span>';
    return;
  }
  
  container.innerHTML = st.itemsNoted.slice(0, 10).map(item => `
    <div class="vjourney_item_entry">📦 ${item.name}</div>
  `).join('');
}

function renderFactions(st) {
  const container = document.getElementById('vjourney_factions');
  
  if (st.factionsEncountered.length === 0) {
    container.innerHTML = '<span class="vjourney_empty">No factions encountered yet</span>';
    return;
  }
  
  const factionIcons = {
    valdran_empire: '🏛️',
    magocracy: '🔮',
    solarus_theocracy: '☀️',
    elven_courts: '🧝',
    dwarven_holds: '⛏️',
    orcish_dominion: '💪',
    free_cities: '🏘️',
    shadow_consortium: '🗡️',
    beastkin_tribes: '🐺',
    undead_kingdoms: '💀',
    sea_kingdoms: '⚓',
    nomad_confederacy: '🐴',
  };
  
  container.innerHTML = st.factionsEncountered.map(f => {
    const icon = factionIcons[f] || '🏴';
    const name = f.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const isCurrent = f === st.currentFaction;
    return `<div class="vjourney_faction ${isCurrent ? 'vjourney_faction_current' : ''}">${icon} ${name}</div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════════════════════════════
// GLOBAL API - Other extensions use this!
// ══════════════════════════════════════════════════════════════════════════════

window.VJourney = {
  // Panel control
  open: () => { UI.panelOpen = true; UI.root?.classList.remove('vjourney_hidden'); render(); },
  close: () => { UI.panelOpen = false; UI.root?.classList.add('vjourney_hidden'); },
  toggle: togglePanel,
  
  // State access
  getState: getChatState,
  getContext: () => {
    const st = getChatState();
    return {
      location: st.currentLocation,
      locationType: st.currentLocationType,
      terrain: st.currentTerrain,
      faction: st.currentFaction,
      weather: st.currentWeather,
      timeOfDay: st.currentTimeOfDay,
      inCombat: st.inCombat,
      tags: st.contextTags,
    };
  },
  
  // Detailed getters
  getCurrentLocation: () => getChatState().currentLocation,
  getCurrentTerrain: () => getChatState().currentTerrain,
  getCurrentFaction: () => getChatState().currentFaction,
  getFactionsEncountered: () => getChatState().factionsEncountered,
  getNPCsKnown: () => getChatState().npcsKnown,
  getItemsNoted: () => getChatState().itemsNoted,
  getLocationsVisited: () => getChatState().locationsVisited,
  isInCombat: () => getChatState().inCombat,
  getContextTags: () => getChatState().contextTags,
  
  // Event subscription - THIS IS THE KEY FOR OTHER EXTENSIONS!
  subscribe: (event, callback) => journeyEvents.subscribe(event, callback),
  EVENTS: JOURNEY_EVENTS,
  
  // Manual controls
  setLocation: async (location, terrain) => {
    const st = getChatState();
    st.currentLocation = location;
    if (terrain) st.currentTerrain = terrain;
    await commitState(st);
    journeyEvents.emit(JOURNEY_EVENTS.LOCATION_CHANGED, { location, terrain });
    journeyEvents.emit(JOURNEY_EVENTS.CONTEXT_UPDATED, st);
    render();
  },
  
  setFaction: async (faction) => {
    const st = getChatState();
    st.currentFaction = faction;
    if (!st.factionsEncountered.includes(faction)) {
      st.factionsEncountered.push(faction);
    }
    await commitState(st);
    journeyEvents.emit(JOURNEY_EVENTS.FACTION_ENCOUNTERED, { faction });
    journeyEvents.emit(JOURNEY_EVENTS.CONTEXT_UPDATED, st);
    render();
  },
  
  setTerrain: async (terrain) => {
    const st = getChatState();
    st.currentTerrain = terrain;
    await commitState(st);
    journeyEvents.emit(JOURNEY_EVENTS.TERRAIN_CHANGED, { terrain });
    journeyEvents.emit(JOURNEY_EVENTS.CONTEXT_UPDATED, st);
    render();
  },
  
  // Force rescan
  rescan: rescanChat,
  
  // For other extensions to check if journey is ready
  isReady: () => UI.mounted,
  
  render,
};

// ══════════════════════════════════════════════════════════════════════════════
// LIFECYCLE
// ══════════════════════════════════════════════════════════════════════════════

function registerEvents() {
  if (!eventSource || !event_types) return;
  
  eventSource.on(event_types.CHAT_CHANGED, async () => {
    console.log('[Journey] Chat changed - rescanning');
    const st = getChatState();
    parseAllMessages(st);
    await commitState(st);
    emitUpdates({}, st);
    if (UI.panelOpen) render();
  });
  
  eventSource.on(event_types.MESSAGE_RECEIVED, async (msgIdx) => {
    const st = getChatState();
    if (!st.autoParseEnabled) return;
    
    setTimeout(async () => {
      try {
        const ctx = SillyTavern?.getContext ? SillyTavern.getContext() : (getContext ? getContext() : null);
        if (!ctx?.chat) return;
        
        const msg = ctx.chat[msgIdx];
        if (!msg?.mes) return;
        
        const updates = parseMessage(msg.mes, st);
        await commitState(st);
        emitUpdates(updates, st);
        
        if (UI.panelOpen) render();
      } catch (e) {
        console.error('[Journey] Parse error:', e);
      }
    }, 300);
  });
  
  eventSource.on(event_types.MESSAGE_SENT, async (msgIdx) => {
    const st = getChatState();
    if (!st.autoParseEnabled) return;
    
    setTimeout(async () => {
      try {
        const ctx = SillyTavern?.getContext ? SillyTavern.getContext() : (getContext ? getContext() : null);
        if (!ctx?.chat) return;
        
        const msg = ctx.chat[msgIdx];
        if (!msg?.mes) return;
        
        const updates = parseMessage(msg.mes, st);
        await commitState(st);
        emitUpdates(updates, st);
        
        if (UI.panelOpen) render();
      } catch (e) {
        console.error('[Journey] Parse error:', e);
      }
    }, 300);
  });
}

(async function main() {
  console.log('[Journey] Loading...');
  try {
    mountUI();
    registerEvents();
    
    // Initial parse
    setTimeout(async () => {
      const st = getChatState();
      parseAllMessages(st);
      await commitState(st);
      emitUpdates({}, st);
      render();
    }, 1000);
    
    console.log('[Journey] Ready!');
  } catch (e) {
    console.error('[Journey] Init failed:', e);
  }
})();
