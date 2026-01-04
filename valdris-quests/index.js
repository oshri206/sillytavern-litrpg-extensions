/**
 * Valdris Quest Board
 * ===================
 * Dynamic quest generation based on faction needs, wars, economy, and world state.
 * 
 * Install folder:
 *   SillyTavern/public/scripts/extensions/third-party/valdris-quests/
 */

const EXT_NAME = 'valdris-quests';
const META_KEY = 'vquest_state_v1';

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
  console.error('[Quests] Failed to import extensions.js', e);
}

try {
  const scriptModule = await import('../../../../script.js');
  eventSource = scriptModule.eventSource;
  event_types = scriptModule.event_types;
  if (!saveSettingsDebounced) saveSettingsDebounced = scriptModule.saveSettingsDebounced;
} catch (e) {
  console.error('[Quests] Failed to import script.js', e);
}

// ══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════════════════════

const FACTION_NAMES = {
  valdran_empire: { name: 'Valdran Empire', short: 'Empire', icon: '🏛️' },
  magocracy: { name: 'Magocracy of Arcana', short: 'Magocracy', icon: '🔮' },
  solarus_theocracy: { name: 'Solarus Theocracy', short: 'Theocracy', icon: '☀️' },
  elven_courts: { name: 'Elven Courts', short: 'Elves', icon: '🧝' },
  dwarven_holds: { name: 'Dwarven Holds', short: 'Dwarves', icon: '⛏️' },
  orcish_dominion: { name: 'Orcish Dominion', short: 'Orcs', icon: '💪' },
  free_cities: { name: 'Free Cities League', short: 'Free Cities', icon: '🏘️' },
  shadow_consortium: { name: 'Shadow Consortium', short: 'Shadows', icon: '🗡️' },
  beastkin_tribes: { name: 'Beastkin Tribes', short: 'Beastkin', icon: '🐺' },
  undead_kingdoms: { name: 'Undead Kingdoms', short: 'Undead', icon: '💀' },
  sea_kingdoms: { name: 'Sea Kingdoms', short: 'Sailors', icon: '⚓' },
  nomad_confederacy: { name: 'Nomad Confederacy', short: 'Nomads', icon: '🐴' },
};

const QUEST_TYPES = {
  combat: { name: 'Combat', icon: '⚔️', color: '#f44336' },
  bounty: { name: 'Bounty', icon: '💀', color: '#E91E63' },
  escort: { name: 'Escort', icon: '🛡️', color: '#9C27B0' },
  delivery: { name: 'Delivery', icon: '📦', color: '#673AB7' },
  fetch: { name: 'Fetch', icon: '🎒', color: '#3F51B5' },
  rescue: { name: 'Rescue', icon: '🆘', color: '#2196F3' },
  investigation: { name: 'Investigation', icon: '🔍', color: '#00BCD4' },
  diplomacy: { name: 'Diplomacy', icon: '🤝', color: '#009688' },
  exploration: { name: 'Exploration', icon: '🗺️', color: '#4CAF50' },
  gathering: { name: 'Gathering', icon: '🌿', color: '#8BC34A' },
  crafting: { name: 'Crafting', icon: '🔨', color: '#CDDC39' },
  stealth: { name: 'Stealth', icon: '🥷', color: '#607D8B' },
  military: { name: 'Military', icon: '🎖️', color: '#795548' },
};

const DIFFICULTY_LEVELS = {
  trivial: { name: 'Trivial', icon: '⚪', multiplier: 0.5, color: '#9E9E9E' },
  easy: { name: 'Easy', icon: '🟢', multiplier: 0.75, color: '#4CAF50' },
  moderate: { name: 'Moderate', icon: '🟡', multiplier: 1, color: '#FFC107' },
  hard: { name: 'Hard', icon: '🟠', multiplier: 1.5, color: '#FF9800' },
  deadly: { name: 'Deadly', icon: '🔴', multiplier: 2, color: '#f44336' },
  legendary: { name: 'Legendary', icon: '💜', multiplier: 3, color: '#9C27B0' },
};

const LOCATIONS = [
  'the northern frontier', 'the eastern borderlands', 'the western marches',
  'the southern reaches', 'the capital district', 'the merchant quarter',
  'the old ruins', 'the dark forest', 'the mountain pass', 'the coastal cliffs',
  'the underground tunnels', 'the abandoned mines', 'the haunted cemetery',
  'the ancient temple', 'the trading post', 'the frontier village',
];

const NPC_NAMES = {
  male: ['Aldric', 'Bran', 'Cedric', 'Daren', 'Edmund', 'Fenn', 'Gareth', 'Henrik', 'Ivan', 'Jasper', 'Kael', 'Lucan', 'Marcus', 'Nolan', 'Osric'],
  female: ['Aria', 'Brynn', 'Celeste', 'Dara', 'Elena', 'Fiona', 'Gwen', 'Helena', 'Iris', 'Jade', 'Kira', 'Luna', 'Mira', 'Nadia', 'Ophelia'],
  neutral: ['the merchant', 'the elder', 'the captain', 'the scholar', 'the priest', 'the innkeeper', 'the blacksmith', 'the farmer'],
};

const TARGETS = {
  monsters: ['goblins', 'bandits', 'wolves', 'undead', 'cultists', 'trolls', 'giants', 'dragons', 'demons', 'beasts'],
  items: ['ancient artifact', 'lost heirloom', 'stolen goods', 'rare ingredients', 'magical tome', 'sacred relic', 'trade goods', 'weapons cache'],
  people: ['missing merchant', 'kidnapped noble', 'lost child', 'captured soldier', 'stranded traveler', 'political prisoner'],
};

