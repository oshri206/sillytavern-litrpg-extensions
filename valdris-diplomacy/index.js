/**
 * Valdris Diplomacy System
 * ========================
 * Full geopolitical simulation with wars, battles, treaties, and network visualization.
 * 
 * Install folder:
 *   SillyTavern/public/scripts/extensions/third-party/valdris-diplomacy/
 */

const EXT_NAME = 'valdris-diplomacy';
const META_KEY = 'vdip_state_v1';

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
  console.error('[Diplomacy] Failed to import extensions.js', e);
}

try {
  const scriptModule = await import('../../../../script.js');
  eventSource = scriptModule.eventSource;
  event_types = scriptModule.event_types;
  if (!saveSettingsDebounced) saveSettingsDebounced = scriptModule.saveSettingsDebounced;
} catch (e) {
  console.error('[Diplomacy] Failed to import script.js', e);
}

// ══════════════════════════════════════════════════════════════════════════════
// DEFAULT FACTIONS
// ══════════════════════════════════════════════════════════════════════════════

const DEFAULT_FACTIONS = [
  {
    id: 'valdran_empire',
    name: 'Valdran Empire',
    shortName: 'Valdran',
    color: '#8B0000',
    desc: 'The dominant human empire. Expansionist and militaristic.',
    military: 85,
    economy: 80,
    stability: 70,
    aggression: 60,
    graphX: 50,
    graphY: 50,
  },
  {
    id: 'magocracy',
    name: 'Magocracy of Arcana',
    shortName: 'Magocracy',
    color: '#8A2BE2',
    desc: 'Rule by mages. Values knowledge and magical supremacy.',
    military: 70,
    economy: 65,
    stability: 75,
    aggression: 40,
    graphX: 25,
    graphY: 35,
  },
  {
    id: 'solarus_theocracy',
    name: 'Solarus Theocracy',
    shortName: 'Solarus',
    color: '#DAA520',
    desc: 'Holy nation devoted to the sun god. Zealous and righteous.',
    military: 75,
    economy: 70,
    stability: 80,
    aggression: 50,
    graphX: 75,
    graphY: 30,
  },
  {
    id: 'elven_courts',
    name: 'Elven Courts',
    shortName: 'Elves',
    color: '#20B2AA',
    desc: 'Ancient forest kingdom. Isolationist but powerful.',
    military: 65,
    economy: 60,
    stability: 90,
    aggression: 20,
    graphX: 30,
    graphY: 20,
  },
  {
    id: 'dwarven_holds',
    name: 'Dwarven Holds',
    shortName: 'Dwarves',
    color: '#B8860B',
    desc: 'Mountain fortresses. Master craftsmen and stubborn fighters.',
    military: 80,
    economy: 85,
    stability: 85,
    aggression: 30,
    graphX: 55,
    graphY: 25,
  },
  {
    id: 'orcish_dominion',
    name: 'Orcish Dominion',
    shortName: 'Orcs',
    color: '#556B2F',
    desc: 'Warrior clans united. Honorable but warlike.',
    military: 90,
    economy: 40,
    stability: 55,
    aggression: 80,
    graphX: 15,
    graphY: 50,
  },
  {
    id: 'free_cities',
    name: 'Free Cities League',
    shortName: 'Free Cities',
    color: '#228B22',
    desc: 'Merchant republic. Wealthy but militarily weak.',
    military: 45,
    economy: 95,
    stability: 65,
    aggression: 15,
    graphX: 80,
    graphY: 55,
  },
  {
    id: 'shadow_consortium',
    name: 'Shadow Consortium',
    shortName: 'Shadow',
    color: '#2F4F4F',
    desc: 'Secretive underground nation. Masters of intrigue.',
    military: 50,
    economy: 70,
    stability: 60,
    aggression: 45,
    graphX: 20,
    graphY: 65,
  },
  {
    id: 'beastkin_tribes',
    name: 'Beastkin Tribes',
    shortName: 'Beastkin',
    color: '#CD853F',
    desc: 'Loose confederation of beast-folk. Fierce and territorial.',
    military: 70,
    economy: 35,
    stability: 50,
    aggression: 55,
    graphX: 35,
    graphY: 70,
  },
  {
    id: 'undead_kingdoms',
    name: 'Undead Kingdoms',
    shortName: 'Undead',
    color: '#4A4A4A',
    desc: 'Realm of the dead. Expansionist through necromancy.',
    military: 85,
    economy: 30,
    stability: 95,
    aggression: 70,
    graphX: 70,
    graphY: 80,
  },
  {
    id: 'sea_kingdoms',
    name: 'Sea Kingdoms',
    shortName: 'Sea Kings',
    color: '#4169E1',
    desc: 'Naval power controlling the eastern waters.',
    military: 60,
    economy: 75,
    stability: 70,
    aggression: 35,
    graphX: 90,
    graphY: 40,
  },
  {
    id: 'nomad_confederacy',
    name: 'Nomad Confederacy',
    shortName: 'Nomads',
    color: '#D2691E',
    desc: 'Horse lords of the plains. Mobile and unpredictable.',
    military: 75,
    economy: 45,
    stability: 45,
    aggression: 60,
    graphX: 50,
    graphY: 75,
  },
];

