/**
 * Valdris Economy System
 * =======================
 * Dynamic pricing based on region, faction relations, wars, and supply/demand.
 * 
 * Install folder:
 *   SillyTavern/public/scripts/extensions/third-party/valdris-economy/
 */

const EXT_NAME = 'valdris-economy';
const META_KEY = 'vecon_state_v1';

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
  console.error('[Economy] Failed to import extensions.js', e);
}

try {
  const scriptModule = await import('../../../../script.js');
  eventSource = scriptModule.eventSource;
  event_types = scriptModule.event_types;
  if (!saveSettingsDebounced) saveSettingsDebounced = scriptModule.saveSettingsDebounced;
} catch (e) {
  console.error('[Economy] Failed to import script.js', e);
}

// ══════════════════════════════════════════════════════════════════════════════
// CURRENCY
// ══════════════════════════════════════════════════════════════════════════════

const CURRENCY = {
  gold: { name: 'Gold', abbr: 'gp', icon: '🪙', value: 1 },
  silver: { name: 'Silver', abbr: 'sp', icon: '🥈', value: 0.1 },
  copper: { name: 'Copper', abbr: 'cp', icon: '🥉', value: 0.01 },
};

function formatPrice(goldValue) {
  if (goldValue >= 1) {
    const gold = Math.floor(goldValue);
    const silver = Math.floor((goldValue - gold) * 10);
    if (silver > 0) return `${gold}gp ${silver}sp`;
    return `${gold}gp`;
  }
  if (goldValue >= 0.1) {
    return `${Math.floor(goldValue * 10)}sp`;
  }
  return `${Math.floor(goldValue * 100)}cp`;
}

// ══════════════════════════════════════════════════════════════════════════════
// GOODS CATALOG
// ══════════════════════════════════════════════════════════════════════════════

const ITEM_CATEGORIES = {
  weapons: { name: 'Weapons', icon: '⚔️', color: '#f44336' },
  armor: { name: 'Armor', icon: '🛡️', color: '#607D8B' },
  food: { name: 'Food & Supplies', icon: '🍖', color: '#8BC34A' },
  potions: { name: 'Potions & Alchemy', icon: '🧪', color: '#9C27B0' },
  materials: { name: 'Materials', icon: '🪨', color: '#795548' },
  luxury: { name: 'Luxury Goods', icon: '💎', color: '#E91E63' },
  services: { name: 'Services', icon: '🏨', color: '#2196F3' },
  mounts: { name: 'Mounts & Vehicles', icon: '🐴', color: '#FF9800' },
};