// ══════════════════════════════════════════════════════════════════════════════
// QUEST TEMPLATES
// ══════════════════════════════════════════════════════════════════════════════

const QUEST_TEMPLATES = {
  // COMBAT QUESTS
  combat: [
    {
      title: 'Clear the {location}',
      desc: '{npc} needs someone to clear {target} from {location}. They\'ve been terrorizing travelers for weeks.',
      objectives: ['Travel to {location}', 'Eliminate the {target}', 'Report back to {npc}'],
      baseReward: 50,
      baseDifficulty: 'moderate',
    },
    {
      title: 'Monster Infestation',
      desc: 'A nest of {target} has been spotted near {location}. The local militia is overwhelmed.',
      objectives: ['Locate the nest', 'Destroy the {target}', 'Ensure no survivors escape'],
      baseReward: 75,
      baseDifficulty: 'hard',
    },
    {
      title: 'Defend the Village',
      desc: '{target} are planning to raid {location}. Help organize the defense and repel the attack.',
      objectives: ['Prepare defenses', 'Rally the militia', 'Defeat the raiders'],
      baseReward: 100,
      baseDifficulty: 'hard',
    },
  ],
  
  // BOUNTY QUESTS
  bounty: [
    {
      title: 'Wanted: {target_name}',
      desc: 'A bounty has been placed on {target_name}, wanted for crimes against {faction}. Dead or alive.',
      objectives: ['Track down {target_name}', 'Capture or eliminate the target', 'Collect the bounty'],
      baseReward: 100,
      baseDifficulty: 'hard',
    },
    {
      title: 'The Bandit Lord',
      desc: 'A notorious bandit leader operates from {location}. The reward for their head is substantial.',
      objectives: ['Infiltrate the hideout', 'Confront the bandit lord', 'Bring proof of death'],
      baseReward: 150,
      baseDifficulty: 'deadly',
    },
  ],
  
  // ESCORT QUESTS
  escort: [
    {
      title: 'Escort to {destination}',
      desc: '{npc} needs safe passage to {destination}. The roads are dangerous these days.',
      objectives: ['Meet {npc}', 'Protect them on the journey', 'Deliver them safely'],
      baseReward: 40,
      baseDifficulty: 'moderate',
    },
    {
      title: 'Caravan Guard',
      desc: 'A merchant caravan heading to {destination} needs armed escorts. Good pay for capable fighters.',
      objectives: ['Join the caravan', 'Protect the goods', 'Complete the journey'],
      baseReward: 60,
      baseDifficulty: 'moderate',
    },
    {
      title: 'Refugee Escort',
      desc: 'Refugees fleeing the conflict need protection on their journey to safety.',
      objectives: ['Gather the refugees', 'Guide them to {destination}', 'Ensure their safety'],
      baseReward: 30,
      baseDifficulty: 'moderate',
      warOnly: true,
    },
  ],
  
  // DELIVERY QUESTS
  delivery: [
    {
      title: 'Urgent Delivery',
      desc: '{npc} needs {item} delivered to {destination} urgently. Time is of the essence.',
      objectives: ['Collect the package', 'Travel to {destination}', 'Deliver to the recipient'],
      baseReward: 25,
      baseDifficulty: 'easy',
      timeLimit: 3,
    },
    {
      title: 'Diplomatic Pouch',
      desc: 'Sensitive documents must reach {faction} representatives. Discretion is paramount.',
      objectives: ['Secure the documents', 'Avoid interception', 'Complete the delivery'],
      baseReward: 75,
      baseDifficulty: 'hard',
    },
    {
      title: 'Supply Run',
      desc: 'The front lines need supplies desperately. Deliver {item} to the military camp.',
      objectives: ['Load the supplies', 'Navigate dangerous territory', 'Reach the camp'],
      baseReward: 50,
      baseDifficulty: 'moderate',
      warOnly: true,
    },
  ],
  
  // FETCH QUESTS
  fetch: [
    {
      title: 'Retrieve the {item}',
      desc: '{npc} lost their {item} somewhere in {location}. They\'ll pay well for its return.',
      objectives: ['Search {location}', 'Find the {item}', 'Return it to {npc}'],
      baseReward: 30,
      baseDifficulty: 'easy',
    },
    {
      title: 'Recover Stolen Goods',
      desc: 'Thieves made off with valuable {item}. Track them to {location} and recover what was taken.',
      objectives: ['Track the thieves', 'Recover the {item}', 'Bring them to justice (optional)'],
      baseReward: 60,
      baseDifficulty: 'moderate',
    },
    {
      title: 'Artifact Recovery',
      desc: 'An ancient {item} lies hidden in {location}. Scholars will pay handsomely for its recovery.',
      objectives: ['Navigate to {location}', 'Overcome guardians', 'Retrieve the {item}'],
      baseReward: 150,
      baseDifficulty: 'deadly',
    },
  ],
  
  // RESCUE QUESTS
  rescue: [
    {
      title: 'Missing Person',
      desc: '{person} went missing near {location}. Their family fears the worst.',
      objectives: ['Investigate the disappearance', 'Locate {person}', 'Bring them home'],
      baseReward: 50,
      baseDifficulty: 'moderate',
    },
    {
      title: 'Hostage Situation',
      desc: '{target} have taken hostages at {location}. A rescue team is needed immediately.',
      objectives: ['Scout the location', 'Neutralize the captors', 'Extract the hostages'],
      baseReward: 100,
      baseDifficulty: 'hard',
    },
    {
      title: 'Prisoner of War',
      desc: 'Allied soldiers are being held at an enemy camp. Mount a rescue operation.',
      objectives: ['Locate the prison camp', 'Free the prisoners', 'Escape to friendly territory'],
      baseReward: 125,
      baseDifficulty: 'deadly',
      warOnly: true,
    },
  ],
  
  // INVESTIGATION QUESTS
  investigation: [
    {
      title: 'The Mystery of {location}',
      desc: 'Strange occurrences at {location} have locals worried. Someone needs to investigate.',
      objectives: ['Interview witnesses', 'Gather clues', 'Uncover the truth'],
      baseReward: 40,
      baseDifficulty: 'easy',
    },
    {
      title: 'Murder Investigation',
      desc: 'A prominent citizen was found dead. The authorities need discrete help solving this crime.',
      objectives: ['Examine the scene', 'Question suspects', 'Identify the killer'],
      baseReward: 75,
      baseDifficulty: 'moderate',
    },
    {
      title: 'Spy Hunt',
      desc: '{faction} suspects a spy in their ranks. Root out the traitor before more damage is done.',
      objectives: ['Gather intelligence', 'Set a trap', 'Expose the spy'],
      baseReward: 100,
      baseDifficulty: 'hard',
    },
  ],
  
  // DIPLOMACY QUESTS
  diplomacy: [
    {
      title: 'Peace Envoy',
      desc: 'Deliver terms of negotiation to {faction}. Diplomacy could prevent bloodshed.',
      objectives: ['Carry the message', 'Negotiate terms', 'Return with a response'],
      baseReward: 60,
      baseDifficulty: 'moderate',
    },
    {
      title: 'Alliance Broker',
      desc: 'Two factions need a neutral party to mediate their alliance discussions.',
      objectives: ['Facilitate the meeting', 'Address concerns', 'Secure the agreement'],
      baseReward: 100,
      baseDifficulty: 'hard',
    },
    {
      title: 'Ceasefire Negotiations',
      desc: 'Both sides are exhausted. Help broker a ceasefire before more lives are lost.',
      objectives: ['Contact both parties', 'Find common ground', 'Formalize the ceasefire'],
      baseReward: 150,
      baseDifficulty: 'hard',
      warOnly: true,
    },
  ],
  
  // EXPLORATION QUESTS
  exploration: [
    {
      title: 'Chart the Unknown',
      desc: 'Map the uncharted regions of {location}. Valuable information for merchants and military.',
      objectives: ['Explore the area', 'Document findings', 'Return with maps'],
      baseReward: 45,
      baseDifficulty: 'moderate',
    },
    {
      title: 'Lost Expedition',
      desc: 'An expedition to {location} went silent. Find out what happened to them.',
      objectives: ['Follow their trail', 'Locate survivors or remains', 'Recover their findings'],
      baseReward: 80,
      baseDifficulty: 'hard',
    },
    {
      title: 'Ancient Ruins',
      desc: 'Rumors speak of forgotten ruins in {location}. Be the first to explore them.',
      objectives: ['Find the entrance', 'Navigate the dangers', 'Document the discovery'],
      baseReward: 100,
      baseDifficulty: 'hard',
    },
  ],
  
  // GATHERING QUESTS
  gathering: [
    {
      title: 'Rare Ingredients',
      desc: '{npc} needs {item} for their work. These can only be found in {location}.',
      objectives: ['Travel to {location}', 'Gather {item}', 'Return before they spoil'],
      baseReward: 25,
      baseDifficulty: 'easy',
    },
    {
      title: 'Monster Parts',
      desc: 'A craftsman needs specific parts from {target}. Hunt them and bring back what\'s needed.',
      objectives: ['Hunt {target}', 'Harvest the parts', 'Deliver to the craftsman'],
      baseReward: 50,
      baseDifficulty: 'moderate',
    },
  ],
  
  // STEALTH QUESTS
  stealth: [
    {
      title: 'Infiltration',
      desc: 'Slip into {location} undetected and retrieve sensitive information.',
      objectives: ['Find a way in', 'Locate the documents', 'Escape without detection'],
      baseReward: 75,
      baseDifficulty: 'hard',
    },
    {
      title: 'Sabotage',
      desc: 'Enemy supplies at {location} must be destroyed. A direct assault would be suicide.',
      objectives: ['Infiltrate the camp', 'Plant explosives', 'Escape before detonation'],
      baseReward: 100,
      baseDifficulty: 'deadly',
      warOnly: true,
    },
    {
      title: 'Assassination',
      desc: 'A target of opportunity has been identified. Eliminate them quietly.',
      objectives: ['Study the target\'s routine', 'Find an opening', 'Complete the contract'],
      baseReward: 150,
      baseDifficulty: 'deadly',
    },
  ],
  
  // MILITARY QUESTS
  military: [
    {
      title: 'Join the Assault',
      desc: '{faction} forces are attacking {location}. Capable fighters can join and share in the glory.',
      objectives: ['Report to the commander', 'Participate in the battle', 'Survive'],
      baseReward: 80,
      baseDifficulty: 'hard',
      warOnly: true,
    },
    {
      title: 'Hold the Line',
      desc: 'Defend {location} against enemy assault. Every sword counts.',
      objectives: ['Fortify the position', 'Repel the attackers', 'Maintain the defensive line'],
      baseReward: 100,
      baseDifficulty: 'deadly',
      warOnly: true,
    },
    {
      title: 'Scout Mission',
      desc: 'Intelligence on enemy movements is vital. Scout {location} and report back.',
      objectives: ['Approach undetected', 'Observe enemy forces', 'Return with intel'],
      baseReward: 60,
      baseDifficulty: 'moderate',
      warOnly: true,
    },
  ],
};