// Default relationships (faction1_id -> faction2_id -> value)
// Positive = friendly, Negative = hostile
const DEFAULT_RELATIONSHIPS = {
  'valdran_empire': {
    'magocracy': -20,
    'solarus_theocracy': 40,
    'elven_courts': -10,
    'dwarven_holds': 30,
    'orcish_dominion': -70,
    'free_cities': 20,
    'shadow_consortium': -40,
    'beastkin_tribes': -30,
    'undead_kingdoms': -80,
    'sea_kingdoms': 10,
    'nomad_confederacy': -20,
  },
  'magocracy': {
    'solarus_theocracy': -50,
    'elven_courts': 30,
    'dwarven_holds': 10,
    'orcish_dominion': -40,
    'free_cities': 25,
    'shadow_consortium': 20,
    'beastkin_tribes': 0,
    'undead_kingdoms': -30,
    'sea_kingdoms': 15,
    'nomad_confederacy': 0,
  },
  'solarus_theocracy': {
    'elven_courts': 10,
    'dwarven_holds': 35,
    'orcish_dominion': -60,
    'free_cities': 20,
    'shadow_consortium': -70,
    'beastkin_tribes': -20,
    'undead_kingdoms': -100,
    'sea_kingdoms': 25,
    'nomad_confederacy': -10,
  },
  'elven_courts': {
    'dwarven_holds': -15,
    'orcish_dominion': -50,
    'free_cities': 10,
    'shadow_consortium': -20,
    'beastkin_tribes': 25,
    'undead_kingdoms': -60,
    'sea_kingdoms': 5,
    'nomad_confederacy': 10,
  },
  'dwarven_holds': {
    'orcish_dominion': -40,
    'free_cities': 45,
    'shadow_consortium': -30,
    'beastkin_tribes': 0,
    'undead_kingdoms': -50,
    'sea_kingdoms': 30,
    'nomad_confederacy': -10,
  },
  'orcish_dominion': {
    'free_cities': -35,
    'shadow_consortium': 10,
    'beastkin_tribes': 20,
    'undead_kingdoms': -40,
    'sea_kingdoms': -25,
    'nomad_confederacy': 30,
  },
  'free_cities': {
    'shadow_consortium': 15,
    'beastkin_tribes': 5,
    'undead_kingdoms': -60,
    'sea_kingdoms': 50,
    'nomad_confederacy': 20,
  },
  'shadow_consortium': {
    'beastkin_tribes': 10,
    'undead_kingdoms': 25,
    'sea_kingdoms': -10,
    'nomad_confederacy': 15,
  },
  'beastkin_tribes': {
    'undead_kingdoms': -45,
    'sea_kingdoms': -5,
    'nomad_confederacy': 35,
  },
  'undead_kingdoms': {
    'sea_kingdoms': -55,
    'nomad_confederacy': -35,
  },
  'sea_kingdoms': {
    'nomad_confederacy': 0,
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════════════════════════════

function newEmptyState() {
  return {
    version: 1,
    factions: structuredClone(DEFAULT_FACTIONS),
    relationships: structuredClone(DEFAULT_RELATIONSHIPS),
    wars: [],           // Active wars
    treaties: [],       // Active treaties
    events: [],         // Historical events log
    worldTension: 30,   // Global tension level 0-100
    lastTickDay: 0,     // Track when we last processed daily events
    lastTickHour: 0,    // Track hour for hourly events
    lastTimeKey: null,  // Unique key for exact time tracking
  };
}

/**
 * Get SillyTavern context with consistent access pattern
 * @returns {Object|null} ST context or null if unavailable
 */
function getSTContext() {
  try {
    // Try global SillyTavern object first (preferred)
    if (typeof SillyTavern !== 'undefined' && SillyTavern?.getContext) {
      return SillyTavern.getContext();
    }
    // Fall back to imported getContext
    if (typeof getContext === 'function') {
      return getContext();
    }
    return null;
  } catch (e) {
    console.error('[Diplomacy] Error getting ST context:', e);
    return null;
  }
}

function getChatMetadata() {
  const ctx = getSTContext();
  return ctx?.chatMetadata ?? null;
}

async function saveChatMetadata() {
  const ctx = getSTContext();
  if (!ctx) {
    console.warn('[Diplomacy] Cannot save metadata: ST context unavailable');
    return false;
  }

  try {
    if (typeof ctx.saveMetadata === 'function') {
      await ctx.saveMetadata();
      return true;
    }
    if (typeof ctx.saveMetadataDebounced === 'function') {
      await ctx.saveMetadataDebounced();
      return true;
    }
    console.warn('[Diplomacy] No save method available on ST context');
    return false;
  } catch (e) {
    console.error('[Diplomacy] Error saving metadata:', e);
    return false;
  }
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
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function getFaction(st, id) {
  return st.factions.find(f => f.id === id);
}

function getRelationship(st, faction1, faction2) {
  if (faction1 === faction2) return 100;
  // Check both directions
  if (st.relationships[faction1]?.[faction2] !== undefined) {
    return st.relationships[faction1][faction2];
  }
  if (st.relationships[faction2]?.[faction1] !== undefined) {
    return st.relationships[faction2][faction1];
  }
  return 0;
}

function setRelationship(st, faction1, faction2, value) {
  value = Math.max(-100, Math.min(100, value));
  if (!st.relationships[faction1]) st.relationships[faction1] = {};
  if (!st.relationships[faction2]) st.relationships[faction2] = {};
  st.relationships[faction1][faction2] = value;
  st.relationships[faction2][faction1] = value;
}

function modifyRelationship(st, faction1, faction2, delta) {
  const current = getRelationship(st, faction1, faction2);
  setRelationship(st, faction1, faction2, current + delta);
}

function getRelationshipStatus(value) {
  if (value >= 60) return { status: 'Allied', color: '#4CAF50', icon: '🤝' };
  if (value >= 30) return { status: 'Friendly', color: '#8BC34A', icon: '😊' };
  if (value >= -29) return { status: 'Neutral', color: '#9E9E9E', icon: '😐' };
  if (value >= -59) return { status: 'Tense', color: '#FF9800', icon: '😠' };
  return { status: 'Hostile', color: '#f44336', icon: '⚔️' };
}

function areAtWar(st, faction1, faction2) {
  return st.wars.some(w => 
    (w.attacker === faction1 && w.defender === faction2) ||
    (w.attacker === faction2 && w.defender === faction1)
  );
}

function getWar(st, faction1, faction2) {
  return st.wars.find(w => 
    (w.attacker === faction1 && w.defender === faction2) ||
    (w.attacker === faction2 && w.defender === faction1)
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// WAR SYSTEM
// ══════════════════════════════════════════════════════════════════════════════

function declareWar(st, attackerId, defenderId, reason = 'Unknown') {
  if (areAtWar(st, attackerId, defenderId)) return null;
  
  const attacker = getFaction(st, attackerId);
  const defender = getFaction(st, defenderId);
  if (!attacker || !defender) return null;
  
  const war = {
    id: `war_${Date.now()}`,
    attacker: attackerId,
    defender: defenderId,
    reason,
    startDay: getCurrentDay(),
    warScore: 0, // Positive = attacker winning, Negative = defender winning
    battles: [],
    attackerExhaustion: 0,
    defenderExhaustion: 0,
    status: 'active', // active, attacker_victory, defender_victory, white_peace
  };
  
  st.wars.push(war);
  
  // War declaration tanks relationships
  setRelationship(st, attackerId, defenderId, -100);
  
  // Increase world tension
  st.worldTension = Math.min(100, st.worldTension + 15);
  
  // Log event
  addEvent(st, 'war_declared', `${attacker.name} has declared war on ${defender.name}! Reason: ${reason}`, [attackerId, defenderId]);
  
  // Allied factions get dragged in (relationship > 60)
  for (const faction of st.factions) {
    if (faction.id === attackerId || faction.id === defenderId) continue;
    
    const relWithAttacker = getRelationship(st, faction.id, attackerId);
    const relWithDefender = getRelationship(st, faction.id, defenderId);
    
    // Strong allies might join
    if (relWithDefender >= 70 && relWithAttacker < 30) {
      modifyRelationship(st, faction.id, attackerId, -30);
      addEvent(st, 'diplomatic', `${faction.name} condemns ${attacker.name}'s aggression!`, [faction.id, attackerId]);
    }
    if (relWithAttacker >= 70 && relWithDefender < 30) {
      modifyRelationship(st, faction.id, defenderId, -20);
    }
  }
  
  return war;
}

function resolveBattle(st, warId) {
  const war = st.wars.find(w => w.id === warId);
  if (!war || war.status !== 'active') return null;
  
  const attacker = getFaction(st, war.attacker);
  const defender = getFaction(st, war.defender);
  if (!attacker || !defender) return null;
  
  // Calculate battle strength (military + random factor - exhaustion)
  const attackerStrength = attacker.military * (1 - war.attackerExhaustion / 200) * (0.7 + Math.random() * 0.6);
  const defenderStrength = defender.military * (1 - war.defenderExhaustion / 200) * (0.7 + Math.random() * 0.6);
  
  const attackerWins = attackerStrength > defenderStrength;
  const margin = Math.abs(attackerStrength - defenderStrength);
  const isDecisive = margin > 20;
  
  // Create battle record
  const battle = {
    id: `battle_${Date.now()}`,
    day: getCurrentDay(),
    winner: attackerWins ? war.attacker : war.defender,
    loser: attackerWins ? war.defender : war.attacker,
    decisive: isDecisive,
    attackerLosses: Math.round(5 + Math.random() * 10 + (attackerWins ? 0 : 5)),
    defenderLosses: Math.round(5 + Math.random() * 10 + (attackerWins ? 5 : 0)),
  };
  
  war.battles.push(battle);
  
  // Update war score
  const scoreChange = isDecisive ? 15 : 8;
  war.warScore += attackerWins ? scoreChange : -scoreChange;
  war.warScore = Math.max(-100, Math.min(100, war.warScore));
  
  // Increase exhaustion
  war.attackerExhaustion += battle.attackerLosses;
  war.defenderExhaustion += battle.defenderLosses;
  
  // Affect military strength temporarily
  attacker.military = Math.max(20, attacker.military - Math.round(battle.attackerLosses / 3));
  defender.military = Math.max(20, defender.military - Math.round(battle.defenderLosses / 3));
  
  // Log event
  const winnerName = attackerWins ? attacker.name : defender.name;
  const loserName = attackerWins ? defender.name : attacker.name;
  const battleType = isDecisive ? 'decisive victory' : 'victory';
  addEvent(st, 'battle', `${winnerName} wins a ${battleType} against ${loserName}!`, [war.attacker, war.defender]);
  
  // Check for war end conditions
  checkWarEnd(st, war);
  
  return battle;
}

function checkWarEnd(st, war) {
  const attacker = getFaction(st, war.attacker);
  const defender = getFaction(st, war.defender);
  
  // Victory conditions
  if (war.warScore >= 80) {
    endWar(st, war, 'attacker_victory');
  } else if (war.warScore <= -80) {
    endWar(st, war, 'defender_victory');
  } else if (war.attackerExhaustion >= 100 && war.defenderExhaustion >= 100) {
    endWar(st, war, 'white_peace');
  } else if (war.attackerExhaustion >= 120) {
    endWar(st, war, 'defender_victory');
  } else if (war.defenderExhaustion >= 120) {
    endWar(st, war, 'attacker_victory');
  }
}

function endWar(st, war, outcome) {
  war.status = outcome;
  war.endDay = getCurrentDay();
  
  const attacker = getFaction(st, war.attacker);
  const defender = getFaction(st, war.defender);
  
  let message = '';
  
  if (outcome === 'attacker_victory') {
    message = `${attacker.name} has won the war against ${defender.name}!`;
    // Victor gets economic boost, loser suffers
    attacker.economy = Math.min(100, attacker.economy + 10);
    defender.economy = Math.max(10, defender.economy - 15);
    defender.stability = Math.max(10, defender.stability - 20);
    // Relationship stays terrible
    setRelationship(st, war.attacker, war.defender, -80);
  } else if (outcome === 'defender_victory') {
    message = `${defender.name} has successfully defended against ${attacker.name}!`;
    defender.stability = Math.min(100, defender.stability + 10);
    attacker.stability = Math.max(10, attacker.stability - 15);
    setRelationship(st, war.attacker, war.defender, -70);
  } else {
    message = `${attacker.name} and ${defender.name} have agreed to a white peace.`;
    // Both exhausted, slight stability hit
    attacker.stability = Math.max(10, attacker.stability - 5);
    defender.stability = Math.max(10, defender.stability - 5);
    setRelationship(st, war.attacker, war.defender, -50);
  }
  
  // Create peace treaty
  const treaty = {
    id: `treaty_${Date.now()}`,
    type: 'peace',
    parties: [war.attacker, war.defender],
    startDay: getCurrentDay(),
    duration: 100, // Days until relations can normalize
    terms: outcome,
  };
  st.treaties.push(treaty);
  
  // Decrease world tension
  st.worldTension = Math.max(0, st.worldTension - 10);
  
  addEvent(st, 'war_ended', message, [war.attacker, war.defender]);
  
  // Remove from active wars
  st.wars = st.wars.filter(w => w.id !== war.id);
}

function offerPeace(st, warId, offerer) {
  const war = st.wars.find(w => w.id === warId);
  if (!war || war.status !== 'active') return false;
  
  // AI logic: accept peace based on war score and exhaustion
  const isAttacker = offerer === war.attacker;
  const theirExhaustion = isAttacker ? war.attackerExhaustion : war.defenderExhaustion;
  const enemyExhaustion = isAttacker ? war.defenderExhaustion : war.attackerExhaustion;
  const favorableScore = isAttacker ? war.warScore < 0 : war.warScore > 0;
  
  // More likely to accept if exhausted or losing
  const acceptChance = 0.3 + (theirExhaustion / 200) + (favorableScore ? 0.2 : 0) + (enemyExhaustion / 300);
  
  if (Math.random() < acceptChance) {
    endWar(st, war, 'white_peace');
    return true;
  }
  
  addEvent(st, 'diplomatic', `Peace offer rejected!`, [war.attacker, war.defender]);
  return false;
}

// ══════════════════════════════════════════════════════════════════════════════
// TREATY SYSTEM
// ══════════════════════════════════════════════════════════════════════════════

function createTreaty(st, type, faction1, faction2, duration = 50) {
  const f1 = getFaction(st, faction1);
  const f2 = getFaction(st, faction2);
  if (!f1 || !f2) return null;
  
  // Can't treaty during war
  if (areAtWar(st, faction1, faction2)) return null;
  
  const treaty = {
    id: `treaty_${Date.now()}`,
    type, // 'alliance', 'trade', 'non_aggression', 'peace'
    parties: [faction1, faction2],
    startDay: getCurrentDay(),
    duration,
  };
  
  st.treaties.push(treaty);
  
  // Improve relations based on treaty type
  let relBoost = 0;
  let eventMsg = '';
  
  switch (type) {
    case 'alliance':
      relBoost = 40;
      eventMsg = `${f1.name} and ${f2.name} have formed a military alliance!`;
      break;
    case 'trade':
      relBoost = 20;
      eventMsg = `${f1.name} and ${f2.name} have signed a trade agreement.`;
      f1.economy = Math.min(100, f1.economy + 5);
      f2.economy = Math.min(100, f2.economy + 5);
      break;
    case 'non_aggression':
      relBoost = 15;
      eventMsg = `${f1.name} and ${f2.name} have signed a non-aggression pact.`;
      break;
  }
  
  modifyRelationship(st, faction1, faction2, relBoost);
  addEvent(st, 'treaty', eventMsg, [faction1, faction2]);
  
  st.worldTension = Math.max(0, st.worldTension - 5);
  
  return treaty;
}

function breakTreaty(st, treatyId, breaker) {
  const treaty = st.treaties.find(t => t.id === treatyId);
  if (!treaty) return;
  
  const breakerFaction = getFaction(st, breaker);
  const otherParty = treaty.parties.find(p => p !== breaker);
  const otherFaction = getFaction(st, otherParty);
  
  // Breaking treaties is BAD for reputation
  for (const faction of st.factions) {
    if (faction.id !== breaker) {
      modifyRelationship(st, breaker, faction.id, -15);
    }
  }
  
  // Especially bad with the other party
  setRelationship(st, breaker, otherParty, -60);
  
  addEvent(st, 'treaty_broken', `${breakerFaction.name} has broken their ${treaty.type} treaty with ${otherFaction.name}! Their reputation suffers.`, [breaker, otherParty]);
  
  st.treaties = st.treaties.filter(t => t.id !== treatyId);
  st.worldTension = Math.min(100, st.worldTension + 10);
}

// ══════════════════════════════════════════════════════════════════════════════
// WORLD SIMULATION
// ══════════════════════════════════════════════════════════════════════════════

function getCurrentDay() {
  // Try to get from VTSS
  if (window.VTSS) {
    const vtss = window.VTSS.getState();
    if (vtss?.time) {
      return (vtss.time.year * 360) + (vtss.time.month * 36) + vtss.time.day;
    }
  }
  return Math.floor(Date.now() / 86400000); // Fallback to real days
}

function getCurrentHour() {
  if (window.VTSS) {
    const vtss = window.VTSS.getState();
    if (vtss?.time) {
      return vtss.time.hour;
    }
  }
  return new Date().getHours();
}

// Track last processed time more granularly
function getTimeKey() {
  if (window.VTSS) {
    const vtss = window.VTSS.getState();
    if (vtss?.time) {
      // Create a unique key for year-month-day-hour
      return `${vtss.time.year}-${vtss.time.month}-${vtss.time.day}-${vtss.time.hour}`;
    }
  }
  return `real-${getCurrentDay()}-${getCurrentHour()}`;
}

function tickWorld(st, forceFullTick = false) {
  const currentDay = getCurrentDay();
  const currentHour = getCurrentHour();
  const timeKey = getTimeKey();
  
  // Initialize tracking if needed
  if (!st.lastTimeKey) st.lastTimeKey = timeKey;
  if (!st.lastTickHour) st.lastTickHour = currentHour;
  
  // Already processed this exact time
  if (st.lastTimeKey === timeKey && !forceFullTick) return { events: [] };
  
  const daysPassed = Math.min(Math.max(0, currentDay - st.lastTickDay), 365); // Cap at 1 year
  const hoursPassed = calculateHoursPassed(st, currentDay, currentHour);
  
  st.lastTickDay = currentDay;
  st.lastTickHour = currentHour;
  st.lastTimeKey = timeKey;
  
  const newEvents = [];
  
  // DAILY EVENTS (wars, major diplomatic shifts)
  if (daysPassed > 0) {
    for (let d = 0; d < daysPassed; d++) {
      // Process each active war - battles happen daily
      for (const war of st.wars.filter(w => w.status === 'active')) {
        // More days = more battles, but cap per day
        const battleChance = 0.35; // 35% chance per day
        if (Math.random() < battleChance) {
          const battle = resolveBattle(st, war.id);
          if (battle) newEvents.push({ type: 'battle', data: battle });
        }
      }
      
      // Daily random diplomatic events (10% per day)
      if (Math.random() < 0.12) {
        const evt = generateRandomEvent(st);
        if (evt) newEvents.push(evt);
      }
      
      // Slowly recover military strength
      for (const faction of st.factions) {
        if (faction.military < 80) {
          faction.military = Math.min(100, faction.military + 0.3);
        }
      }
      
      // Tension slowly decreases over time
      st.worldTension = Math.max(0, st.worldTension - 0.15);
    }
  }
  
  // HOURLY EVENTS (minor incidents, rumors, small tension changes)
  if (hoursPassed > 0) {
    // Every ~6 hours, chance of minor event
    const minorEventChance = Math.min(hoursPassed / 6, 4) * 0.15;
    if (Math.random() < minorEventChance) {
      const evt = generateMinorEvent(st);
      if (evt) newEvents.push(evt);
    }
    
    // Sleeping (8+ hours passed) might bring news
    if (hoursPassed >= 6 && Math.random() < 0.25) {
      const evt = generateNewsEvent(st);
      if (evt) newEvents.push(evt);
    }
  }
  
  // TIME SKIP SPECIAL (month+ = major events guaranteed)
  if (daysPassed >= 30) {
    // Month skip = guarantee some major events
    const majorEvents = Math.floor(daysPassed / 15); // 1 major event per ~2 weeks
    for (let i = 0; i < Math.min(majorEvents, 5); i++) {
      const evt = generateMajorEvent(st);
      if (evt) newEvents.push(evt);
    }
    
    // Wars might end during long time skips
    for (const war of st.wars.filter(w => w.status === 'active')) {
      // Simulate multiple battles
      const simulatedBattles = Math.floor(daysPassed / 3);
      for (let b = 0; b < simulatedBattles; b++) {
        if (war.status === 'active') {
          resolveBattle(st, war.id);
        }
      }
    }
  }
  
  return { events: newEvents, daysPassed, hoursPassed };
}

function calculateHoursPassed(st, currentDay, currentHour) {
  const lastDay = st.lastTickDay || currentDay;
  const lastHour = st.lastTickHour || currentHour;
  
  const dayDiff = currentDay - lastDay;
  const hourDiff = currentHour - lastHour;
  
  return Math.max(0, (dayDiff * 24) + hourDiff);
}

function generateMinorEvent(st) {
  const types = ['rumor', 'trade', 'minor_incident'];
  const type = types[Math.floor(Math.random() * types.length)];
  
  const f1 = st.factions[Math.floor(Math.random() * st.factions.length)];
  let f2 = st.factions[Math.floor(Math.random() * st.factions.length)];
  while (f2.id === f1.id) f2 = st.factions[Math.floor(Math.random() * st.factions.length)];
  
  switch (type) {
    case 'rumor':
      const rumors = [
        `Travelers speak of unrest in ${f1.shortName} lands.`,
        `Merchants report ${f2.shortName} caravans moving unusually.`,
        `Rumors of a secret meeting between ${f1.shortName} and ${f2.shortName} officials.`,
      ];
      addEvent(st, 'rumor', rumors[Math.floor(Math.random() * rumors.length)], [f1.id]);
      return { type: 'rumor' };
      
    case 'trade':
      if (getRelationship(st, f1.id, f2.id) > 0) {
        addEvent(st, 'trade', `Trade continues between ${f1.shortName} and ${f2.shortName}.`, [f1.id, f2.id]);
        return { type: 'trade' };
      }
      break;
      
    case 'minor_incident':
      if (getRelationship(st, f1.id, f2.id) < 0) {
        modifyRelationship(st, f1.id, f2.id, -1);
        addEvent(st, 'incident', `Minor border dispute between ${f1.shortName} and ${f2.shortName}.`, [f1.id, f2.id]);
        return { type: 'incident' };
      }
      break;
  }
  return null;
}

function generateNewsEvent(st) {
  // News you might hear after sleeping
  const hasWar = st.wars.length > 0;
  
  if (hasWar && Math.random() < 0.5) {
    const war = st.wars[Math.floor(Math.random() * st.wars.length)];
    const attacker = getFaction(st, war.attacker);
    const defender = getFaction(st, war.defender);
    const winning = war.warScore > 0 ? attacker : defender;
    
    addEvent(st, 'rumor', `News arrives: The war between ${attacker.shortName} and ${defender.shortName} continues. ${winning.shortName} is said to have the upper hand.`, [war.attacker, war.defender]);
    return { type: 'war_news' };
  }
  
  // Faction internal news
  const f = st.factions[Math.floor(Math.random() * st.factions.length)];
  const internalNews = [
    `${f.name} is reportedly strengthening their borders.`,
    `Economic reports from ${f.shortName} show ${f.economy > 60 ? 'growth' : 'struggles'}.`,
    `The ${f.shortName} military has been seen ${f.aggression > 50 ? 'mobilizing' : 'training'}.`,
  ];
  addEvent(st, 'rumor', internalNews[Math.floor(Math.random() * internalNews.length)], [f.id]);
  return { type: 'news' };
}

function generateMajorEvent(st) {
  // Big events for time skips
  const types = ['war_declaration', 'alliance', 'coup', 'disaster'];
  const type = types[Math.floor(Math.random() * types.length)];
  
  const f1 = st.factions[Math.floor(Math.random() * st.factions.length)];
  let f2 = st.factions[Math.floor(Math.random() * st.factions.length)];
  while (f2.id === f1.id) f2 = st.factions[Math.floor(Math.random() * st.factions.length)];
  
  const rel = getRelationship(st, f1.id, f2.id);
  
  switch (type) {
    case 'war_declaration':
      // Only if hostile and not already at war
      if (rel < -50 && !areAtWar(st, f1.id, f2.id) && (f1.aggression + f2.aggression) > 80) {
        const aggressor = f1.aggression > f2.aggression ? f1 : f2;
        const target = aggressor === f1 ? f2 : f1;
        declareWar(st, aggressor.id, target.id, 'Long-standing tensions erupted');
        return { type: 'war_declared', factions: [aggressor.id, target.id] };
      }
      break;
      
    case 'alliance':
      // Only if friendly
      if (rel > 40 && !st.treaties.some(t => t.type === 'alliance' && t.parties.includes(f1.id) && t.parties.includes(f2.id))) {
        createTreaty(st, 'alliance', f1.id, f2.id);
        return { type: 'alliance', factions: [f1.id, f2.id] };
      }
      break;
      
    case 'coup':
      // Low stability = chance of internal strife
      if (f1.stability < 40 && Math.random() < 0.3) {
        f1.stability = Math.max(10, f1.stability - 15);
        f1.military = Math.max(20, f1.military - 10);
        addEvent(st, 'incident', `Internal strife rocks ${f1.name}! The government struggles to maintain control.`, [f1.id]);
        st.worldTension = Math.min(100, st.worldTension + 8);
        return { type: 'coup', faction: f1.id };
      }
      break;
      
    case 'disaster':
      if (Math.random() < 0.2) {
        const disasters = ['famine', 'plague', 'earthquake', 'floods'];
        const disaster = disasters[Math.floor(Math.random() * disasters.length)];
        f1.economy = Math.max(10, f1.economy - 10);
        f1.stability = Math.max(10, f1.stability - 5);
        addEvent(st, 'incident', `${f1.name} suffers from a devastating ${disaster}.`, [f1.id]);
        return { type: 'disaster', faction: f1.id, disaster };
      }
      break;
  }
  
  return null;
}

function generateRandomEvent(st) {
  const eventTypes = ['tension', 'incident', 'trade', 'rumor'];
  const type = eventTypes[Math.floor(Math.random() * eventTypes.length)];
  
  // Pick two random factions
  const f1 = st.factions[Math.floor(Math.random() * st.factions.length)];
  let f2 = st.factions[Math.floor(Math.random() * st.factions.length)];
  while (f2.id === f1.id) {
    f2 = st.factions[Math.floor(Math.random() * st.factions.length)];
  }
  
  const rel = getRelationship(st, f1.id, f2.id);
  
  switch (type) {
    case 'tension':
      if (rel < -30) {
        modifyRelationship(st, f1.id, f2.id, -5);
        addEvent(st, 'incident', `Border tensions rise between ${f1.name} and ${f2.name}.`, [f1.id, f2.id]);
        st.worldTension = Math.min(100, st.worldTension + 3);
        
        // High tension + hostile = possible war
        if (rel < -70 && st.worldTension > 60 && Math.random() < (f1.aggression + f2.aggression) / 400) {
          const aggressor = f1.aggression > f2.aggression ? f1 : f2;
          const target = aggressor === f1 ? f2 : f1;
          declareWar(st, aggressor.id, target.id, 'Escalating border tensions');
        }
        return { type: 'tension' };
      }
      break;
      
    case 'incident':
      if (rel < 0) {
        const incidents = [
          `A ${f1.shortName} merchant was robbed in ${f2.shortName} territory.`,
          `${f1.shortName} scouts spotted near ${f2.shortName} border.`,
          `Diplomatic envoy from ${f1.name} insulted by ${f2.shortName} nobles.`,
        ];
        addEvent(st, 'incident', incidents[Math.floor(Math.random() * incidents.length)], [f1.id, f2.id]);
        modifyRelationship(st, f1.id, f2.id, -3);
        return { type: 'incident' };
      }
      break;
      
    case 'trade':
      if (rel > 0) {
        modifyRelationship(st, f1.id, f2.id, 2);
        addEvent(st, 'trade', `Trade flourishes between ${f1.name} and ${f2.name}.`, [f1.id, f2.id]);
        return { type: 'trade' };
      }
      break;
      
    case 'rumor':
      const rumors = [
        `Rumors of ${f1.shortName} military buildup concern neighbors.`,
        `${f2.name} reportedly seeking new alliances.`,
        `Unrest reported in ${f1.shortName} territories.`,
        `${f2.shortName} treasury said to be overflowing.`,
      ];
      addEvent(st, 'rumor', rumors[Math.floor(Math.random() * rumors.length)], [f1.id]);
      return { type: 'rumor' };
  }
  
  return null;
}

function addEvent(st, type, message, involvedFactions = []) {
  st.events.unshift({
    id: `evt_${Date.now()}`,
    type,
    message,
    factions: involvedFactions,
    day: getCurrentDay(),
    timestamp: Date.now(),
  });
  
  // Keep only last 50 events
  if (st.events.length > 50) {
    st.events = st.events.slice(0, 50);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// NARRATIVE PARSING
// ══════════════════════════════════════════════════════════════════════════════

function parseNarrativeForDiplomacy(text, st) {
  const textLower = text.toLowerCase();
  let changed = false;
  
  // War declarations
  const warPatterns = [
    /(\w+(?:\s+\w+)?)\s+(?:has\s+)?declar(?:e[sd]?|ing)\s+war\s+(?:on|against)\s+(?:the\s+)?(\w+(?:\s+\w+)?)/gi,
    /war\s+(?:has\s+)?(?:been\s+)?declared\s+between\s+(?:the\s+)?(\w+(?:\s+\w+)?)\s+and\s+(?:the\s+)?(\w+(?:\s+\w+)?)/gi,
  ];
  
  for (const pattern of warPatterns) {
    let match;
    while ((match = pattern.exec(textLower)) !== null) {
      const faction1 = findFactionByName(st, match[1]);
      const faction2 = findFactionByName(st, match[2]);
      if (faction1 && faction2 && !areAtWar(st, faction1.id, faction2.id)) {
        declareWar(st, faction1.id, faction2.id, 'Narrative event');
        changed = true;
      }
    }
  }
  
  // Peace treaties
  const peacePatterns = [
    /(\w+(?:\s+\w+)?)\s+(?:and\s+)?(?:the\s+)?(\w+(?:\s+\w+)?)\s+(?:have\s+)?sign(?:ed)?\s+(?:a\s+)?peace/gi,
    /peace\s+(?:treaty|agreement)\s+(?:signed\s+)?between\s+(?:the\s+)?(\w+(?:\s+\w+)?)\s+and\s+(?:the\s+)?(\w+(?:\s+\w+)?)/gi,
  ];
  
  for (const pattern of peacePatterns) {
    let match;
    while ((match = pattern.exec(textLower)) !== null) {
      const faction1 = findFactionByName(st, match[1]);
      const faction2 = findFactionByName(st, match[2]);
      if (faction1 && faction2) {
        const war = getWar(st, faction1.id, faction2.id);
        if (war) {
          endWar(st, war, 'white_peace');
          changed = true;
        }
      }
    }
  }
  
  // Alliance formation
  const alliancePatterns = [
    /(\w+(?:\s+\w+)?)\s+(?:and\s+)?(?:the\s+)?(\w+(?:\s+\w+)?)\s+(?:have\s+)?form(?:ed)?\s+(?:an?\s+)?alliance/gi,
    /alliance\s+(?:formed\s+)?between\s+(?:the\s+)?(\w+(?:\s+\w+)?)\s+and\s+(?:the\s+)?(\w+(?:\s+\w+)?)/gi,
  ];
  
  for (const pattern of alliancePatterns) {
    let match;
    while ((match = pattern.exec(textLower)) !== null) {
      const faction1 = findFactionByName(st, match[1]);
      const faction2 = findFactionByName(st, match[2]);
      if (faction1 && faction2) {
        createTreaty(st, 'alliance', faction1.id, faction2.id);
        changed = true;
      }
    }
  }
  
  // Battle results
  const battlePatterns = [
    /(\w+(?:\s+\w+)?)\s+(?:has\s+)?(?:won|defeats?|crush(?:es|ed)?|victorious)\s+(?:against|over|in battle against)\s+(?:the\s+)?(\w+(?:\s+\w+)?)/gi,
  ];
  
  for (const pattern of battlePatterns) {
    let match;
    while ((match = pattern.exec(textLower)) !== null) {
      const winner = findFactionByName(st, match[1]);
      const loser = findFactionByName(st, match[2]);
      if (winner && loser) {
        const war = getWar(st, winner.id, loser.id);
        if (war) {
          // Manually add a battle favoring the narrative winner
          const isAttacker = war.attacker === winner.id;
          war.warScore += isAttacker ? 12 : -12;
          war.battles.push({
            id: `battle_${Date.now()}`,
            day: getCurrentDay(),
            winner: winner.id,
            loser: loser.id,
            decisive: true,
            attackerLosses: isAttacker ? 5 : 10,
            defenderLosses: isAttacker ? 10 : 5,
          });
          checkWarEnd(st, war);
          changed = true;
        }
      }
    }
  }
  
  return changed;
}

function findFactionByName(st, name) {
  const nameLower = name.toLowerCase().trim();
  return st.factions.find(f => 
    f.name.toLowerCase().includes(nameLower) ||
    f.shortName.toLowerCase().includes(nameLower) ||
    nameLower.includes(f.shortName.toLowerCase())
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// UI
// ══════════════════════════════════════════════════════════════════════════════

const UI = {
  mounted: false,
  root: null,
  panelOpen: false,
  selectedFaction: null,
  view: 'graph', // 'graph', 'list', 'events'
};

// Cleanup references for proper resource management
const _cleanup = {
  vtssPollingIntervalId: null,
  vtssCheckIntervalId: null,
  journeyUnsubscribers: [],
};

function mountUI() {
  if (UI.mounted) return;
  UI.mounted = true;
  
  // Launcher button
  const launcher = document.createElement('button');
  launcher.id = 'vdip_launcher';
  launcher.className = 'vdip_launcher';
  launcher.innerHTML = '⚔️';
  launcher.title = 'Open Diplomacy';
  launcher.addEventListener('click', togglePanel);
  document.body.appendChild(launcher);
  
  // Main panel
  const panel = document.createElement('div');
  panel.id = 'vdip_root';
  panel.className = 'vdip_panel vdip_hidden';
  panel.innerHTML = `
    <div class="vdip_header">
      <div class="vdip_title">
        <span class="vdip_title_icon">⚔️</span>
        <span>Diplomacy</span>
        <span class="vdip_tension" id="vdip_tension" title="World Tension">🌡️ 30%</span>
      </div>
      <div class="vdip_header_actions">
        <button class="vdip_btn vdip_btn_active" id="vdip_tab_graph" title="Network Graph">🕸️</button>
        <button class="vdip_btn" id="vdip_tab_list" title="Faction List">📋</button>
        <button class="vdip_btn" id="vdip_tab_events" title="Events Log">📜</button>
        <button class="vdip_btn" id="vdip_btn_tick" title="Advance World">⏩</button>
        <button class="vdip_btn" id="vdip_btn_close" title="Close">✕</button>
      </div>
    </div>
    
    <div class="vdip_body">
      <div class="vdip_main">
        <!-- Graph View -->
        <div class="vdip_view vdip_view_graph" id="vdip_view_graph">
          <svg class="vdip_graph_svg" id="vdip_graph_svg" viewBox="0 0 100 100">
            <!-- Rendered by JS -->
          </svg>
        </div>
        
        <!-- List View -->
        <div class="vdip_view vdip_view_list vdip_hidden" id="vdip_view_list">
          <div class="vdip_faction_list" id="vdip_faction_list">
            <!-- Rendered by JS -->
          </div>
        </div>
        
        <!-- Events View -->
        <div class="vdip_view vdip_view_events vdip_hidden" id="vdip_view_events">
          <div class="vdip_events_list" id="vdip_events_list">
            <!-- Rendered by JS -->
          </div>
        </div>
      </div>
      
      <!-- Sidebar for selected faction -->
      <div class="vdip_sidebar" id="vdip_sidebar">
        <div class="vdip_sidebar_content" id="vdip_sidebar_content">
          <div class="vdip_sidebar_empty">Select a faction</div>
        </div>
      </div>
    </div>
    
    <div class="vdip_footer">
      <div class="vdip_wars_indicator" id="vdip_wars_indicator">
        <!-- Active wars shown here -->
      </div>
      <div class="vdip_status" id="vdip_status">Ready</div>
    </div>
  `;
  
  document.body.appendChild(panel);
  UI.root = panel;
  
  setupEventListeners();
  render();
  
  console.log('[Diplomacy] UI mounted');
}

function setupEventListeners() {
  document.getElementById('vdip_btn_close').addEventListener('click', togglePanel);
  document.getElementById('vdip_btn_tick').addEventListener('click', () => {
    const st = getChatState();
    st.lastTickDay = 0; // Force tick
    tickWorld(st);
    commitState(st);
    render();
    setStatus('World advanced');
  });
  
  // Tab switching
  document.getElementById('vdip_tab_graph').addEventListener('click', () => switchView('graph'));
  document.getElementById('vdip_tab_list').addEventListener('click', () => switchView('list'));
  document.getElementById('vdip_tab_events').addEventListener('click', () => switchView('events'));
}

function switchView(view) {
  UI.view = view;
  
  // Update tab buttons
  document.querySelectorAll('.vdip_header_actions .vdip_btn').forEach(btn => {
    btn.classList.remove('vdip_btn_active');
  });
  document.getElementById(`vdip_tab_${view}`).classList.add('vdip_btn_active');
  
  // Show/hide views
  document.querySelectorAll('.vdip_view').forEach(v => v.classList.add('vdip_hidden'));
  document.getElementById(`vdip_view_${view}`).classList.remove('vdip_hidden');
  
  render();
}

function togglePanel() {
  UI.panelOpen = !UI.panelOpen;
  UI.root.classList.toggle('vdip_hidden', !UI.panelOpen);
  if (UI.panelOpen) {
    const st = getChatState();
    tickWorld(st);
    commitState(st);
    render();
  }
}

function render() {
  const st = getChatState();
  
  // Update tension
  document.getElementById('vdip_tension').textContent = `🌡️ ${Math.round(st.worldTension)}%`;
  document.getElementById('vdip_tension').style.color = st.worldTension > 70 ? '#f44336' : st.worldTension > 40 ? '#FF9800' : '#4CAF50';
  
  // Update wars indicator
  renderWarsIndicator(st);
  
  // Render current view
  if (UI.view === 'graph') renderGraph(st);
  else if (UI.view === 'list') renderList(st);
  else if (UI.view === 'events') renderEvents(st);
}

function renderGraph(st) {
  const svg = document.getElementById('vdip_graph_svg');
  let html = '';
  
  // Draw relationship lines first (behind nodes)
  for (let i = 0; i < st.factions.length; i++) {
    for (let j = i + 1; j < st.factions.length; j++) {
      const f1 = st.factions[i];
      const f2 = st.factions[j];
      const rel = getRelationship(st, f1.id, f2.id);
      const status = getRelationshipStatus(rel);
      const atWar = areAtWar(st, f1.id, f2.id);
      
      // Only draw significant relationships
      if (Math.abs(rel) > 20 || atWar) {
        const strokeWidth = atWar ? 0.8 : Math.abs(rel) / 100 * 0.5 + 0.1;
        const dashArray = atWar ? '1,0.5' : (rel < 0 ? '0.5,0.5' : 'none');
        const color = atWar ? '#ff0000' : status.color;
        const opacity = Math.abs(rel) / 100 * 0.6 + 0.2;
        
        html += `<line 
          x1="${f1.graphX}" y1="${f1.graphY}" 
          x2="${f2.graphX}" y2="${f2.graphY}"
          stroke="${color}" 
          stroke-width="${strokeWidth}"
          stroke-dasharray="${dashArray}"
          opacity="${opacity}"
          class="vdip_edge ${atWar ? 'vdip_edge_war' : ''}"
        />`;
      }
    }
  }
  
  // Draw faction nodes
  for (const faction of st.factions) {
    const isSelected = UI.selectedFaction === faction.id;
    const atWar = st.wars.some(w => w.attacker === faction.id || w.defender === faction.id);
    
    html += `
      <g class="vdip_node ${isSelected ? 'vdip_node_selected' : ''} ${atWar ? 'vdip_node_war' : ''}" 
         data-id="${faction.id}"
         transform="translate(${faction.graphX}, ${faction.graphY})">
        <circle r="4" fill="${faction.color}" stroke="${isSelected ? '#fff' : 'rgba(0,0,0,0.3)'}" stroke-width="${isSelected ? 0.5 : 0.2}"/>
        ${atWar ? '<circle r="5" fill="none" stroke="#ff0000" stroke-width="0.3" class="vdip_war_pulse"/>' : ''}
        <text y="7" text-anchor="middle" fill="#fff" font-size="2.5" font-weight="bold" class="vdip_node_label">${faction.shortName}</text>
      </g>
    `;
  }
  
  svg.innerHTML = html;
  
  // Add click handlers
  svg.querySelectorAll('.vdip_node').forEach(node => {
    node.addEventListener('click', () => {
      const id = node.dataset.id;
      selectFaction(id);
    });
  });
}

function renderList(st) {
  const container = document.getElementById('vdip_faction_list');
  let html = '';
  
  for (const faction of st.factions) {
    const atWar = st.wars.some(w => w.attacker === faction.id || w.defender === faction.id);
    
    html += `
      <div class="vdip_faction_card ${atWar ? 'vdip_at_war' : ''}" data-id="${faction.id}">
        <div class="vdip_faction_header">
          <div class="vdip_faction_color" style="background: ${faction.color}"></div>
          <div class="vdip_faction_name">${faction.name}</div>
          ${atWar ? '<span class="vdip_war_badge">⚔️ AT WAR</span>' : ''}
        </div>
        <div class="vdip_faction_stats">
          <span title="Military">⚔️ ${faction.military}</span>
          <span title="Economy">💰 ${faction.economy}</span>
          <span title="Stability">🏛️ ${faction.stability}</span>
        </div>
      </div>
    `;
  }
  
  container.innerHTML = html;
  
  container.querySelectorAll('.vdip_faction_card').forEach(card => {
    card.addEventListener('click', () => selectFaction(card.dataset.id));
  });
}

function renderEvents(st) {
  const container = document.getElementById('vdip_events_list');
  
  if (st.events.length === 0) {
    container.innerHTML = '<div class="vdip_events_empty">No events yet. Advance the world to generate events.</div>';
    return;
  }
  
  let html = '';
  for (const event of st.events.slice(0, 30)) {
    const icon = {
      'war_declared': '⚔️',
      'war_ended': '🕊️',
      'battle': '⚔️',
      'treaty': '📜',
      'treaty_broken': '💔',
      'incident': '⚡',
      'trade': '💰',
      'rumor': '👂',
      'diplomatic': '🤝',
    }[event.type] || '📌';
    
    const typeClass = event.type.includes('war') ? 'vdip_event_war' : 
                      event.type === 'battle' ? 'vdip_event_battle' : '';
    
    html += `
      <div class="vdip_event ${typeClass}">
        <span class="vdip_event_icon">${icon}</span>
        <span class="vdip_event_text">${event.message}</span>
      </div>
    `;
  }
  
  container.innerHTML = html;
}

function renderWarsIndicator(st) {
  const container = document.getElementById('vdip_wars_indicator');
  
  if (st.wars.length === 0) {
    container.innerHTML = '<span class="vdip_peace">☮️ Peace</span>';
    return;
  }
  
  let html = '';
  for (const war of st.wars) {
    const attacker = getFaction(st, war.attacker);
    const defender = getFaction(st, war.defender);
    const scoreColor = war.warScore > 0 ? attacker.color : defender.color;
    
    html += `
      <div class="vdip_war_mini" title="War Score: ${war.warScore}">
        <span style="color: ${attacker.color}">${attacker.shortName}</span>
        <span class="vdip_vs">⚔️</span>
        <span style="color: ${defender.color}">${defender.shortName}</span>
      </div>
    `;
  }
  
  container.innerHTML = html;
}

function selectFaction(factionId) {
  UI.selectedFaction = factionId;
  const st = getChatState();
  const faction = getFaction(st, factionId);
  
  if (!faction) return;
  
  const sidebar = document.getElementById('vdip_sidebar_content');
  const atWar = st.wars.filter(w => w.attacker === factionId || w.defender === factionId);
  const treaties = st.treaties.filter(t => t.parties.includes(factionId));
  
  // Build relationships list
  let relHtml = '';
  for (const other of st.factions) {
    if (other.id === factionId) continue;
    const rel = getRelationship(st, factionId, other.id);
    const status = getRelationshipStatus(rel);
    const isAtWar = areAtWar(st, factionId, other.id);
    
    relHtml += `
      <div class="vdip_rel_row ${isAtWar ? 'vdip_rel_war' : ''}">
        <span class="vdip_rel_name" style="color: ${other.color}">${other.shortName}</span>
        <span class="vdip_rel_value" style="color: ${status.color}">${rel > 0 ? '+' : ''}${rel}</span>
        <span class="vdip_rel_icon">${isAtWar ? '⚔️' : status.icon}</span>
      </div>
    `;
  }
  
  sidebar.innerHTML = `
    <div class="vdip_detail">
      <div class="vdip_detail_header">
        <div class="vdip_detail_color" style="background: ${faction.color}"></div>
        <div class="vdip_detail_titles">
          <div class="vdip_detail_name">${faction.name}</div>
          ${atWar.length > 0 ? '<div class="vdip_detail_war">⚔️ AT WAR</div>' : ''}
        </div>
      </div>
      
      <div class="vdip_detail_desc">${faction.desc}</div>
      
      <div class="vdip_detail_stats">
        <div class="vdip_stat">
          <span class="vdip_stat_label">Military</span>
          <div class="vdip_stat_bar"><div class="vdip_stat_fill vdip_stat_mil" style="width: ${faction.military}%"></div></div>
          <span class="vdip_stat_val">${faction.military}</span>
        </div>
        <div class="vdip_stat">
          <span class="vdip_stat_label">Economy</span>
          <div class="vdip_stat_bar"><div class="vdip_stat_fill vdip_stat_eco" style="width: ${faction.economy}%"></div></div>
          <span class="vdip_stat_val">${faction.economy}</span>
        </div>
        <div class="vdip_stat">
          <span class="vdip_stat_label">Stability</span>
          <div class="vdip_stat_bar"><div class="vdip_stat_fill vdip_stat_stab" style="width: ${faction.stability}%"></div></div>
          <span class="vdip_stat_val">${faction.stability}</span>
        </div>
      </div>
      
      <div class="vdip_detail_section">
        <div class="vdip_section_title">Relations</div>
        <div class="vdip_rel_list">${relHtml}</div>
      </div>
      
      ${atWar.length > 0 ? `
        <div class="vdip_detail_section">
          <div class="vdip_section_title">Active Wars</div>
          ${atWar.map(w => {
            const enemy = w.attacker === factionId ? getFaction(st, w.defender) : getFaction(st, w.attacker);
            const isAttacker = w.attacker === factionId;
            const winning = isAttacker ? w.warScore > 0 : w.warScore < 0;
            return `
              <div class="vdip_war_detail">
                <div class="vdip_war_vs">vs <span style="color: ${enemy.color}">${enemy.name}</span></div>
                <div class="vdip_war_score ${winning ? 'vdip_winning' : 'vdip_losing'}">
                  ${winning ? '↑ Winning' : '↓ Losing'} (${Math.abs(w.warScore)})
                </div>
                <div class="vdip_war_battles">${w.battles.length} battles fought</div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
      
      ${treaties.length > 0 ? `
        <div class="vdip_detail_section">
          <div class="vdip_section_title">Treaties</div>
          ${treaties.map(t => {
            const other = getFaction(st, t.parties.find(p => p !== factionId));
            return `<div class="vdip_treaty">${t.type} with ${other.shortName}</div>`;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
  
  render();
}

function setStatus(msg) {
  const el = document.getElementById('vdip_status');
  if (el) el.textContent = msg;
}

// ══════════════════════════════════════════════════════════════════════════════
// CLEANUP
// ══════════════════════════════════════════════════════════════════════════════

function cleanup() {
  // Clear VTSS polling intervals
  if (_cleanup.vtssPollingIntervalId) {
    clearInterval(_cleanup.vtssPollingIntervalId);
    _cleanup.vtssPollingIntervalId = null;
  }
  if (_cleanup.vtssCheckIntervalId) {
    clearInterval(_cleanup.vtssCheckIntervalId);
    _cleanup.vtssCheckIntervalId = null;
  }

  // Unsubscribe from Journey events
  _cleanup.journeyUnsubscribers.forEach(unsub => {
    if (typeof unsub === 'function') unsub();
  });
  _cleanup.journeyUnsubscribers = [];

  // Remove UI elements
  const launcher = document.getElementById('vdip_launcher');
  if (launcher) launcher.remove();
  if (UI.root) {
    UI.root.remove();
    UI.root = null;
  }
  UI.mounted = false;

  console.log('[Diplomacy] Cleanup complete');
}

// ══════════════════════════════════════════════════════════════════════════════
// GLOBAL API
// ══════════════════════════════════════════════════════════════════════════════

window.VDiplomacy = {
  open: () => { UI.panelOpen = true; UI.root.classList.remove('vdip_hidden'); render(); },
  close: () => { UI.panelOpen = false; UI.root.classList.add('vdip_hidden'); },
  toggle: togglePanel,
  
  getState: getChatState,
  getFaction: (id) => getFaction(getChatState(), id),
  getFactions: () => getChatState().factions,
  
  getRelationship: (f1, f2) => getRelationship(getChatState(), f1, f2),
  setRelationship: async (f1, f2, value) => {
    const st = getChatState();
    setRelationship(st, f1, f2, value);
    await commitState(st);
    render();
  },
  modifyRelationship: async (f1, f2, delta) => {
    const st = getChatState();
    modifyRelationship(st, f1, f2, delta);
    await commitState(st);
    render();
  },
  
  declareWar: async (attacker, defender, reason) => {
    const st = getChatState();
    const war = declareWar(st, attacker, defender, reason);
    await commitState(st);
    render();
    return war;
  },
  
  resolveBattle: async (warId) => {
    const st = getChatState();
    const battle = resolveBattle(st, warId || st.wars[0]?.id);
    await commitState(st);
    render();
    return battle;
  },
  
  offerPeace: async (warId, offerer) => {
    const st = getChatState();
    const result = offerPeace(st, warId, offerer);
    await commitState(st);
    render();
    return result;
  },
  
  createTreaty: async (type, f1, f2) => {
    const st = getChatState();
    const treaty = createTreaty(st, type, f1, f2);
    await commitState(st);
    render();
    return treaty;
  },
  
  tickWorld: async () => {
    const st = getChatState();
    st.lastTickDay = 0;
    tickWorld(st);
    await commitState(st);
    render();
  },
  
  parseNarrative: async (text) => {
    const st = getChatState();
    const changed = parseNarrativeForDiplomacy(text, st);
    if (changed) {
      await commitState(st);
      render();
    }
    return changed;
  },
  
  getActiveWars: () => getChatState().wars,
  getEvents: () => getChatState().events,

  render,

  // Cleanup (for extension unload)
  cleanup,
};

// ══════════════════════════════════════════════════════════════════════════════
// JOURNEY INTEGRATION - React to character's faction encounters!
// ══════════════════════════════════════════════════════════════════════════════

function subscribeToJourney() {
  if (!window.VJourney) {
    console.log('[Diplomacy] VJourney not available yet, retrying...');
    setTimeout(subscribeToJourney, 1000);
    return;
  }

  // Subscribe to faction encounters - highlight that faction, maybe generate events!
  const unsubFaction = window.VJourney.subscribe(window.VJourney.EVENTS.FACTION_ENCOUNTERED, async (data) => {
    console.log('[Diplomacy] Faction encountered via Journey:', data.faction);
    const st = getChatState();

    // Track which factions player has personally encountered
    if (!st.playerEncounteredFactions) st.playerEncounteredFactions = [];
    if (data.faction && !st.playerEncounteredFactions.includes(data.faction)) {
      st.playerEncounteredFactions.push(data.faction);
    }

    // Set as "focused" faction for UI highlighting
    st.focusedFaction = data.faction;

    await commitState(st);
    if (UI.panelOpen) render();
  });

  // Subscribe to combat - wars might break out or intensify!
  const unsubCombat = window.VJourney.subscribe(window.VJourney.EVENTS.COMBAT_STARTED, async (data) => {
    console.log('[Diplomacy] Combat detected via Journey');
    const st = getChatState();

    // If player is in combat in a faction's territory, increase tension
    if (st.focusedFaction) {
      const faction = st.factions.find(f => f.id === st.focusedFaction);
      if (faction) {
        st.worldTension = Math.min(100, (st.worldTension || 0) + 2);
      }
    }

    await commitState(st);
  });

  // Subscribe to location changes - entering faction territory
  const unsubLocation = window.VJourney.subscribe(window.VJourney.EVENTS.LOCATION_CHANGED, async (data) => {
    // Political locations might reveal diplomatic info
    if (data.tags?.includes('political') || data.tags?.includes('noble')) {
      const st = getChatState();
      st.lastPoliticalLocation = data.location;
      await commitState(st);
    }
  });

  // Store unsubscribe functions for cleanup
  if (unsubFaction) _cleanup.journeyUnsubscribers.push(unsubFaction);
  if (unsubCombat) _cleanup.journeyUnsubscribers.push(unsubCombat);
  if (unsubLocation) _cleanup.journeyUnsubscribers.push(unsubLocation);

  // Sync with current journey state
  const ctx = window.VJourney.getContext();
  if (ctx.faction) {
    const st = getChatState();
    st.focusedFaction = ctx.faction;
    if (!st.playerEncounteredFactions) st.playerEncounteredFactions = [];
    if (!st.playerEncounteredFactions.includes(ctx.faction)) {
      st.playerEncounteredFactions.push(ctx.faction);
    }
    commitState(st);
  }

  console.log('[Diplomacy] Subscribed to Journey Tracker!');
}

// ══════════════════════════════════════════════════════════════════════════════
// LIFECYCLE
// ══════════════════════════════════════════════════════════════════════════════

let lastVTSSTime = null;

function registerEvents() {
  if (!eventSource || !event_types) return;
  
  eventSource.on(event_types.CHAT_CHANGED, () => {
    console.log('[Diplomacy] Chat changed');
    lastVTSSTime = null; // Reset time tracking
    if (UI.panelOpen) render();
  });
  
  // Parse AI messages for diplomatic events
  eventSource.on(event_types.MESSAGE_RECEIVED, (msgId) => {
    setTimeout(async () => {
      try {
        const ctx = getSTContext();
        if (!ctx?.chat) return;
        
        const msg = ctx.chat.find(m => m.mes_id === msgId) || ctx.chat[ctx.chat.length - 1];
        if (msg?.mes && !msg.is_user) {
          const st = getChatState();
          
          // Parse for diplomatic events in the text
          const changed = parseNarrativeForDiplomacy(msg.mes, st);
          
          // ALSO tick the world based on VTSS time!
          const tickResult = tickWorld(st);
          
          if (changed || (tickResult.events && tickResult.events.length > 0)) {
            await commitState(st);
            if (UI.panelOpen) render();
            
            if (tickResult.events?.length > 0) {
              console.log(`[Diplomacy] Time tick generated ${tickResult.events.length} events (${tickResult.daysPassed || 0} days, ${tickResult.hoursPassed || 0} hours passed)`);
            }
            if (changed) {
              console.log('[Diplomacy] Parsed narrative event');
            }
          }
        }
      } catch (e) {
        console.error('[Diplomacy] Parse error:', e);
      }
    }, 300);
  });
  
  // Also listen for user messages (they might contain time skips too)
  eventSource.on(event_types.MESSAGE_SENT, () => {
    setTimeout(async () => {
      try {
        const st = getChatState();
        const tickResult = tickWorld(st);
        
        if (tickResult.events && tickResult.events.length > 0) {
          await commitState(st);
          if (UI.panelOpen) render();
          console.log(`[Diplomacy] User message tick: ${tickResult.events.length} events`);
        }
      } catch (e) {
        console.error('[Diplomacy] Tick error:', e);
      }
    }, 200);
  });
  
  // Subscribe to Journey Tracker
  setTimeout(subscribeToJourney, 500);
}

// Subscribe to VTSS time changes if available
function setupVTSSSubscription() {
  // Clear any existing intervals
  if (_cleanup.vtssCheckIntervalId) {
    clearInterval(_cleanup.vtssCheckIntervalId);
    _cleanup.vtssCheckIntervalId = null;
  }
  if (_cleanup.vtssPollingIntervalId) {
    clearInterval(_cleanup.vtssPollingIntervalId);
    _cleanup.vtssPollingIntervalId = null;
  }

  // Check periodically if VTSS is available and subscribe
  _cleanup.vtssCheckIntervalId = setInterval(() => {
    if (window.VTSS) {
      clearInterval(_cleanup.vtssCheckIntervalId);
      _cleanup.vtssCheckIntervalId = null;
      console.log('[Diplomacy] VTSS detected, subscribing to time changes');

      // Poll VTSS for changes (since it might not have a subscription system)
      _cleanup.vtssPollingIntervalId = setInterval(async () => {
        if (!window.VTSS) return;

        const vtss = window.VTSS.getState();
        if (!vtss?.time) return;

        const currentTimeKey = `${vtss.time.year}-${vtss.time.month}-${vtss.time.day}-${vtss.time.hour}`;

        if (lastVTSSTime && lastVTSSTime !== currentTimeKey) {
          // Time changed! Tick the world
          const st = getChatState();
          const tickResult = tickWorld(st);

          if (tickResult.events && tickResult.events.length > 0) {
            await commitState(st);
            if (UI.panelOpen) render();
            console.log(`[Diplomacy] VTSS time change tick: ${tickResult.events.length} events`);
          }
        }

        lastVTSSTime = currentTimeKey;
      }, 2000); // Check every 2 seconds
    }
  }, 1000);

  // Stop checking after 30 seconds
  setTimeout(() => {
    if (_cleanup.vtssCheckIntervalId) {
      clearInterval(_cleanup.vtssCheckIntervalId);
      _cleanup.vtssCheckIntervalId = null;
    }
  }, 30000);
}

(async function main() {
  console.log('[Diplomacy] Loading...');
  try {
    mountUI();
    registerEvents();
    setupVTSSSubscription();
    console.log('[Diplomacy] Ready!');
  } catch (e) {
    console.error('[Diplomacy] Init failed:', e);
  }
})();