const BASE_GOODS = {
  // WEAPONS
  dagger: { name: 'Dagger', category: 'weapons', basePrice: 2, rarity: 'common' },
  shortsword: { name: 'Shortsword', category: 'weapons', basePrice: 10, rarity: 'common' },
  longsword: { name: 'Longsword', category: 'weapons', basePrice: 15, rarity: 'common' },
  greatsword: { name: 'Greatsword', category: 'weapons', basePrice: 50, rarity: 'uncommon' },
  battleaxe: { name: 'Battleaxe', category: 'weapons', basePrice: 10, rarity: 'common' },
  warhammer: { name: 'Warhammer', category: 'weapons', basePrice: 15, rarity: 'common' },
  spear: { name: 'Spear', category: 'weapons', basePrice: 1, rarity: 'common' },
  shortbow: { name: 'Shortbow', category: 'weapons', basePrice: 25, rarity: 'common' },
  longbow: { name: 'Longbow', category: 'weapons', basePrice: 50, rarity: 'uncommon' },
  crossbow: { name: 'Crossbow', category: 'weapons', basePrice: 35, rarity: 'uncommon' },
  arrows_20: { name: 'Arrows (20)', category: 'weapons', basePrice: 1, rarity: 'common' },
  bolts_20: { name: 'Bolts (20)', category: 'weapons', basePrice: 1, rarity: 'common' },
  staff: { name: 'Quarterstaff', category: 'weapons', basePrice: 0.2, rarity: 'common' },
  mace: { name: 'Mace', category: 'weapons', basePrice: 5, rarity: 'common' },
  
  // ARMOR
  leather_armor: { name: 'Leather Armor', category: 'armor', basePrice: 10, rarity: 'common' },
  studded_leather: { name: 'Studded Leather', category: 'armor', basePrice: 45, rarity: 'uncommon' },
  chain_shirt: { name: 'Chain Shirt', category: 'armor', basePrice: 50, rarity: 'uncommon' },
  chainmail: { name: 'Chainmail', category: 'armor', basePrice: 75, rarity: 'uncommon' },
  scale_mail: { name: 'Scale Mail', category: 'armor', basePrice: 50, rarity: 'uncommon' },
  plate_armor: { name: 'Plate Armor', category: 'armor', basePrice: 1500, rarity: 'rare' },
  shield: { name: 'Shield', category: 'armor', basePrice: 10, rarity: 'common' },
  helmet: { name: 'Helmet', category: 'armor', basePrice: 5, rarity: 'common' },
  
  // FOOD & SUPPLIES
  rations_day: { name: 'Rations (1 day)', category: 'food', basePrice: 0.5, rarity: 'common' },
  rations_week: { name: 'Rations (1 week)', category: 'food', basePrice: 3.5, rarity: 'common' },
  waterskin: { name: 'Waterskin', category: 'food', basePrice: 0.2, rarity: 'common' },
  ale_mug: { name: 'Ale (mug)', category: 'food', basePrice: 0.04, rarity: 'common' },
  wine_bottle: { name: 'Wine (bottle)', category: 'food', basePrice: 0.2, rarity: 'common' },
  fine_wine: { name: 'Fine Wine', category: 'food', basePrice: 10, rarity: 'uncommon' },
  bread: { name: 'Bread (loaf)', category: 'food', basePrice: 0.02, rarity: 'common' },
  cheese_wheel: { name: 'Cheese Wheel', category: 'food', basePrice: 0.1, rarity: 'common' },
  meat_dried: { name: 'Dried Meat (lb)', category: 'food', basePrice: 0.5, rarity: 'common' },
  torch: { name: 'Torch', category: 'food', basePrice: 0.01, rarity: 'common' },
  lantern: { name: 'Lantern', category: 'food', basePrice: 5, rarity: 'common' },
  oil_flask: { name: 'Oil (flask)', category: 'food', basePrice: 0.1, rarity: 'common' },
  rope_50ft: { name: 'Rope (50 ft)', category: 'food', basePrice: 1, rarity: 'common' },
  bedroll: { name: 'Bedroll', category: 'food', basePrice: 1, rarity: 'common' },
  tent: { name: 'Tent (2-person)', category: 'food', basePrice: 2, rarity: 'common' },
  backpack: { name: 'Backpack', category: 'food', basePrice: 2, rarity: 'common' },
  
  // POTIONS & ALCHEMY
  healing_potion: { name: 'Healing Potion', category: 'potions', basePrice: 50, rarity: 'uncommon' },
  greater_healing: { name: 'Greater Healing Potion', category: 'potions', basePrice: 150, rarity: 'rare' },
  antidote: { name: 'Antidote', category: 'potions', basePrice: 50, rarity: 'uncommon' },
  potion_strength: { name: 'Potion of Strength', category: 'potions', basePrice: 100, rarity: 'rare' },
  potion_speed: { name: 'Potion of Speed', category: 'potions', basePrice: 100, rarity: 'rare' },
  potion_invisibility: { name: 'Potion of Invisibility', category: 'potions', basePrice: 200, rarity: 'rare' },
  alchemist_fire: { name: 'Alchemist\'s Fire', category: 'potions', basePrice: 50, rarity: 'uncommon' },
  poison_basic: { name: 'Basic Poison (vial)', category: 'potions', basePrice: 100, rarity: 'uncommon' },
  herbalism_kit: { name: 'Herbalism Kit', category: 'potions', basePrice: 5, rarity: 'common' },
  
  // MATERIALS
  iron_ore: { name: 'Iron Ore (lb)', category: 'materials', basePrice: 0.1, rarity: 'common' },
  iron_ingot: { name: 'Iron Ingot', category: 'materials', basePrice: 1, rarity: 'common' },
  steel_ingot: { name: 'Steel Ingot', category: 'materials', basePrice: 5, rarity: 'uncommon' },
  mithril_ingot: { name: 'Mithril Ingot', category: 'materials', basePrice: 500, rarity: 'rare' },
  leather_hide: { name: 'Leather Hide', category: 'materials', basePrice: 2, rarity: 'common' },
  cloth_bolt: { name: 'Cloth (bolt)', category: 'materials', basePrice: 1, rarity: 'common' },
  silk_bolt: { name: 'Silk (bolt)', category: 'materials', basePrice: 10, rarity: 'uncommon' },
  wood_bundle: { name: 'Wood Bundle', category: 'materials', basePrice: 0.5, rarity: 'common' },
  herbs_common: { name: 'Common Herbs', category: 'materials', basePrice: 1, rarity: 'common' },
  herbs_rare: { name: 'Rare Herbs', category: 'materials', basePrice: 25, rarity: 'uncommon' },
  monster_parts: { name: 'Monster Parts', category: 'materials', basePrice: 10, rarity: 'uncommon' },
  gemstone_small: { name: 'Small Gemstone', category: 'materials', basePrice: 50, rarity: 'uncommon' },
  
  // LUXURY
  jewelry_simple: { name: 'Simple Jewelry', category: 'luxury', basePrice: 25, rarity: 'common' },
  jewelry_fine: { name: 'Fine Jewelry', category: 'luxury', basePrice: 250, rarity: 'uncommon' },
  jewelry_exquisite: { name: 'Exquisite Jewelry', category: 'luxury', basePrice: 2500, rarity: 'rare' },
  perfume: { name: 'Perfume (vial)', category: 'luxury', basePrice: 5, rarity: 'common' },
  spices_exotic: { name: 'Exotic Spices (lb)', category: 'luxury', basePrice: 15, rarity: 'uncommon' },
  art_object: { name: 'Art Object', category: 'luxury', basePrice: 100, rarity: 'uncommon' },
  book_common: { name: 'Book (common)', category: 'luxury', basePrice: 25, rarity: 'common' },
  book_rare: { name: 'Rare Tome', category: 'luxury', basePrice: 250, rarity: 'rare' },
  musical_instrument: { name: 'Musical Instrument', category: 'luxury', basePrice: 30, rarity: 'common' },
  fine_clothes: { name: 'Fine Clothes', category: 'luxury', basePrice: 15, rarity: 'common' },
  noble_clothes: { name: 'Noble\'s Outfit', category: 'luxury', basePrice: 75, rarity: 'uncommon' },
  
  // SERVICES
  inn_poor: { name: 'Inn (poor)', category: 'services', basePrice: 0.1, rarity: 'common', perDay: true },
  inn_modest: { name: 'Inn (modest)', category: 'services', basePrice: 0.5, rarity: 'common', perDay: true },
  inn_comfortable: { name: 'Inn (comfortable)', category: 'services', basePrice: 1, rarity: 'common', perDay: true },
  inn_wealthy: { name: 'Inn (wealthy)', category: 'services', basePrice: 2, rarity: 'uncommon', perDay: true },
  inn_aristocratic: { name: 'Inn (aristocratic)', category: 'services', basePrice: 4, rarity: 'uncommon', perDay: true },
  meal_poor: { name: 'Meal (poor)', category: 'services', basePrice: 0.03, rarity: 'common' },
  meal_modest: { name: 'Meal (modest)', category: 'services', basePrice: 0.1, rarity: 'common' },
  meal_fine: { name: 'Meal (fine)', category: 'services', basePrice: 0.5, rarity: 'common' },
  healing_service: { name: 'Healing (temple)', category: 'services', basePrice: 10, rarity: 'common' },
  cure_disease: { name: 'Cure Disease', category: 'services', basePrice: 100, rarity: 'uncommon' },
  resurrection: { name: 'Resurrection', category: 'services', basePrice: 1000, rarity: 'rare' },
  carriage_ride: { name: 'Carriage (per mile)', category: 'services', basePrice: 0.03, rarity: 'common' },
  ship_passage: { name: 'Ship Passage (per mile)', category: 'services', basePrice: 0.05, rarity: 'common' },
  hireling_unskilled: { name: 'Hireling (unskilled/day)', category: 'services', basePrice: 0.2, rarity: 'common', perDay: true },
  hireling_skilled: { name: 'Hireling (skilled/day)', category: 'services', basePrice: 2, rarity: 'common', perDay: true },
  mercenary: { name: 'Mercenary (per day)', category: 'services', basePrice: 5, rarity: 'uncommon', perDay: true },
  
  // MOUNTS & VEHICLES
  donkey: { name: 'Donkey', category: 'mounts', basePrice: 8, rarity: 'common' },
  horse_draft: { name: 'Draft Horse', category: 'mounts', basePrice: 50, rarity: 'common' },
  horse_riding: { name: 'Riding Horse', category: 'mounts', basePrice: 75, rarity: 'common' },
  warhorse: { name: 'Warhorse', category: 'mounts', basePrice: 400, rarity: 'uncommon' },
  pony: { name: 'Pony', category: 'mounts', basePrice: 30, rarity: 'common' },
  camel: { name: 'Camel', category: 'mounts', basePrice: 50, rarity: 'common' },
  cart: { name: 'Cart', category: 'mounts', basePrice: 15, rarity: 'common' },
  wagon: { name: 'Wagon', category: 'mounts', basePrice: 35, rarity: 'common' },
  carriage: { name: 'Carriage', category: 'mounts', basePrice: 100, rarity: 'uncommon' },
  rowboat: { name: 'Rowboat', category: 'mounts', basePrice: 50, rarity: 'common' },
  saddle: { name: 'Saddle', category: 'mounts', basePrice: 10, rarity: 'common' },
  barding_leather: { name: 'Leather Barding', category: 'mounts', basePrice: 40, rarity: 'uncommon' },
  barding_chain: { name: 'Chain Barding', category: 'mounts', basePrice: 150, rarity: 'rare' },
};