// ══════════════════════════════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════════════════════════════

function newEmptyState() {
  return {
    version: 1,
    availableQuests: [],
    activeQuests: [],
    completedQuests: [],
    failedQuests: [],
    lastGenerateDay: 0,
    playerRegion: 'valdran_empire',
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
// TIME HELPER
// ══════════════════════════════════════════════════════════════════════════════

function getCurrentDay() {
  if (window.VTSS) {
    const vtss = window.VTSS.getState();
    if (vtss?.time) {
      return (vtss.time.year * 360) + ((vtss.time.month - 1) * 36) + vtss.time.day;
    }
  }
  return Math.floor(Date.now() / 86400000);
}

// ══════════════════════════════════════════════════════════════════════════════
// WORLD STATE HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function getWorldState() {
  const state = {
    wars: [],
    worldTension: 0,
    factions: {},
    hasWar: false,
  };
  
  if (window.VDiplomacy) {
    state.wars = window.VDiplomacy.getActiveWars?.() || [];
    state.hasWar = state.wars.length > 0;
    
    const dipState = window.VDiplomacy.getState?.();
    if (dipState) {
      state.worldTension = dipState.worldTension || 0;
      state.factions = {};
      for (const f of (dipState.factions || [])) {
        state.factions[f.id] = f;
      }
    }
  }
  
  return state;
}

function getEconomyState() {
  if (window.VEconomy) {
    return window.VEconomy.getState?.() || null;
  }
  return null;
}

function getWeatherState() {
  if (window.VWeather) {
    return {
      weather: window.VWeather.getWeather?.(),
      effects: window.VWeather.getEffects?.(),
    };
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════════════════
// QUEST GENERATION
// ══════════════════════════════════════════════════════════════════════════════

function generateQuest(type, worldState, playerRegion) {
  const templates = QUEST_TEMPLATES[type];
  if (!templates || templates.length === 0) return null;
  
  // Filter templates based on world state
  let validTemplates = templates.filter(t => {
    if (t.warOnly && !worldState.hasWar) return false;
    return true;
  });
  
  if (validTemplates.length === 0) validTemplates = templates.filter(t => !t.warOnly);
  if (validTemplates.length === 0) return null;
  
  const template = validTemplates[Math.floor(Math.random() * validTemplates.length)];
  
  // Generate dynamic values
  const npcGender = Math.random() < 0.4 ? 'male' : Math.random() < 0.8 ? 'female' : 'neutral';
  const npcName = NPC_NAMES[npcGender][Math.floor(Math.random() * NPC_NAMES[npcGender].length)];
  const location = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
  const destination = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
  const target = TARGETS.monsters[Math.floor(Math.random() * TARGETS.monsters.length)];
  const item = TARGETS.items[Math.floor(Math.random() * TARGETS.items.length)];
  const person = TARGETS.people[Math.floor(Math.random() * TARGETS.people.length)];
  const targetName = NPC_NAMES[Math.random() < 0.5 ? 'male' : 'female'][Math.floor(Math.random() * 8)];
  
  // Get faction for quest giver
  const factionIds = Object.keys(FACTION_NAMES);
  const questFaction = worldState.hasWar ? 
    (Math.random() < 0.5 ? worldState.wars[0].attacker : worldState.wars[0].defender) :
    factionIds[Math.floor(Math.random() * factionIds.length)];
  const factionData = FACTION_NAMES[questFaction] || FACTION_NAMES.valdran_empire;
  
  // Replace placeholders
  const replacements = {
    '{npc}': npcName,
    '{location}': location,
    '{destination}': destination,
    '{target}': target,
    '{item}': item,
    '{person}': person,
    '{target_name}': targetName,
    '{faction}': factionData.name,
  };
  
  let title = template.title;
  let desc = template.desc;
  let objectives = template.objectives.map(o => o);
  
  for (const [key, value] of Object.entries(replacements)) {
    title = title.replace(new RegExp(key, 'g'), value);
    desc = desc.replace(new RegExp(key, 'g'), value);
    objectives = objectives.map(o => o.replace(new RegExp(key, 'g'), value));
  }
  
  // Calculate difficulty
  let difficulty = template.baseDifficulty;
  if (worldState.hasWar && type === 'military') {
    const difficulties = Object.keys(DIFFICULTY_LEVELS);
    const currentIdx = difficulties.indexOf(difficulty);
    if (currentIdx < difficulties.length - 1 && Math.random() < 0.3) {
      difficulty = difficulties[currentIdx + 1];
    }
  }
  
  // Calculate reward
  let reward = template.baseReward * DIFFICULTY_LEVELS[difficulty].multiplier;
  
  // Economy affects rewards
  const economy = getEconomyState();
  if (economy) {
    reward *= (1 + economy.globalInflation);
  }
  
  // War bonuses
  if (worldState.hasWar && (type === 'military' || type === 'escort' || type === 'delivery')) {
    reward *= 1.25;
  }
  
  reward = Math.round(reward);
  
  // Reputation reward
  let repReward = Math.round(reward / 20);
  if (type === 'diplomacy') repReward *= 2;
  
  const quest = {
    id: `quest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type,
    title,
    desc,
    objectives,
    objectivesComplete: objectives.map(() => false),
    reward,
    repReward,
    difficulty,
    faction: questFaction,
    location,
    giver: npcName,
    timeLimit: template.timeLimit || null,
    createdDay: getCurrentDay(),
    expiresDay: getCurrentDay() + 7 + Math.floor(Math.random() * 7),
    status: 'available',
  };
  
  return quest;
}

function generateQuestBoard(st, count = 8) {
  const worldState = getWorldState();
  const currentDay = getCurrentDay();
  
  // Remove expired quests
  st.availableQuests = st.availableQuests.filter(q => q.expiresDay > currentDay);
  
  // Calculate how many of each type to generate
  const typeWeights = {
    combat: 15,
    bounty: 8,
    escort: 12,
    delivery: 12,
    fetch: 10,
    rescue: 8,
    investigation: 8,
    diplomacy: 5,
    exploration: 8,
    gathering: 8,
    stealth: 4,
    military: worldState.hasWar ? 15 : 2,
  };
  
  // Adjust for war
  if (worldState.hasWar) {
    typeWeights.escort += 10;
    typeWeights.delivery += 8;
    typeWeights.rescue += 5;
    typeWeights.diplomacy += 5;
  }
  
  const totalWeight = Object.values(typeWeights).reduce((a, b) => a + b, 0);
  const newQuests = [];
  
  for (let i = 0; i < count; i++) {
    let roll = Math.random() * totalWeight;
    let selectedType = 'combat';
    
    for (const [type, weight] of Object.entries(typeWeights)) {
      roll -= weight;
      if (roll <= 0) {
        selectedType = type;
        break;
      }
    }
    
    const quest = generateQuest(selectedType, worldState, st.playerRegion);
    if (quest) {
      newQuests.push(quest);
    }
  }
  
  st.availableQuests = [...newQuests, ...st.availableQuests].slice(0, 20);
  st.lastGenerateDay = currentDay;
}

function refreshQuests(st) {
  const currentDay = getCurrentDay();
  
  // GATE: Only generate quests if player has visited a quest-giving location!
  // Check Journey context for guild, bounty board, or quest-related tags
  const hasVisitedQuestLocation = st.hasVisitedQuestLocation || false;
  
  if (!hasVisitedQuestLocation) {
    // Don't generate quests until player visits appropriate location
    console.log('[Quests] Waiting for player to visit quest board/guild');
    return;
  }
  
  // Generate new quests every day (only if we've visited a quest location)
  if (currentDay > st.lastGenerateDay) {
    const daysPassed = Math.min(currentDay - st.lastGenerateDay, 3);
    generateQuestBoard(st, daysPassed * 3);
  }
  
  // Check for expired active quests
  for (const quest of st.activeQuests) {
    if (quest.timeLimit && quest.acceptedDay) {
      const deadline = quest.acceptedDay + quest.timeLimit;
      if (currentDay > deadline) {
        quest.status = 'failed';
        st.failedQuests.push(quest);
      }
    }
  }
  
  st.activeQuests = st.activeQuests.filter(q => q.status === 'active');
}

// ══════════════════════════════════════════════════════════════════════════════
// QUEST ACTIONS
// ══════════════════════════════════════════════════════════════════════════════

function acceptQuest(st, questId) {
  const questIdx = st.availableQuests.findIndex(q => q.id === questId);
  if (questIdx === -1) return false;
  
  const quest = st.availableQuests[questIdx];
  quest.status = 'active';
  quest.acceptedDay = getCurrentDay();
  
  st.activeQuests.push(quest);
  st.availableQuests.splice(questIdx, 1);
  
  return true;
}

function completeObjective(st, questId, objectiveIdx) {
  const quest = st.activeQuests.find(q => q.id === questId);
  if (!quest) return false;
  
  if (objectiveIdx >= 0 && objectiveIdx < quest.objectivesComplete.length) {
    quest.objectivesComplete[objectiveIdx] = true;
  }
  
  // Check if all objectives complete
  if (quest.objectivesComplete.every(c => c)) {
    return completeQuest(st, questId);
  }
  
  return true;
}

function completeQuest(st, questId) {
  const questIdx = st.activeQuests.findIndex(q => q.id === questId);
  if (questIdx === -1) return false;
  
  const quest = st.activeQuests[questIdx];
  quest.status = 'completed';
  quest.completedDay = getCurrentDay();
  quest.objectivesComplete = quest.objectivesComplete.map(() => true);
  
  st.completedQuests.push(quest);
  st.activeQuests.splice(questIdx, 1);
  
  return {
    quest,
    reward: quest.reward,
    repReward: quest.repReward,
    faction: quest.faction,
  };
}

function abandonQuest(st, questId) {
  const questIdx = st.activeQuests.findIndex(q => q.id === questId);
  if (questIdx === -1) return false;
  
  const quest = st.activeQuests[questIdx];
  quest.status = 'abandoned';
  
  st.failedQuests.push(quest);
  st.activeQuests.splice(questIdx, 1);
  
  return true;
}

// ══════════════════════════════════════════════════════════════════════════════
// UI
// ══════════════════════════════════════════════════════════════════════════════

const UI = {
  mounted: false,
  root: null,
  panelOpen: false,
  currentTab: 'available',
  selectedQuest: null,
};

function mountUI() {
  if (UI.mounted) return;
  UI.mounted = true;
  
  // Launcher
  const launcher = document.createElement('button');
  launcher.id = 'vquest_launcher';
  launcher.className = 'vquest_launcher';
  launcher.innerHTML = '📋';
  launcher.title = 'Quest Board';
  launcher.addEventListener('click', togglePanel);
  document.body.appendChild(launcher);
  
  // Main panel
  const panel = document.createElement('div');
  panel.id = 'vquest_root';
  panel.className = 'vquest_panel vquest_hidden';
  panel.innerHTML = `
    <div class="vquest_header">
      <div class="vquest_title">
        <span class="vquest_title_icon">📋</span>
        <span>Quest Board</span>
      </div>
      <div class="vquest_header_actions">
        <button class="vquest_btn" id="vquest_btn_refresh" title="Refresh Quests">🔄</button>
        <button class="vquest_btn" id="vquest_btn_close" title="Close">✕</button>
      </div>
    </div>
    
    <div class="vquest_tabs">
      <button class="vquest_tab vquest_tab_active" data-tab="available">📋 Available</button>
      <button class="vquest_tab" data-tab="active">⚔️ Active</button>
      <button class="vquest_tab" data-tab="completed">✅ Completed</button>
    </div>
    
    <div class="vquest_body">
      <div class="vquest_list" id="vquest_list">
        <!-- Rendered by JS -->
      </div>
      
      <div class="vquest_detail" id="vquest_detail">
        <div class="vquest_detail_empty">Select a quest to view details</div>
      </div>
    </div>
    
    <div class="vquest_footer">
      <div class="vquest_stats" id="vquest_stats">
        <!-- Rendered by JS -->
      </div>
    </div>
  `;
  
  document.body.appendChild(panel);
  UI.root = panel;
  
  setupEventListeners();
  render();
  
  console.log('[Quests] UI mounted');
}

function setupEventListeners() {
  document.getElementById('vquest_btn_close').addEventListener('click', togglePanel);
  document.getElementById('vquest_btn_refresh').addEventListener('click', forceRefresh);
  
  document.querySelectorAll('.vquest_tab').forEach(tab => {
    tab.addEventListener('click', () => {
      UI.currentTab = tab.dataset.tab;
      UI.selectedQuest = null;
      document.querySelectorAll('.vquest_tab').forEach(t => t.classList.remove('vquest_tab_active'));
      tab.classList.add('vquest_tab_active');
      render();
    });
  });
}

function togglePanel() {
  UI.panelOpen = !UI.panelOpen;
  UI.root.classList.toggle('vquest_hidden', !UI.panelOpen);
  if (UI.panelOpen) {
    const st = getChatState();
    refreshQuests(st);
    commitState(st);
    render();
  }
}

async function forceRefresh() {
  const st = getChatState();
  st.lastGenerateDay = 0;
  st.availableQuests = [];
  refreshQuests(st);
  await commitState(st);
  render();
}

function render() {
  renderQuestList();
  renderQuestDetail();
  renderStats();
}

function renderQuestList() {
  const st = getChatState();
  const container = document.getElementById('vquest_list');
  
  let quests = [];
  switch (UI.currentTab) {
    case 'available':
      quests = st.availableQuests;
      break;
    case 'active':
      quests = st.activeQuests;
      break;
    case 'completed':
      quests = [...st.completedQuests].reverse().slice(0, 20);
      break;
  }
  
  if (quests.length === 0) {
    container.innerHTML = `<div class="vquest_empty">No ${UI.currentTab} quests</div>`;
    return;
  }
  
  let html = '';
  for (const quest of quests) {
    const typeData = QUEST_TYPES[quest.type] || QUEST_TYPES.combat;
    const diffData = DIFFICULTY_LEVELS[quest.difficulty] || DIFFICULTY_LEVELS.moderate;
    const factionData = FACTION_NAMES[quest.faction] || FACTION_NAMES.valdran_empire;
    const selected = UI.selectedQuest === quest.id ? 'vquest_item_selected' : '';
    
    html += `
      <div class="vquest_item ${selected}" data-id="${quest.id}">
        <div class="vquest_item_header">
          <span class="vquest_item_type" style="color: ${typeData.color}">${typeData.icon}</span>
          <span class="vquest_item_title">${quest.title}</span>
          <span class="vquest_item_diff" style="color: ${diffData.color}">${diffData.icon}</span>
        </div>
        <div class="vquest_item_meta">
          <span class="vquest_item_faction">${factionData.icon} ${factionData.short}</span>
          <span class="vquest_item_reward">🪙 ${quest.reward}gp</span>
        </div>
      </div>
    `;
  }
  
  container.innerHTML = html;
  
  container.querySelectorAll('.vquest_item').forEach(item => {
    item.addEventListener('click', () => {
      UI.selectedQuest = item.dataset.id;
      render();
    });
  });
}

function renderQuestDetail() {
  const st = getChatState();
  const container = document.getElementById('vquest_detail');
  
  if (!UI.selectedQuest) {
    container.innerHTML = '<div class="vquest_detail_empty">Select a quest to view details</div>';
    return;
  }
  
  const allQuests = [...st.availableQuests, ...st.activeQuests, ...st.completedQuests, ...st.failedQuests];
  const quest = allQuests.find(q => q.id === UI.selectedQuest);
  
  if (!quest) {
    container.innerHTML = '<div class="vquest_detail_empty">Quest not found</div>';
    return;
  }
  
  const typeData = QUEST_TYPES[quest.type] || QUEST_TYPES.combat;
  const diffData = DIFFICULTY_LEVELS[quest.difficulty] || DIFFICULTY_LEVELS.moderate;
  const factionData = FACTION_NAMES[quest.faction] || FACTION_NAMES.valdran_empire;
  
  let objectivesHtml = '<div class="vquest_objectives">';
  for (let i = 0; i < quest.objectives.length; i++) {
    const complete = quest.objectivesComplete?.[i] || false;
    const checkClass = complete ? 'vquest_obj_complete' : '';
    objectivesHtml += `
      <div class="vquest_objective ${checkClass}" data-idx="${i}">
        <span class="vquest_obj_check">${complete ? '✅' : '⬜'}</span>
        <span class="vquest_obj_text">${quest.objectives[i]}</span>
      </div>
    `;
  }
  objectivesHtml += '</div>';
  
  let actionsHtml = '';
  if (quest.status === 'available') {
    actionsHtml = `<button class="vquest_btn vquest_btn_accept" id="vquest_accept">✅ Accept Quest</button>`;
  } else if (quest.status === 'active') {
    actionsHtml = `
      <button class="vquest_btn vquest_btn_complete" id="vquest_complete">🏆 Complete Quest</button>
      <button class="vquest_btn vquest_btn_abandon" id="vquest_abandon">❌ Abandon</button>
    `;
  }
  
  container.innerHTML = `
    <div class="vquest_detail_header" style="border-color: ${typeData.color}">
      <div class="vquest_detail_type" style="background: ${typeData.color}">${typeData.icon} ${typeData.name}</div>
      <div class="vquest_detail_title">${quest.title}</div>
      <div class="vquest_detail_meta">
        <span style="color: ${diffData.color}">${diffData.icon} ${diffData.name}</span>
        <span>${factionData.icon} ${factionData.name}</span>
      </div>
    </div>
    
    <div class="vquest_detail_desc">${quest.desc}</div>
    
    <div class="vquest_detail_section">
      <div class="vquest_detail_label">📍 Location</div>
      <div class="vquest_detail_value">${quest.location}</div>
    </div>
    
    <div class="vquest_detail_section">
      <div class="vquest_detail_label">👤 Quest Giver</div>
      <div class="vquest_detail_value">${quest.giver}</div>
    </div>
    
    <div class="vquest_detail_section">
      <div class="vquest_detail_label">📝 Objectives</div>
      ${objectivesHtml}
    </div>
    
    <div class="vquest_detail_rewards">
      <div class="vquest_reward_item">
        <span class="vquest_reward_icon">🪙</span>
        <span class="vquest_reward_value">${quest.reward} gold</span>
      </div>
      <div class="vquest_reward_item">
        <span class="vquest_reward_icon">⭐</span>
        <span class="vquest_reward_value">+${quest.repReward} ${factionData.short} rep</span>
      </div>
    </div>
    
    ${quest.timeLimit ? `<div class="vquest_time_limit">⏰ Time Limit: ${quest.timeLimit} days</div>` : ''}
    
    <div class="vquest_detail_actions">
      ${actionsHtml}
    </div>
  `;
  
  // Event listeners for actions
  document.getElementById('vquest_accept')?.addEventListener('click', async () => {
    acceptQuest(st, quest.id);
    await commitState(st);
    UI.currentTab = 'active';
    document.querySelectorAll('.vquest_tab').forEach(t => t.classList.remove('vquest_tab_active'));
    document.querySelector('[data-tab="active"]').classList.add('vquest_tab_active');
    render();
  });
  
  document.getElementById('vquest_complete')?.addEventListener('click', async () => {
    completeQuest(st, quest.id);
    await commitState(st);
    UI.selectedQuest = null;
    render();
  });
  
  document.getElementById('vquest_abandon')?.addEventListener('click', async () => {
    if (confirm('Abandon this quest? This may affect your reputation.')) {
      abandonQuest(st, quest.id);
      await commitState(st);
      UI.selectedQuest = null;
      render();
    }
  });
  
  // Objective click to toggle (for active quests)
  if (quest.status === 'active') {
    container.querySelectorAll('.vquest_objective').forEach(obj => {
      obj.addEventListener('click', async () => {
        const idx = parseInt(obj.dataset.idx);
        quest.objectivesComplete[idx] = !quest.objectivesComplete[idx];
        await commitState(st);
        render();
      });
    });
  }
}

function renderStats() {
  const st = getChatState();
  const container = document.getElementById('vquest_stats');
  
  container.innerHTML = `
    <span>📋 ${st.availableQuests.length} available</span>
    <span>⚔️ ${st.activeQuests.length} active</span>
    <span>✅ ${st.completedQuests.length} completed</span>
  `;
}

// ══════════════════════════════════════════════════════════════════════════════
// GLOBAL API
// ══════════════════════════════════════════════════════════════════════════════

window.VQuests = {
  open: () => { UI.panelOpen = true; UI.root.classList.remove('vquest_hidden'); render(); },
  close: () => { UI.panelOpen = false; UI.root.classList.add('vquest_hidden'); },
  toggle: togglePanel,
  
  getState: getChatState,
  
  getAvailable: () => getChatState().availableQuests,
  getActive: () => getChatState().activeQuests,
  getCompleted: () => getChatState().completedQuests,
  
  accept: async (questId) => {
    const st = getChatState();
    const result = acceptQuest(st, questId);
    await commitState(st);
    render();
    return result;
  },
  
  complete: async (questId) => {
    const st = getChatState();
    const result = completeQuest(st, questId);
    await commitState(st);
    render();
    return result;
  },
  
  completeObjective: async (questId, idx) => {
    const st = getChatState();
    const result = completeObjective(st, questId, idx);
    await commitState(st);
    render();
    return result;
  },
  
  abandon: async (questId) => {
    const st = getChatState();
    const result = abandonQuest(st, questId);
    await commitState(st);
    render();
    return result;
  },
  
  refresh: forceRefresh,
  
  generate: async (type) => {
    const st = getChatState();
    const worldState = getWorldState();
    const quest = generateQuest(type, worldState, st.playerRegion);
    if (quest) {
      st.availableQuests.unshift(quest);
      await commitState(st);
      render();
    }
    return quest;
  },
  
  render,
};

// ══════════════════════════════════════════════════════════════════════════════
// JOURNEY INTEGRATION - Quests based on character's story!
// ══════════════════════════════════════════════════════════════════════════════

function subscribeToJourney() {
  if (!window.VJourney) {
    console.log('[Quests] VJourney not available yet, retrying...');
    setTimeout(subscribeToJourney, 1000);
    return;
  }
  
  // Subscribe to faction encounters - quests from that faction!
  window.VJourney.subscribe(window.VJourney.EVENTS.FACTION_ENCOUNTERED, async (data) => {
    console.log('[Quests] Faction context from Journey:', data.faction);
    const st = getChatState();
    st.playerRegion = data.faction;
    st.narrativeFactions = data.allFactions || [data.faction];
    await commitState(st);
  });
  
  // Subscribe to location changes - guild halls = quest boards!
  window.VJourney.subscribe(window.VJourney.EVENTS.LOCATION_CHANGED, async (data) => {
    const st = getChatState();
    
    // Check if this is a quest-giving location
    const isQuestLocation = data.tags?.includes('quests') || 
                            data.location === 'guild' ||
                            data.location === 'tavern' ||  // Taverns often have bounty boards
                            data.location === 'market';    // Markets have job postings
    
    if (isQuestLocation) {
      // UNLOCK QUEST GENERATION - player has visited a quest board!
      st.hasVisitedQuestLocation = true;
      st.lastGenerateDay = 0; // Force refresh
      refreshQuests(st);
      await commitState(st);
      console.log('[Quests] Quest location detected - board UNLOCKED and refreshed!');
      if (UI.panelOpen) render();
    }
  });
  
  // Subscribe to context updates for smarter quest generation
  window.VJourney.subscribe(window.VJourney.EVENTS.CONTEXT_UPDATED, async (data) => {
    const st = getChatState();
    st.journeyContext = {
      location: data.location,
      locationType: data.locationType,
      terrain: data.terrain,
      faction: data.faction,
      npcs: data.npcsKnown,
      factions: data.factionsEncountered,
      locations: data.locationsVisited,
      inCombat: data.inCombat,
      tags: data.tags,
    };
    
    // Update player region based on current faction
    if (data.faction) {
      st.playerRegion = data.faction;
    }
    
    await commitState(st);
  });
  
  // Sync with current journey state
  const ctx = window.VJourney.getContext();
  if (ctx.faction) {
    const st = getChatState();
    st.playerRegion = ctx.faction;
    commitState(st);
  }
  
  console.log('[Quests] Subscribed to Journey Tracker!');
}

// Override generateQuestBoard to use journey context
const originalGenerateQuestBoard = generateQuestBoard;
generateQuestBoard = function(st, count = 8) {
  // Adjust quest types based on journey context
  if (st.journeyContext) {
    // If in dungeon, more combat/exploration quests
    if (st.journeyContext.locationType === 'dungeon') {
      count = Math.min(count + 2, 12);
    }
    // If near factions player has encountered, bias toward those
    st.biasedFactions = st.journeyContext.factions || [];
  }
  return originalGenerateQuestBoard(st, count);
};

// ══════════════════════════════════════════════════════════════════════════════
// LIFECYCLE
// ══════════════════════════════════════════════════════════════════════════════

function registerEvents() {
  if (!eventSource || !event_types) return;
  
  eventSource.on(event_types.CHAT_CHANGED, () => {
    console.log('[Quests] Chat changed');
    if (UI.panelOpen) render();
  });
  
  eventSource.on(event_types.MESSAGE_RECEIVED, () => {
    setTimeout(async () => {
      try {
        const st = getChatState();
        refreshQuests(st);
        await commitState(st);
        if (UI.panelOpen) render();
      } catch (e) {
        console.error('[Quests] Refresh error:', e);
      }
    }, 300);
  });
  
  // Subscribe to Journey Tracker
  setTimeout(subscribeToJourney, 500);
}

(async function main() {
  console.log('[Quests] Loading...');
  try {
    mountUI();
    registerEvents();
    console.log('[Quests] Ready!');
  } catch (e) {
    console.error('[Quests] Init failed:', e);
  }
})();