// ══════════════════════════════════════════════════════════════════════════════
// REGIONAL MODIFIERS
// ══════════════════════════════════════════════════════════════════════════════

// Each faction has price modifiers for different categories
// Negative = cheaper, Positive = more expensive
const FACTION_MODIFIERS = {
  valdran_empire: {
    name: 'Valdran Empire',
    weapons: -0.1,      // Military state, decent weapons
    armor: -0.1,
    food: 0,
    potions: 0.1,
    materials: 0,
    luxury: 0,
    services: -0.1,     // Organized infrastructure
    mounts: -0.1,
    specialty: ['weapons', 'armor'],
  },
  magocracy: {
    name: 'Magocracy of Arcana',
    weapons: 0.2,
    armor: 0.2,
    food: 0.1,
    potions: -0.3,      // Magic central!
    materials: 0,
    luxury: 0.1,        // Mages like fancy things
    services: 0.1,
    mounts: 0.2,
    specialty: ['potions'],
  },
  solarus_theocracy: {
    name: 'Solarus Theocracy',
    weapons: 0.1,
    armor: 0,
    food: -0.1,         // Temple charity
    potions: 0,
    materials: 0.1,
    luxury: 0.2,        // Religious art expensive
    services: -0.2,     // Temple healing cheaper
    mounts: 0,
    specialty: ['services'],
  },
  elven_courts: {
    name: 'Elven Courts',
    weapons: 0.1,
    armor: 0.2,
    food: -0.2,         // Forest bounty
    potions: -0.2,      // Herbal mastery
    materials: 0.1,
    luxury: 0.3,        // Elven crafts are premium
    services: 0.2,      // Isolationist markup
    mounts: 0.3,
    specialty: ['food', 'potions'],
  },
  dwarven_holds: {
    name: 'Dwarven Holds',
    weapons: -0.3,      // Master smiths!
    armor: -0.3,
    food: 0.2,          // Have to import
    potions: 0.1,
    materials: -0.4,    // Miners!
    luxury: 0,
    services: 0.1,
    mounts: 0.3,        // Not big on animals
    specialty: ['weapons', 'armor', 'materials'],
  },
  orcish_dominion: {
    name: 'Orcish Dominion',
    weapons: -0.2,      // Warriors make weapons
    armor: -0.1,
    food: -0.1,         // Hunt their food
    potions: 0.3,       // Don't trust magic
    materials: 0,
    luxury: 0.4,        // Don't care for luxury
    services: 0.3,      // Limited services
    mounts: -0.2,       // Good with beasts
    specialty: ['weapons', 'mounts'],
  },
  free_cities: {
    name: 'Free Cities League',
    weapons: 0,
    armor: 0,
    food: -0.1,
    potions: -0.1,
    materials: -0.1,
    luxury: -0.2,       // Trade hub!
    services: -0.1,
    mounts: 0,
    specialty: ['luxury'],
    tradeHub: true,     // Best overall prices
  },
  shadow_consortium: {
    name: 'Shadow Consortium',
    weapons: 0.1,
    armor: 0.2,
    food: 0.2,
    potions: -0.1,      // Poisons are easy here
    materials: 0.1,
    luxury: 0,
    services: 0.3,      // Underground, limited
    mounts: 0.3,
    specialty: ['potions'],
    blackMarket: true,  // Illegal goods available
  },
  beastkin_tribes: {
    name: 'Beastkin Tribes',
    weapons: 0.1,
    armor: 0.1,
    food: -0.3,         // Hunters
    potions: 0,
    materials: -0.2,    // Hides, furs
    luxury: 0.4,
    services: 0.4,      // Tribal, limited
    mounts: -0.3,       // Beast tamers
    specialty: ['food', 'materials', 'mounts'],
  },
  undead_kingdoms: {
    name: 'Undead Kingdoms',
    weapons: 0.1,
    armor: 0,
    food: 0.5,          // Undead don't farm
    potions: 0.2,
    materials: 0,
    luxury: -0.1,       // Grave goods
    services: 0.5,      // Very limited
    mounts: 0.3,
    specialty: [],
    dangerous: true,
  },
  sea_kingdoms: {
    name: 'Sea Kingdoms',
    weapons: 0.1,
    armor: 0.2,         // Rust issues
    food: -0.2,         // Fish plenty
    potions: 0.1,
    materials: 0.1,
    luxury: -0.1,       // Trade goods
    services: -0.2,     // Port services
    mounts: 0.3,        // Ships not horses
    specialty: ['food', 'services'],
  },
  nomad_confederacy: {
    name: 'Nomad Confederacy',
    weapons: 0,
    armor: 0.1,
    food: -0.2,         // Herders
    potions: 0.2,
    materials: 0.1,
    luxury: 0.2,
    services: 0.3,      // Nomadic, limited
    mounts: -0.4,       // Horse lords!
    specialty: ['mounts', 'food'],
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════════════════════════════

function newEmptyState() {
  return {
    version: 1,
    currentRegion: 'valdran_empire',
    globalInflation: 0,           // -0.5 to 0.5
    supplyModifiers: {},          // Per-item supply adjustments
    demandModifiers: {},          // Per-item demand adjustments
    tradeRoutes: initTradeRoutes(),
    priceHistory: [],             // Track price changes
    lastTickDay: 0,
    playerGold: 0,                // Optional tracking
  };
}

function initTradeRoutes() {
  // Trade routes between regions - war blocks these
  return {
    'valdran_empire-free_cities': { active: true, bonus: -0.1 },
    'valdran_empire-dwarven_holds': { active: true, bonus: -0.05 },
    'valdran_empire-solarus_theocracy': { active: true, bonus: -0.05 },
    'free_cities-sea_kingdoms': { active: true, bonus: -0.15 },
    'free_cities-magocracy': { active: true, bonus: -0.1 },
    'free_cities-elven_courts': { active: true, bonus: -0.05 },
    'dwarven_holds-free_cities': { active: true, bonus: -0.1 },
    'elven_courts-magocracy': { active: true, bonus: -0.1 },
    'sea_kingdoms-nomad_confederacy': { active: true, bonus: -0.05 },
    'orcish_dominion-beastkin_tribes': { active: true, bonus: -0.05 },
    'nomad_confederacy-beastkin_tribes': { active: true, bonus: -0.05 },
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
// PRICE CALCULATION
// ══════════════════════════════════════════════════════════════════════════════

function calculatePrice(itemId, st, options = {}) {
  const item = BASE_GOODS[itemId];
  if (!item) return null;
  
  const region = options.region || st.currentRegion;
  const factionMods = FACTION_MODIFIERS[region] || {};
  
  let price = item.basePrice;
  
  // 1. Regional modifier
  const categoryMod = factionMods[item.category] || 0;
  price *= (1 + categoryMod);
  
  // 2. Global inflation
  price *= (1 + st.globalInflation);
  
  // 3. Supply modifier for this item
  const supplyMod = st.supplyModifiers[itemId] || 0;
  price *= (1 + supplyMod);
  
  // 4. Demand modifier
  const demandMod = st.demandModifiers[itemId] || 0;
  price *= (1 + demandMod);
  
  // 5. War effects - check if trade routes are blocked
  const warPenalty = calculateWarPenalty(itemId, item, region, st);
  price *= (1 + warPenalty);
  
  // 6. Trade hub bonus
  if (factionMods.tradeHub) {
    price *= 0.95; // 5% discount at trade hubs
  }
  
  // 7. Trade route bonuses
  const routeBonus = calculateTradeRouteBonus(region, st);
  price *= (1 + routeBonus);
  
  // 8. Rarity affects price variance
  const rarityVariance = {
    common: 0.1,
    uncommon: 0.15,
    rare: 0.2,
    legendary: 0.25,
  }[item.rarity] || 0.1;
  
  // Round to reasonable precision
  if (price >= 1) {
    price = Math.round(price * 10) / 10;
  } else {
    price = Math.round(price * 100) / 100;
  }
  
  return {
    itemId,
    item,
    basePrice: item.basePrice,
    finalPrice: price,
    region,
    modifiers: {
      regional: categoryMod,
      inflation: st.globalInflation,
      supply: supplyMod,
      demand: demandMod,
      war: warPenalty,
      tradeRoute: routeBonus,
    },
    priceChange: ((price - item.basePrice) / item.basePrice) * 100,
  };
}

function calculateWarPenalty(itemId, item, region, st) {
  const diplomacy = window.VDiplomacy;
  if (!diplomacy) return 0;
  
  const wars = diplomacy.getActiveWars?.() || [];
  if (wars.length === 0) return 0;
  
  let penalty = 0;
  
  // Check if current region is at war
  const regionAtWar = wars.some(w => w.attacker === region || w.defender === region);
  if (regionAtWar) {
    // General wartime inflation
    penalty += 0.15;
    
    // Food is scarce in war
    if (item.category === 'food') penalty += 0.2;
    
    // Weapons/armor in demand
    if (item.category === 'weapons' || item.category === 'armor') penalty += 0.1;
  }
  
  // Check blocked trade routes
  const factionMods = FACTION_MODIFIERS[region];
  if (factionMods?.specialty) {
    // If this item is a specialty and comes from a warring faction, price spike
    for (const war of wars) {
      const enemyFaction = war.attacker === region ? war.defender : 
                          war.defender === region ? war.attacker : null;
      if (enemyFaction) {
        const enemyMods = FACTION_MODIFIERS[enemyFaction];
        if (enemyMods?.specialty?.includes(item.category)) {
          penalty += 0.3; // 30% markup for blocked goods
        }
      }
    }
  }
  
  return penalty;
}

function calculateTradeRouteBonus(region, st) {
  let totalBonus = 0;
  let activeRoutes = 0;
  
  for (const [route, data] of Object.entries(st.tradeRoutes)) {
    if (!data.active) continue;
    
    const [faction1, faction2] = route.split('-');
    if (faction1 === region || faction2 === region) {
      totalBonus += data.bonus;
      activeRoutes++;
    }
  }
  
  return activeRoutes > 0 ? totalBonus / activeRoutes : 0;
}

function updateTradeRoutes(st) {
  const diplomacy = window.VDiplomacy;
  if (!diplomacy) return;
  
  const wars = diplomacy.getActiveWars?.() || [];
  
  // Reset routes
  for (const route of Object.keys(st.tradeRoutes)) {
    st.tradeRoutes[route].active = true;
  }
  
  // Block routes between warring factions
  for (const war of wars) {
    const routeKey1 = `${war.attacker}-${war.defender}`;
    const routeKey2 = `${war.defender}-${war.attacker}`;
    
    if (st.tradeRoutes[routeKey1]) st.tradeRoutes[routeKey1].active = false;
    if (st.tradeRoutes[routeKey2]) st.tradeRoutes[routeKey2].active = false;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ECONOMY SIMULATION
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

function tickEconomy(st) {
  const currentDay = getCurrentDay();
  if (currentDay <= st.lastTickDay) return;
  
  const daysPassed = Math.min(currentDay - st.lastTickDay, 30);
  st.lastTickDay = currentDay;
  
  // Update trade routes based on wars
  updateTradeRoutes(st);
  
  // Slowly normalize supply/demand
  for (const itemId of Object.keys(st.supplyModifiers)) {
    st.supplyModifiers[itemId] *= 0.95; // Decay toward normal
    if (Math.abs(st.supplyModifiers[itemId]) < 0.01) {
      delete st.supplyModifiers[itemId];
    }
  }
  
  for (const itemId of Object.keys(st.demandModifiers)) {
    st.demandModifiers[itemId] *= 0.95;
    if (Math.abs(st.demandModifiers[itemId]) < 0.01) {
      delete st.demandModifiers[itemId];
    }
  }
  
  // Inflation fluctuates
  st.globalInflation += (Math.random() - 0.5) * 0.02;
  st.globalInflation = Math.max(-0.3, Math.min(0.3, st.globalInflation));
  
  // War causes inflation
  const diplomacy = window.VDiplomacy;
  if (diplomacy) {
    const wars = diplomacy.getActiveWars?.() || [];
    if (wars.length > 0) {
      st.globalInflation += 0.01 * wars.length;
      st.globalInflation = Math.min(0.5, st.globalInflation);
    }
  }
  
  // Random supply/demand events
  if (daysPassed > 0 && Math.random() < 0.1) {
    generateMarketEvent(st);
  }
}

function generateMarketEvent(st) {
  const eventTypes = ['shortage', 'surplus', 'demand_spike', 'demand_drop'];
  const type = eventTypes[Math.floor(Math.random() * eventTypes.length)];
  
  const itemIds = Object.keys(BASE_GOODS);
  const randomItem = itemIds[Math.floor(Math.random() * itemIds.length)];
  
  switch (type) {
    case 'shortage':
      st.supplyModifiers[randomItem] = (st.supplyModifiers[randomItem] || 0) + 0.2;
      break;
    case 'surplus':
      st.supplyModifiers[randomItem] = (st.supplyModifiers[randomItem] || 0) - 0.15;
      break;
    case 'demand_spike':
      st.demandModifiers[randomItem] = (st.demandModifiers[randomItem] || 0) + 0.15;
      break;
    case 'demand_drop':
      st.demandModifiers[randomItem] = (st.demandModifiers[randomItem] || 0) - 0.1;
      break;
  }
  
  console.log(`[Economy] Market event: ${type} for ${BASE_GOODS[randomItem].name}`);
}

// ══════════════════════════════════════════════════════════════════════════════
// UI
// ══════════════════════════════════════════════════════════════════════════════

const UI = {
  mounted: false,
  root: null,
  panelOpen: false,
  selectedCategory: 'all',
  searchQuery: '',
};

function mountUI() {
  if (UI.mounted) return;
  UI.mounted = true;
  
  // Launcher
  const launcher = document.createElement('button');
  launcher.id = 'vecon_launcher';
  launcher.className = 'vecon_launcher';
  launcher.innerHTML = '💰';
  launcher.title = 'Economy & Trade';
  launcher.addEventListener('click', togglePanel);
  document.body.appendChild(launcher);
  
  // Main panel
  const panel = document.createElement('div');
  panel.id = 'vecon_root';
  panel.className = 'vecon_panel vecon_hidden';
  panel.innerHTML = `
    <div class="vecon_header">
      <div class="vecon_title">
        <span class="vecon_title_icon">💰</span>
        <span>Economy & Trade</span>
      </div>
      <div class="vecon_header_actions">
        <button class="vecon_btn" id="vecon_btn_close" title="Close">✕</button>
      </div>
    </div>
    
    <div class="vecon_body">
      <!-- Region Selector -->
      <div class="vecon_region_bar">
        <span class="vecon_region_label">Current Region:</span>
        <select class="vecon_region_select" id="vecon_region_select">
          <!-- Populated by JS -->
        </select>
        <div class="vecon_inflation" id="vecon_inflation">Inflation: 0%</div>
      </div>
      
      <!-- Search & Filter -->
      <div class="vecon_filter_bar">
        <input type="text" class="vecon_search" id="vecon_search" placeholder="Search items...">
        <div class="vecon_category_tabs" id="vecon_category_tabs">
          <!-- Populated by JS -->
        </div>
      </div>
      
      <!-- Goods List -->
      <div class="vecon_goods_list" id="vecon_goods_list">
        <!-- Populated by JS -->
      </div>
      
      <!-- Trade Route Status -->
      <div class="vecon_trade_routes" id="vecon_trade_routes">
        <div class="vecon_section_title">Trade Routes</div>
        <div class="vecon_routes_grid" id="vecon_routes_grid">
          <!-- Populated by JS -->
        </div>
      </div>
    </div>
    
    <div class="vecon_footer">
      <div class="vecon_legend">
        <span class="vecon_price_up">📈 Above base</span>
        <span class="vecon_price_down">📉 Below base</span>
        <span class="vecon_specialty">⭐ Regional specialty</span>
      </div>
    </div>
  `;
  
  document.body.appendChild(panel);
  UI.root = panel;
  
  setupEventListeners();
  render();
  
  console.log('[Economy] UI mounted');
}

function setupEventListeners() {
  document.getElementById('vecon_btn_close').addEventListener('click', togglePanel);
  
  document.getElementById('vecon_region_select').addEventListener('change', async (e) => {
    const st = getChatState();
    st.currentRegion = e.target.value;
    await commitState(st);
    render();
  });
  
  document.getElementById('vecon_search').addEventListener('input', (e) => {
    UI.searchQuery = e.target.value.toLowerCase();
    renderGoodsList();
  });
}

function togglePanel() {
  UI.panelOpen = !UI.panelOpen;
  UI.root.classList.toggle('vecon_hidden', !UI.panelOpen);
  if (UI.panelOpen) {
    const st = getChatState();
    tickEconomy(st);
    commitState(st);
    render();
  }
}

function render() {
  const st = getChatState();
  
  renderRegionSelect(st);
  renderInflation(st);
  renderCategoryTabs();
  renderGoodsList();
  renderTradeRoutes(st);
}

function renderRegionSelect(st) {
  const select = document.getElementById('vecon_region_select');
  let html = '';
  
  for (const [id, data] of Object.entries(FACTION_MODIFIERS)) {
    const selected = st.currentRegion === id ? 'selected' : '';
    html += `<option value="${id}" ${selected}>${data.name}</option>`;
  }
  
  select.innerHTML = html;
}

function renderInflation(st) {
  const el = document.getElementById('vecon_inflation');
  const pct = Math.round(st.globalInflation * 100);
  const color = pct > 10 ? '#f44336' : pct > 0 ? '#FF9800' : pct < -10 ? '#4CAF50' : '#9E9E9E';
  el.innerHTML = `Inflation: <span style="color: ${color}">${pct > 0 ? '+' : ''}${pct}%</span>`;
}

function renderCategoryTabs() {
  const container = document.getElementById('vecon_category_tabs');
  let html = `<button class="vecon_cat_btn ${UI.selectedCategory === 'all' ? 'vecon_cat_active' : ''}" data-cat="all">All</button>`;
  
  for (const [id, cat] of Object.entries(ITEM_CATEGORIES)) {
    const active = UI.selectedCategory === id ? 'vecon_cat_active' : '';
    html += `<button class="vecon_cat_btn ${active}" data-cat="${id}">${cat.icon} ${cat.name}</button>`;
  }
  
  container.innerHTML = html;
  
  container.querySelectorAll('.vecon_cat_btn').forEach(btn => {
    btn.addEventListener('click', () => {
      UI.selectedCategory = btn.dataset.cat;
      renderCategoryTabs();
      renderGoodsList();
    });
  });
}

function renderGoodsList() {
  const st = getChatState();
  const container = document.getElementById('vecon_goods_list');
  const factionMods = FACTION_MODIFIERS[st.currentRegion] || {};
  
  let items = Object.entries(BASE_GOODS);
  
  // Filter by category
  if (UI.selectedCategory !== 'all') {
    items = items.filter(([id, item]) => item.category === UI.selectedCategory);
  }
  
  // Filter by search
  if (UI.searchQuery) {
    items = items.filter(([id, item]) => item.name.toLowerCase().includes(UI.searchQuery));
  }
  
  // Sort by category then name
  items.sort((a, b) => {
    if (a[1].category !== b[1].category) {
      return a[1].category.localeCompare(b[1].category);
    }
    return a[1].name.localeCompare(b[1].name);
  });
  
  let html = '';
  let currentCategory = '';
  
  for (const [itemId, item] of items) {
    // Category header
    if (item.category !== currentCategory) {
      currentCategory = item.category;
      const cat = ITEM_CATEGORIES[currentCategory];
      html += `<div class="vecon_cat_header"><span>${cat.icon}</span> ${cat.name}</div>`;
    }
    
    const priceData = calculatePrice(itemId, st);
    const priceDiff = priceData.priceChange;
    const priceClass = priceDiff > 5 ? 'vecon_price_high' : priceDiff < -5 ? 'vecon_price_low' : '';
    const isSpecialty = factionMods.specialty?.includes(item.category);
    
    html += `
      <div class="vecon_item ${priceClass}">
        <div class="vecon_item_name">
          ${item.name}
          ${isSpecialty ? '<span class="vecon_specialty_badge">⭐</span>' : ''}
          ${item.perDay ? '<span class="vecon_per_day">/day</span>' : ''}
        </div>
        <div class="vecon_item_prices">
          <span class="vecon_base_price">${formatPrice(item.basePrice)}</span>
          <span class="vecon_arrow">${priceDiff > 0 ? '📈' : priceDiff < 0 ? '📉' : '➡️'}</span>
          <span class="vecon_final_price">${formatPrice(priceData.finalPrice)}</span>
          <span class="vecon_price_diff">(${priceDiff > 0 ? '+' : ''}${Math.round(priceDiff)}%)</span>
        </div>
      </div>
    `;
  }
  
  container.innerHTML = html || '<div class="vecon_empty">No items found</div>';
}

function renderTradeRoutes(st) {
  const grid = document.getElementById('vecon_routes_grid');
  let html = '';
  
  const relevantRoutes = Object.entries(st.tradeRoutes).filter(([route]) => {
    const [f1, f2] = route.split('-');
    return f1 === st.currentRegion || f2 === st.currentRegion;
  });
  
  if (relevantRoutes.length === 0) {
    html = '<div class="vecon_no_routes">No direct trade routes</div>';
  } else {
    for (const [route, data] of relevantRoutes) {
      const [f1, f2] = route.split('-');
      const otherFaction = f1 === st.currentRegion ? f2 : f1;
      const otherName = FACTION_MODIFIERS[otherFaction]?.name || otherFaction;
      
      html += `
        <div class="vecon_route ${data.active ? '' : 'vecon_route_blocked'}">
          <span class="vecon_route_icon">${data.active ? '🛤️' : '🚫'}</span>
          <span class="vecon_route_name">${otherName}</span>
          <span class="vecon_route_status">${data.active ? `${Math.round(data.bonus * 100)}%` : 'BLOCKED'}</span>
        </div>
      `;
    }
  }
  
  grid.innerHTML = html;
}

// ══════════════════════════════════════════════════════════════════════════════
// GLOBAL API
// ══════════════════════════════════════════════════════════════════════════════

window.VEconomy = {
  open: () => { UI.panelOpen = true; UI.root.classList.remove('vecon_hidden'); render(); },
  close: () => { UI.panelOpen = false; UI.root.classList.add('vecon_hidden'); },
  toggle: togglePanel,
  
  getState: getChatState,
  
  getPrice: (itemId, region) => {
    const st = getChatState();
    return calculatePrice(itemId, st, { region });
  },
  
  getAllPrices: (region) => {
    const st = getChatState();
    const prices = {};
    for (const itemId of Object.keys(BASE_GOODS)) {
      prices[itemId] = calculatePrice(itemId, st, { region });
    }
    return prices;
  },
  
  setRegion: async (region) => {
    const st = getChatState();
    if (FACTION_MODIFIERS[region]) {
      st.currentRegion = region;
      await commitState(st);
      render();
    }
  },
  
  modifySupply: async (itemId, modifier) => {
    const st = getChatState();
    st.supplyModifiers[itemId] = (st.supplyModifiers[itemId] || 0) + modifier;
    await commitState(st);
    render();
  },
  
  modifyDemand: async (itemId, modifier) => {
    const st = getChatState();
    st.demandModifiers[itemId] = (st.demandModifiers[itemId] || 0) + modifier;
    await commitState(st);
    render();
  },
  
  setInflation: async (value) => {
    const st = getChatState();
    st.globalInflation = Math.max(-0.5, Math.min(0.5, value));
    await commitState(st);
    render();
  },
  
  getCategories: () => ITEM_CATEGORIES,
  getGoods: () => BASE_GOODS,
  getRegions: () => FACTION_MODIFIERS,
  
  formatPrice,
  
  tick: async () => {
    const st = getChatState();
    tickEconomy(st);
    await commitState(st);
    render();
  },
  
  render,
};

// ══════════════════════════════════════════════════════════════════════════════
// JOURNEY INTEGRATION - Prices based on narrative faction!
// ══════════════════════════════════════════════════════════════════════════════

function subscribeToJourney() {
  if (!window.VJourney) {
    console.log('[Economy] VJourney not available yet, retrying...');
    setTimeout(subscribeToJourney, 1000);
    return;
  }
  
  // Subscribe to faction encounters - auto-switch market region!
  window.VJourney.subscribe(window.VJourney.EVENTS.FACTION_ENCOUNTERED, async (data) => {
    console.log('[Economy] Faction context from Journey:', data.faction);
    const st = getChatState();
    if (data.faction && FACTION_MODIFIERS[data.faction]) {
      st.currentRegion = data.faction;
      await commitState(st);
      if (UI.panelOpen) render();
    }
  });
  
  // Subscribe to location changes - some locations imply factions
  window.VJourney.subscribe(window.VJourney.EVENTS.LOCATION_CHANGED, async (data) => {
    // Certain location tags suggest faction markets
    const st = getChatState();
    if (data.tags?.includes('trade')) {
      // Trade locations = Free Cities prices
      st.currentRegion = 'free_cities';
      await commitState(st);
      if (UI.panelOpen) render();
    }
  });
  
  // Sync with current journey state
  const ctx = window.VJourney.getContext();
  if (ctx.faction && FACTION_MODIFIERS[ctx.faction]) {
    const st = getChatState();
    st.currentRegion = ctx.faction;
    commitState(st);
  }
  
  console.log('[Economy] Subscribed to Journey Tracker!');
}

// ══════════════════════════════════════════════════════════════════════════════
// LIFECYCLE
// ══════════════════════════════════════════════════════════════════════════════

function registerEvents() {
  if (!eventSource || !event_types) return;
  
  eventSource.on(event_types.CHAT_CHANGED, () => {
    console.log('[Economy] Chat changed');
    if (UI.panelOpen) render();
  });
  
  // Tick economy on messages
  eventSource.on(event_types.MESSAGE_RECEIVED, () => {
    setTimeout(async () => {
      try {
        const st = getChatState();
        tickEconomy(st);
        await commitState(st);
        if (UI.panelOpen) render();
      } catch (e) {
        console.error('[Economy] Tick error:', e);
      }
    }, 300);
  });
  
  // Subscribe to Journey Tracker
  setTimeout(subscribeToJourney, 500);
}

(async function main() {
  console.log('[Economy] Loading...');
  try {
    mountUI();
    registerEvents();
    console.log('[Economy] Ready!');
  } catch (e) {
    console.error('[Economy] Init failed:', e);
  }
})();
