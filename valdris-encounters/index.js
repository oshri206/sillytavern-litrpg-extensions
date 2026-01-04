/**
 * Valdris Random Encounter System
 * ================================
 * Context-aware encounters based on terrain, time, faction territory, and world state.
 * 
 * Install folder:
 *   SillyTavern/public/scripts/extensions/third-party/valdris-encounters/
 */

const EXT_NAME = 'valdris-encounters';
const META_KEY = 'venc_state_v1';

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
  console.error('[Encounters] Failed to import extensions.js', e);
}

try {
  const scriptModule = await import('../../../../script.js');
  eventSource = scriptModule.eventSource;
  event_types = scriptModule.event_types;
  if (!saveSettingsDebounced) saveSettingsDebounced = scriptModule.saveSettingsDebounced;
} catch (e) {
  console.error('[Encounters] Failed to import script.js', e);
}

// ══════════════════════════════════════════════════════════════════════════════
// TERRAIN TYPES & DANGER LEVELS
// ══════════════════════════════════════════════════════════════════════════════

const TERRAIN_TYPES = {
  road: { name: 'Road', danger: 0.15, icon: '🛤️', desc: 'Well-traveled paths' },
  plains: { name: 'Plains', danger: 0.2, icon: '🌾', desc: 'Open grasslands' },
  forest: { name: 'Forest', danger: 0.35, icon: '🌲', desc: 'Dense woodland' },
  mountain: { name: 'Mountain', danger: 0.45, icon: '⛰️', desc: 'Rocky highlands' },
  swamp: { name: 'Swamp', danger: 0.5, icon: '🐊', desc: 'Murky wetlands' },
  desert: { name: 'Desert', danger: 0.4, icon: '🏜️', desc: 'Scorching sands' },
  coastal: { name: 'Coastal', danger: 0.25, icon: '🏖️', desc: 'Shorelines and beaches' },
  urban: { name: 'Urban', danger: 0.2, icon: '🏘️', desc: 'Towns and cities' },
  underground: { name: 'Underground', danger: 0.6, icon: '🕳️', desc: 'Caves and dungeons' },
  tundra: { name: 'Tundra', danger: 0.45, icon: '❄️', desc: 'Frozen wastes' },
  jungle: { name: 'Jungle', danger: 0.55, icon: '🌴', desc: 'Dense tropical forest' },
  ruins: { name: 'Ruins', danger: 0.5, icon: '🏚️', desc: 'Ancient structures' },
};

// ══════════════════════════════════════════════════════════════════════════════
// ENCOUNTER TABLES
// ══════════════════════════════════════════════════════════════════════════════

// Base encounter types with weights
const ENCOUNTER_TYPES = {
  combat: { weight: 30, icon: '⚔️', color: '#f44336' },
  social: { weight: 35, icon: '👥', color: '#2196F3' },
  environmental: { weight: 15, icon: '🌪️', color: '#FF9800' },
  discovery: { weight: 15, icon: '✨', color: '#9C27B0' },
  quest_hook: { weight: 5, icon: '❗', color: '#4CAF50' },
};

// Combat encounters by terrain
const COMBAT_ENCOUNTERS = {
  road: [
    { name: 'Bandits', enemies: 'A group of highway bandits block your path, weapons drawn.', danger: 2, faction: null },
    { name: 'Deserters', enemies: 'Armed deserters from a recent battle eye you suspiciously.', danger: 2, faction: null },
    { name: 'Wolves', enemies: 'A pack of starving wolves emerges from the treeline.', danger: 1, faction: null },
  ],
  plains: [
    { name: 'Mounted Raiders', enemies: 'Raiders on horseback thunder toward you across the open ground.', danger: 3, faction: 'nomad_confederacy' },
    { name: 'Giant Insects', enemies: 'Massive beetles burst from the tall grass!', danger: 2, faction: null },
    { name: 'Orc Scouts', enemies: 'Orcish scouts spot you and ready their weapons.', danger: 2, faction: 'orcish_dominion' },
  ],
  forest: [
    { name: 'Forest Bandits', enemies: 'Arrows whistle from the trees—forest bandits have you surrounded.', danger: 2, faction: null },
    { name: 'Dire Wolves', enemies: 'Massive dire wolves stalk through the undergrowth toward you.', danger: 3, faction: null },
    { name: 'Elven Patrol', enemies: 'Elven warriors materialize from the shadows, bows drawn.', danger: 2, faction: 'elven_courts' },
    { name: 'Giant Spiders', enemies: 'Webs everywhere—giant spiders descend from above!', danger: 3, faction: null },
    { name: 'Beastkin Hunters', enemies: 'Beastkin hunters emerge, growling at your intrusion.', danger: 2, faction: 'beastkin_tribes' },
  ],
  mountain: [
    { name: 'Rock Trolls', enemies: 'What you thought were boulders stand up—trolls!', danger: 4, faction: null },
    { name: 'Dwarven Patrol', enemies: 'Heavily armed dwarves demand to know your business.', danger: 2, faction: 'dwarven_holds' },
    { name: 'Harpies', enemies: 'Shrieking harpies dive from the cliffs above!', danger: 3, faction: null },
    { name: 'Mountain Bandits', enemies: 'Bandits emerge from a hidden cave, blocking the pass.', danger: 2, faction: null },
  ],
  swamp: [
    { name: 'Lizardfolk', enemies: 'Lizardfolk rise from the murky water, spears ready.', danger: 2, faction: null },
    { name: 'Giant Crocodile', enemies: 'A massive crocodile lunges from the shallows!', danger: 3, faction: null },
    { name: 'Will-o-Wisps', enemies: 'Eerie lights surround you—and they\'re hostile!', danger: 3, faction: null },
    { name: 'Swamp Hag', enemies: 'A cackling hag emerges from her hut, magic crackling.', danger: 4, faction: null },
  ],
  desert: [
    { name: 'Sand Wurm', enemies: 'The ground trembles—a sand wurm erupts beneath you!', danger: 4, faction: null },
    { name: 'Nomad Raiders', enemies: 'Desert raiders encircle you on swift horses.', danger: 3, faction: 'nomad_confederacy' },
    { name: 'Giant Scorpions', enemies: 'Massive scorpions skitter from behind the dunes.', danger: 2, faction: null },
    { name: 'Mummies', enemies: 'Ancient guardians rise from the sand to defend their tomb.', danger: 3, faction: null },
  ],
  coastal: [
    { name: 'Pirates', enemies: 'Pirates emerge from a hidden cove, cutlasses gleaming.', danger: 2, faction: null },
    { name: 'Sea Kingdom Patrol', enemies: 'Naval soldiers demand to see your papers.', danger: 2, faction: 'sea_kingdoms' },
    { name: 'Sahuagin', enemies: 'Fish-men burst from the waves, tridents raised!', danger: 3, faction: null },
    { name: 'Giant Crabs', enemies: 'Enormous crabs scuttle toward you, claws snapping.', danger: 2, faction: null },
  ],
  urban: [
    { name: 'Street Gang', enemies: 'A street gang surrounds you in a dark alley.', danger: 2, faction: null },
    { name: 'City Watch', enemies: 'Guards approach—someone reported suspicious activity.', danger: 1, faction: null },
    { name: 'Assassins', enemies: 'Shadows detach from the walls—assassins!', danger: 4, faction: 'shadow_consortium' },
    { name: 'Thieves Guild', enemies: 'Thieves block both ends of the alley, knives ready.', danger: 2, faction: 'shadow_consortium' },
  ],
  underground: [
    { name: 'Goblins', enemies: 'Goblin war cries echo as a horde charges!', danger: 2, faction: null },
    { name: 'Cave Troll', enemies: 'A massive cave troll blocks the passage ahead.', danger: 4, faction: null },
    { name: 'Undead', enemies: 'Skeletal warriors rise from ancient bones.', danger: 3, faction: 'undead_kingdoms' },
    { name: 'Drow Patrol', enemies: 'Dark elves emerge from the shadows, crossbows aimed.', danger: 3, faction: null },
    { name: 'Ooze', enemies: 'A gelatinous mass slides toward you, dissolving stone.', danger: 2, faction: null },
  ],
  tundra: [
    { name: 'Ice Wolves', enemies: 'White-furred wolves circle in the blizzard.', danger: 2, faction: null },
    { name: 'Frost Giants', enemies: 'Towering figures emerge from the snow—frost giants!', danger: 5, faction: null },
    { name: 'Yetis', enemies: 'Yetis roar and charge through the snowdrifts!', danger: 3, faction: null },
  ],
  jungle: [
    { name: 'Tribal Warriors', enemies: 'Painted warriors emerge from the foliage, weapons ready.', danger: 2, faction: 'beastkin_tribes' },
    { name: 'Giant Snakes', enemies: 'A massive constrictor drops from the canopy!', danger: 3, faction: null },
    { name: 'Carnivorous Plants', enemies: 'The plants are moving—and they\'re hungry!', danger: 2, faction: null },
    { name: 'Dinosaurs', enemies: 'Raptors burst from the undergrowth!', danger: 4, faction: null },
  ],
  ruins: [
    { name: 'Undead Guardians', enemies: 'Ancient guardians stir to protect this place.', danger: 3, faction: 'undead_kingdoms' },
    { name: 'Cultists', enemies: 'Robed figures chant—and then attack!', danger: 3, faction: null },
    { name: 'Golems', enemies: 'Stone guardians animate and march toward you.', danger: 4, faction: null },
    { name: 'Treasure Hunters', enemies: 'Rival adventurers aren\'t willing to share.', danger: 2, faction: null },
  ],
};

// Social encounters (mostly friendly/neutral)
const SOCIAL_ENCOUNTERS = {
  road: [
    { name: 'Merchant Caravan', desc: 'A merchant caravan trundles along, guards alert.', friendly: true, trade: true },
    { name: 'Traveling Bard', desc: 'A cheerful bard with a lute waves you over.', friendly: true },
    { name: 'Pilgrims', desc: 'Religious pilgrims journey toward a distant shrine.', friendly: true, faction: 'solarus_theocracy' },
    { name: 'Imperial Patrol', desc: 'Valdran soldiers march past in formation.', faction: 'valdran_empire' },
    { name: 'Refugees', desc: 'Weary refugees flee some distant conflict.', friendly: true },
  ],
  plains: [
    { name: 'Nomad Traders', desc: 'Nomadic traders offer exotic wares from distant lands.', friendly: true, trade: true, faction: 'nomad_confederacy' },
    { name: 'Shepherds', desc: 'Local shepherds watch their flock graze.', friendly: true },
    { name: 'Horse Breeders', desc: 'Breeders show off their prized stallions.', friendly: true, trade: true },
  ],
  forest: [
    { name: 'Elven Wardens', desc: 'Elven wardens observe you from the trees.', faction: 'elven_courts' },
    { name: 'Herbalist', desc: 'An old herbalist gathers plants and roots.', friendly: true, trade: true },
    { name: 'Woodcutters', desc: 'Woodcutters take a break from their labor.', friendly: true },
    { name: 'Ranger', desc: 'A ranger emerges, tracking something dangerous.', friendly: true },
    { name: 'Druid Circle', desc: 'Druids perform a ritual at an ancient stone.', friendly: true },
  ],
  mountain: [
    { name: 'Dwarven Traders', desc: 'Dwarven merchants haul precious metals.', friendly: true, trade: true, faction: 'dwarven_holds' },
    { name: 'Mountain Hermit', desc: 'A hermit sage lives in these peaks.', friendly: true },
    { name: 'Mining Crew', desc: 'Miners extract ore from the mountainside.', friendly: true, faction: 'dwarven_holds' },
  ],
  swamp: [
    { name: 'Witch', desc: 'A swamp witch offers potions and portents.', trade: true },
    { name: 'Poacher', desc: 'A poacher offers to sell rare pelts.', trade: true },
    { name: 'Lost Traveler', desc: 'Someone is hopelessly lost in the mire.', friendly: true },
  ],
  desert: [
    { name: 'Oasis Camp', desc: 'Travelers rest at a small oasis.', friendly: true },
    { name: 'Nomad Clan', desc: 'A nomad clan offers hospitality.', friendly: true, faction: 'nomad_confederacy' },
    { name: 'Relic Hunters', desc: 'Archaeologists search for buried treasures.', friendly: true },
  ],
  coastal: [
    { name: 'Fishermen', desc: 'Local fishermen mend their nets.', friendly: true },
    { name: 'Ship Captain', desc: 'A captain seeks passengers or cargo.', friendly: true, trade: true, faction: 'sea_kingdoms' },
    { name: 'Smugglers', desc: 'Smugglers offer contraband at good prices.', trade: true },
    { name: 'Beachcombers', desc: 'Beachcombers search for washed-up valuables.', friendly: true },
  ],
  urban: [
    { name: 'Street Vendor', desc: 'A vendor hawks their wares loudly.', friendly: true, trade: true },
    { name: 'Town Crier', desc: 'A crier announces the latest news.', friendly: true },
    { name: 'Noble Procession', desc: 'A noble\'s entourage parts the crowd.', faction: 'valdran_empire' },
    { name: 'Beggars', desc: 'Beggars plead for spare coin.', friendly: true },
    { name: 'Guild Recruiter', desc: 'A guild representative seeks new members.', friendly: true },
    { name: 'Mage Student', desc: 'A young mage practices minor cantrips.', friendly: true, faction: 'magocracy' },
  ],
  underground: [
    { name: 'Lost Adventurers', desc: 'Fellow adventurers are hopelessly lost.', friendly: true },
    { name: 'Duergar Traders', desc: 'Deep dwarves offer rare underground goods.', trade: true },
    { name: 'Escaped Prisoner', desc: 'Someone has escaped from captivity below.', friendly: true },
  ],
  tundra: [
    { name: 'Northern Trappers', desc: 'Fur trappers share a fire and stories.', friendly: true, trade: true },
    { name: 'Ice Fisher', desc: 'A hardy fisher chips at a frozen lake.', friendly: true },
  ],
  jungle: [
    { name: 'Explorers', desc: 'An expedition team rests at camp.', friendly: true },
    { name: 'Tribal Elder', desc: 'A tribal elder emerges to parley.', faction: 'beastkin_tribes' },
    { name: 'Alchemist', desc: 'An alchemist harvests rare jungle ingredients.', friendly: true, trade: true },
  ],
  ruins: [
    { name: 'Archaeologists', desc: 'Scholars carefully excavate the site.', friendly: true },
    { name: 'Treasure Hunters', desc: 'Other adventurers seek the same prize.', },
    { name: 'Ghost', desc: 'A spectral figure appears with a message.', },
  ],
};

// Environmental encounters
const ENVIRONMENTAL_ENCOUNTERS = {
  road: [
    { name: 'Bridge Out', desc: 'The bridge ahead has collapsed.', hazard: true },
    { name: 'Roadblock', desc: 'A fallen tree blocks the path.', hazard: true },
    { name: 'Ambush Site', desc: 'Signs of a recent ambush—blood and broken weapons.', clue: true },
  ],
  plains: [
    { name: 'Prairie Fire', desc: 'Smoke rises on the horizon—fire approaches!', hazard: true, danger: 3 },
    { name: 'Stampede', desc: 'The ground shakes—a herd stampedes toward you!', hazard: true, danger: 2 },
    { name: 'Sinkhole', desc: 'The ground gives way beneath your feet!', hazard: true, danger: 2 },
  ],
  forest: [
    { name: 'Dense Fog', desc: 'Thick fog rolls in, obscuring everything.', hazard: true },
    { name: 'Forest Fire', desc: 'Smoke fills the air—fire spreads through the trees!', hazard: true, danger: 4 },
    { name: 'Quicksand', desc: 'The ground becomes treacherous underfoot.', hazard: true, danger: 2 },
    { name: 'Sacred Grove', desc: 'An ancient grove pulses with magical energy.', magic: true },
  ],
  mountain: [
    { name: 'Avalanche', desc: 'The mountainside gives way in a roar of snow and rock!', hazard: true, danger: 4 },
    { name: 'Rockslide', desc: 'Boulders tumble down toward you!', hazard: true, danger: 3 },
    { name: 'Thin Air', desc: 'The altitude makes breathing difficult.', hazard: true },
    { name: 'Hidden Pass', desc: 'You discover a hidden mountain pass.', discovery: true },
  ],
  swamp: [
    { name: 'Poison Gas', desc: 'Bubbles release noxious fumes from the muck.', hazard: true, danger: 2 },
    { name: 'Quickmud', desc: 'The ground becomes treacherously soft.', hazard: true, danger: 2 },
    { name: 'Disease Cloud', desc: 'Clouds of insects carry disease.', hazard: true, danger: 1 },
    { name: 'Will-o-Wisp Lights', desc: 'Strange lights lead deeper into the swamp...', magic: true },
  ],
  desert: [
    { name: 'Sandstorm', desc: 'A massive sandstorm bears down on you!', hazard: true, danger: 3 },
    { name: 'Heat Wave', desc: 'The heat becomes nearly unbearable.', hazard: true, danger: 2 },
    { name: 'Mirage', desc: 'Is that an oasis ahead, or just a mirage?', },
    { name: 'Buried Ruins', desc: 'Wind reveals ancient stonework beneath the sand.', discovery: true },
  ],
  coastal: [
    { name: 'Riptide', desc: 'Dangerous currents pull at anything in the water.', hazard: true, danger: 2 },
    { name: 'Storm Surge', desc: 'Massive waves crash onto the shore!', hazard: true, danger: 3 },
    { name: 'Shipwreck', desc: 'A ship lies broken on the rocks.', discovery: true },
    { name: 'Tide Pools', desc: 'Unusual creatures trapped in tide pools.', discovery: true },
  ],
  urban: [
    { name: 'Fire!', desc: 'A building is ablaze—people scream for help!', hazard: true, danger: 2 },
    { name: 'Riot', desc: 'An angry mob fills the streets!', hazard: true, danger: 2 },
    { name: 'Festival', desc: 'The city celebrates with music and revelry!', },
    { name: 'Plague Outbreak', desc: 'Sickness spreads through the district.', hazard: true },
  ],
  underground: [
    { name: 'Cave-In', desc: 'The ceiling begins to collapse!', hazard: true, danger: 4 },
    { name: 'Flooding', desc: 'Water rushes through the tunnels!', hazard: true, danger: 3 },
    { name: 'Gas Pocket', desc: 'Flammable gas fills this chamber—no flames!', hazard: true },
    { name: 'Luminescent Cave', desc: 'Glowing fungi light the path ahead.', discovery: true },
  ],
  tundra: [
    { name: 'Blizzard', desc: 'A howling blizzard reduces visibility to nothing!', hazard: true, danger: 3 },
    { name: 'Thin Ice', desc: 'The ice groans ominously underfoot.', hazard: true, danger: 3 },
    { name: 'Frozen Corpse', desc: 'A perfectly preserved body lies in the ice.', discovery: true },
    { name: 'Aurora', desc: 'Magical aurora lights dance overhead.', magic: true },
  ],
  jungle: [
    { name: 'Flash Flood', desc: 'A wall of water rushes through the jungle!', hazard: true, danger: 3 },
    { name: 'Monsoon', desc: 'Torrential rain makes progress nearly impossible.', hazard: true },
    { name: 'Carnivorous Plants', desc: 'The vegetation here seems... hungry.', hazard: true, danger: 2 },
    { name: 'Ancient Temple', desc: 'Vine-covered ruins peek through the canopy.', discovery: true },
  ],
  ruins: [
    { name: 'Unstable Floor', desc: 'The floor gives way beneath you!', hazard: true, danger: 3 },
    { name: 'Magical Trap', desc: 'Ancient wards activate—magical energy crackles!', hazard: true, danger: 3, magic: true },
    { name: 'Hidden Chamber', desc: 'A secret passage opens in the wall.', discovery: true },
    { name: 'Time Loop', desc: 'Reality seems to skip and repeat.', magic: true },
  ],
};

// Discovery encounters
const DISCOVERY_ENCOUNTERS = {
  road: [
    { name: 'Dropped Pouch', desc: 'A coin pouch lies in the road.', loot: 'minor' },
    { name: 'Milestone', desc: 'An ancient milestone marks distances to forgotten places.', lore: true },
    { name: 'Roadside Shrine', desc: 'A small shrine offers blessings to travelers.', magic: true },
  ],
  plains: [
    { name: 'Burial Mound', desc: 'An ancient burial mound rises from the grass.', lore: true },
    { name: 'Standing Stones', desc: 'A ring of standing stones hums with power.', magic: true },
    { name: 'Abandoned Camp', desc: 'A recent campsite—still warm ashes.', clue: true },
  ],
  forest: [
    { name: 'Fairy Ring', desc: 'A perfect circle of mushrooms pulses with magic.', magic: true },
    { name: 'Hidden Cache', desc: 'Someone buried supplies here.', loot: 'minor' },
    { name: 'Ancient Tree', desc: 'A massive tree older than civilization itself.', lore: true },
    { name: 'Abandoned Cabin', desc: 'A decrepit cabin stands alone in the woods.', },
  ],
  mountain: [
    { name: 'Crystal Cave', desc: 'A cavern filled with glittering crystals.', loot: 'major' },
    { name: 'Dragon Bones', desc: 'The skeleton of an ancient dragon lies here.', lore: true },
    { name: 'Hidden Tomb', desc: 'A concealed entrance to an ancient tomb.', },
    { name: 'Hot Springs', desc: 'Natural hot springs offer rest and healing.', healing: true },
  ],
  swamp: [
    { name: 'Sunken Treasure', desc: 'Something glints beneath the murky water.', loot: 'major' },
    { name: 'Witch\'s Hut', desc: 'A crooked hut on chicken legs? No, just stilts.', },
    { name: 'Ghost Ship', desc: 'A rotting ship lies half-submerged.', lore: true },
  ],
  desert: [
    { name: 'Oasis', desc: 'A genuine oasis offers water and shade.', healing: true },
    { name: 'Buried Statue', desc: 'Sand reveals a colossal stone face.', lore: true },
    { name: 'Glass Field', desc: 'Lightning turned the sand to glass here.', magic: true },
    { name: 'Ancient Tomb', desc: 'A sealed tomb entrance in the cliff face.', },
  ],
  coastal: [
    { name: 'Treasure Chest', desc: 'A chest washed up on shore!', loot: 'major' },
    { name: 'Message in Bottle', desc: 'A bottle with a mysterious note inside.', clue: true },
    { name: 'Beached Whale', desc: 'A dead whale—valuable ambergris perhaps?', loot: 'minor' },
    { name: 'Sea Cave', desc: 'A cave only accessible at low tide.', },
  ],
  urban: [
    { name: 'Secret Door', desc: 'A hidden entrance in an alley wall.', },
    { name: 'Dropped Letter', desc: 'An important-looking sealed letter.', clue: true },
    { name: 'Street Performer', desc: 'A performer\'s act conceals coded messages.', clue: true },
    { name: 'Underground Entrance', desc: 'A grate leads to tunnels below.', },
  ],
  underground: [
    { name: 'Vein of Ore', desc: 'Precious metal gleams in the rock.', loot: 'major' },
    { name: 'Ancient Carvings', desc: 'Strange symbols cover the walls.', lore: true },
    { name: 'Mushroom Forest', desc: 'Giant fungi create an underground forest.', },
    { name: 'Underground Lake', desc: 'A vast subterranean lake stretches ahead.', },
  ],
  tundra: [
    { name: 'Mammoth Skeleton', desc: 'Ancient bones emerge from melting ice.', lore: true },
    { name: 'Ice Cave', desc: 'A cave of pure, blue ice.', },
    { name: 'Frozen Warrior', desc: 'An ancient warrior preserved in ice—with gear.', loot: 'major', lore: true },
  ],
  jungle: [
    { name: 'Lost City', desc: 'Overgrown ruins of a forgotten civilization.', lore: true },
    { name: 'Sacred Pool', desc: 'A pool with strange healing properties.', healing: true, magic: true },
    { name: 'Rare Flower', desc: 'An incredibly rare medicinal bloom.', loot: 'minor' },
  ],
  ruins: [
    { name: 'Sealed Vault', desc: 'A magically sealed chamber—treasures within?', loot: 'major', magic: true },
    { name: 'Library', desc: 'Ancient texts survive in this chamber.', lore: true },
    { name: 'Throne Room', desc: 'The seat of a long-dead ruler.', lore: true },
    { name: 'Artifact', desc: 'A powerful magical item rests here.', loot: 'legendary', magic: true },
  ],
};

// Quest hook templates
const QUEST_HOOKS = [
  { name: 'Missing Person', desc: 'Someone begs for help finding a lost family member.', type: 'rescue' },
  { name: 'Monster Bounty', desc: 'A notice offers gold for slaying a nearby threat.', type: 'hunt' },
  { name: 'Escort Mission', desc: 'A traveler needs protection on a dangerous route.', type: 'escort' },
  { name: 'Delivery', desc: 'An urgent package must reach its destination.', type: 'delivery' },
  { name: 'Revenge', desc: 'Someone seeks vengeance and needs capable allies.', type: 'combat' },
  { name: 'Treasure Map', desc: 'You find a weathered map marking buried treasure.', type: 'exploration' },
  { name: 'Political Intrigue', desc: 'A noble needs discrete assistance with a delicate matter.', type: 'intrigue' },
  { name: 'Curse Lifting', desc: 'Someone suffers under a terrible curse.', type: 'magic' },
  { name: 'War Effort', desc: 'A faction recruits capable fighters for the front lines.', type: 'military' },
  { name: 'Spy Mission', desc: 'Intelligence is needed on enemy movements.', type: 'stealth' },
];

// ══════════════════════════════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════════════════════════════

function newEmptyState() {
  return {
    version: 1,
    currentTerrain: 'road',
    encounterHistory: [],      // Past encounters
    lastEncounterTime: null,   // Prevent spam
    encounterChance: 0.3,      // Base chance per travel
    autoRoll: true,            // Auto-roll on travel
    pendingEncounter: null,    // Encounter waiting to be used
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
// CONTEXT GETTERS (from other extensions)
// ══════════════════════════════════════════════════════════════════════════════

function getTimeOfDay() {
  if (window.VTSS) {
    const vtss = window.VTSS.getState();
    if (vtss?.time) {
      const hour = vtss.time.hour;
      if (hour >= 5 && hour < 8) return 'dawn';
      if (hour >= 8 && hour < 17) return 'day';
      if (hour >= 17 && hour < 20) return 'dusk';
      return 'night';
    }
  }
  return 'day';
}

function getCurrentLocation() {
  if (window.VTSS) {
    const vtss = window.VTSS.getState();
    return vtss?.location?.specificLocation || null;
  }
  return null;
}

function getCurrentFactionTerritory() {
  // Try to get from VCT or other tracking
  // For now return null (could be enhanced)
  return null;
}

function getFactionRelations() {
  if (window.VDiplomacy) {
    return {
      getRelationship: window.VDiplomacy.getRelationship,
      getActiveWars: window.VDiplomacy.getActiveWars,
      getFactions: window.VDiplomacy.getFactions,
    };
  }
  return null;
}

function isAtWarWithFaction(factionId) {
  const diplomacy = getFactionRelations();
  if (!diplomacy) return false;
  
  const wars = diplomacy.getActiveWars();
  // Check if player's faction (assumed valdran_empire for now) is at war
  // This could be enhanced to track player's actual faction
  return wars?.some(w => w.attacker === factionId || w.defender === factionId);
}

// ══════════════════════════════════════════════════════════════════════════════
// ENCOUNTER GENERATION
// ══════════════════════════════════════════════════════════════════════════════

function calculateEncounterChance(st) {
  const terrain = TERRAIN_TYPES[st.currentTerrain] || TERRAIN_TYPES.road;
  const timeOfDay = getTimeOfDay();
  
  let chance = terrain.danger;
  
  // Night is more dangerous
  if (timeOfDay === 'night') chance *= 1.5;
  if (timeOfDay === 'dusk' || timeOfDay === 'dawn') chance *= 1.2;
  
  // Check for war (more patrols, refugees, etc)
  const diplomacy = getFactionRelations();
  if (diplomacy) {
    const wars = diplomacy.getActiveWars();
    if (wars && wars.length > 0) {
      chance *= 1.3; // More activity during wartime
    }
  }
  
  return Math.min(0.8, chance); // Cap at 80%
}

function selectEncounterType(st) {
  const timeOfDay = getTimeOfDay();
  const weights = { ...ENCOUNTER_TYPES };
  
  // Adjust weights based on time
  if (timeOfDay === 'night') {
    weights.combat.weight *= 1.5;
    weights.social.weight *= 0.5;
    weights.discovery.weight *= 0.7;
  }
  
  // During war, more combat and quest hooks
  const diplomacy = getFactionRelations();
  if (diplomacy) {
    const wars = diplomacy.getActiveWars();
    if (wars && wars.length > 0) {
      weights.combat.weight *= 1.3;
      weights.quest_hook.weight *= 1.5;
      weights.social.weight *= 1.2; // More refugees, patrols
    }
  }
  
  // Calculate total weight
  const total = Object.values(weights).reduce((sum, w) => sum + w.weight, 0);
  let roll = Math.random() * total;
  
  for (const [type, data] of Object.entries(weights)) {
    roll -= data.weight;
    if (roll <= 0) return type;
  }
  
  return 'social'; // Fallback
}

function generateEncounter(st, forceType = null) {
  const terrain = st.currentTerrain || 'road';
  const encounterType = forceType || selectEncounterType(st);
  const timeOfDay = getTimeOfDay();
  const location = getCurrentLocation();
  
  let encounter = null;
  
  switch (encounterType) {
    case 'combat':
      encounter = generateCombatEncounter(terrain);
      break;
    case 'social':
      encounter = generateSocialEncounter(terrain);
      break;
    case 'environmental':
      encounter = generateEnvironmentalEncounter(terrain);
      break;
    case 'discovery':
      encounter = generateDiscoveryEncounter(terrain);
      break;
    case 'quest_hook':
      encounter = generateQuestHook(terrain);
      break;
  }
  
  if (!encounter) return null;
  
  // Enhance with context
  encounter.type = encounterType;
  encounter.terrain = terrain;
  encounter.timeOfDay = timeOfDay;
  encounter.location = location;
  encounter.timestamp = Date.now();
  encounter.id = `enc_${Date.now()}`;
  
  // Add time-specific flavor
  if (timeOfDay === 'night' && !encounter.desc.toLowerCase().includes('night')) {
    encounter.desc = encounter.desc.replace(/\.$/, '') + ' in the darkness.';
  }
  
  return encounter;
}

function generateCombatEncounter(terrain) {
  const table = COMBAT_ENCOUNTERS[terrain] || COMBAT_ENCOUNTERS.road;
  const base = table[Math.floor(Math.random() * table.length)];
  
  // Check faction relations
  if (base.faction) {
    const diplomacy = getFactionRelations();
    if (diplomacy) {
      const relation = diplomacy.getRelationship('valdran_empire', base.faction);
      
      // If friendly with this faction, they might not be hostile
      if (relation > 30) {
        return {
          ...base,
          name: base.name + ' (Friendly)',
          enemies: base.enemies.replace('weapons drawn', 'but recognize a friend').replace('hostile', 'wary but not hostile'),
          hostile: false,
        };
      }
      
      // If at war, more dangerous
      if (relation < -50 || isAtWarWithFaction(base.faction)) {
        return {
          ...base,
          name: base.name + ' (War Party)',
          danger: (base.danger || 2) + 1,
          hostile: true,
          atWar: true,
        };
      }
    }
  }
  
  return { ...base, hostile: true };
}

function generateSocialEncounter(terrain) {
  const table = SOCIAL_ENCOUNTERS[terrain] || SOCIAL_ENCOUNTERS.road;
  const base = table[Math.floor(Math.random() * table.length)];
  
  // Check faction relations for faction-aligned NPCs
  if (base.faction) {
    const diplomacy = getFactionRelations();
    if (diplomacy) {
      const relation = diplomacy.getRelationship('valdran_empire', base.faction);
      
      if (relation < -30) {
        return {
          ...base,
          name: base.name + ' (Hostile)',
          desc: base.desc.replace(/\.$/, '') + ' They eye you with suspicion.',
          friendly: false,
        };
      }
      
      if (relation > 50) {
        return {
          ...base,
          name: base.name + ' (Friendly)',
          desc: base.desc.replace(/\.$/, '') + ' They greet you warmly.',
          friendly: true,
        };
      }
    }
  }
  
  return { ...base };
}

function generateEnvironmentalEncounter(terrain) {
  const table = ENVIRONMENTAL_ENCOUNTERS[terrain] || ENVIRONMENTAL_ENCOUNTERS.road;
  return { ...table[Math.floor(Math.random() * table.length)] };
}

function generateDiscoveryEncounter(terrain) {
  const table = DISCOVERY_ENCOUNTERS[terrain] || DISCOVERY_ENCOUNTERS.road;
  return { ...table[Math.floor(Math.random() * table.length)] };
}

function generateQuestHook(terrain) {
  const hook = QUEST_HOOKS[Math.floor(Math.random() * QUEST_HOOKS.length)];
  
  // During war, military quests more common
  const diplomacy = getFactionRelations();
  if (diplomacy) {
    const wars = diplomacy.getActiveWars();
    if (wars && wars.length > 0 && Math.random() < 0.4) {
      const war = wars[0];
      const attackerFaction = diplomacy.getFactions?.()?.find(f => f.id === war.attacker);
      const defenderFaction = diplomacy.getFactions?.()?.find(f => f.id === war.defender);
      
      return {
        name: 'War Recruitment',
        desc: `The war between ${attackerFaction?.shortName || 'factions'} and ${defenderFaction?.shortName || 'enemies'} demands capable fighters. Someone seeks to hire mercenaries.`,
        type: 'military',
        war: true,
      };
    }
  }
  
  return { ...hook };
}

// ══════════════════════════════════════════════════════════════════════════════
// ENCOUNTER OUTPUT FORMATTING
// ══════════════════════════════════════════════════════════════════════════════

function formatEncounterForDisplay(enc) {
  const typeInfo = ENCOUNTER_TYPES[enc.type] || ENCOUNTER_TYPES.social;
  const terrainInfo = TERRAIN_TYPES[enc.terrain] || TERRAIN_TYPES.road;
  
  let html = `
    <div class="venc_result">
      <div class="venc_result_header">
        <span class="venc_result_icon" style="color: ${typeInfo.color}">${typeInfo.icon}</span>
        <span class="venc_result_name">${enc.name}</span>
        ${enc.danger ? `<span class="venc_danger">⚠️ Danger: ${enc.danger}</span>` : ''}
      </div>
      <div class="venc_result_desc">${enc.desc || enc.enemies || ''}</div>
      <div class="venc_result_meta">
        <span>${terrainInfo.icon} ${terrainInfo.name}</span>
        <span>🕐 ${enc.timeOfDay}</span>
        ${enc.faction ? `<span>🏴 ${enc.faction}</span>` : ''}
        ${enc.hostile ? '<span class="venc_hostile">⚔️ Hostile</span>' : ''}
        ${enc.friendly ? '<span class="venc_friendly">😊 Friendly</span>' : ''}
        ${enc.trade ? '<span class="venc_trade">💰 Trade</span>' : ''}
        ${enc.magic ? '<span class="venc_magic">✨ Magic</span>' : ''}
        ${enc.loot ? `<span class="venc_loot">🎁 ${enc.loot}</span>` : ''}
      </div>
    </div>
  `;
  
  return html;
}

function formatEncounterForNarrative(enc) {
  // Format for injection into RP
  const typeInfo = ENCOUNTER_TYPES[enc.type] || ENCOUNTER_TYPES.social;
  let text = `[RANDOM ENCOUNTER - ${enc.name}]\n`;
  text += enc.desc || enc.enemies || '';
  
  if (enc.danger) text += `\n(Danger Level: ${enc.danger}/5)`;
  if (enc.hostile) text += '\n(Hostile)';
  if (enc.trade) text += '\n(Trade Available)';
  if (enc.magic) text += '\n(Magical)';
  
  return text;
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
  
  // Launcher button
  const launcher = document.createElement('button');
  launcher.id = 'venc_launcher';
  launcher.className = 'venc_launcher';
  launcher.innerHTML = '🎲';
  launcher.title = 'Random Encounters';
  launcher.addEventListener('click', togglePanel);
  document.body.appendChild(launcher);
  
  // Main panel
  const panel = document.createElement('div');
  panel.id = 'venc_root';
  panel.className = 'venc_panel venc_hidden';
  panel.innerHTML = `
    <div class="venc_header">
      <div class="venc_title">
        <span class="venc_title_icon">🎲</span>
        <span>Random Encounters</span>
      </div>
      <div class="venc_header_actions">
        <button class="venc_btn" id="venc_btn_roll" title="Roll Encounter">🎲 Roll</button>
        <button class="venc_btn" id="venc_btn_close" title="Close">✕</button>
      </div>
    </div>
    
    <div class="venc_body">
      <!-- Terrain Selector -->
      <div class="venc_section">
        <div class="venc_section_title">Current Terrain</div>
        <div class="venc_terrain_grid" id="venc_terrain_grid">
          <!-- Rendered by JS -->
        </div>
      </div>
      
      <!-- Context Info -->
      <div class="venc_section">
        <div class="venc_section_title">Context</div>
        <div class="venc_context" id="venc_context">
          <!-- Rendered by JS -->
        </div>
      </div>
      
      <!-- Encounter Result -->
      <div class="venc_section">
        <div class="venc_section_title">Current Encounter</div>
        <div class="venc_encounter_result" id="venc_encounter_result">
          <div class="venc_empty">Roll for an encounter or wait for travel</div>
        </div>
      </div>
      
      <!-- Quick Roll Buttons -->
      <div class="venc_section">
        <div class="venc_section_title">Quick Roll by Type</div>
        <div class="venc_quick_rolls">
          <button class="venc_type_btn" data-type="combat" style="--type-color: #f44336">⚔️ Combat</button>
          <button class="venc_type_btn" data-type="social" style="--type-color: #2196F3">👥 Social</button>
          <button class="venc_type_btn" data-type="environmental" style="--type-color: #FF9800">🌪️ Environment</button>
          <button class="venc_type_btn" data-type="discovery" style="--type-color: #9C27B0">✨ Discovery</button>
          <button class="venc_type_btn" data-type="quest_hook" style="--type-color: #4CAF50">❗ Quest Hook</button>
        </div>
      </div>
      
      <!-- History -->
      <div class="venc_section">
        <div class="venc_section_title">Recent Encounters</div>
        <div class="venc_history" id="venc_history">
          <div class="venc_empty">No encounters yet</div>
        </div>
      </div>
    </div>
    
    <div class="venc_footer">
      <label class="venc_toggle">
        <input type="checkbox" id="venc_auto_roll" checked>
        <span>Auto-roll on travel</span>
      </label>
      <div class="venc_chance" id="venc_chance">Chance: 30%</div>
    </div>
  `;
  
  document.body.appendChild(panel);
  UI.root = panel;
  
  setupEventListeners();
  render();
  
  console.log('[Encounters] UI mounted');
}

function setupEventListeners() {
  document.getElementById('venc_btn_close').addEventListener('click', togglePanel);
  document.getElementById('venc_btn_roll').addEventListener('click', () => rollEncounter());
  
  document.getElementById('venc_auto_roll').addEventListener('change', (e) => {
    const st = getChatState();
    st.autoRoll = e.target.checked;
    commitState(st);
  });
  
  // Type buttons
  document.querySelectorAll('.venc_type_btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      rollEncounter(type);
    });
  });
}

function togglePanel() {
  UI.panelOpen = !UI.panelOpen;
  UI.root.classList.toggle('venc_hidden', !UI.panelOpen);
  if (UI.panelOpen) render();
}

function render() {
  const st = getChatState();
  
  renderTerrainGrid(st);
  renderContext(st);
  renderEncounterResult(st);
  renderHistory(st);
  
  // Update chance display
  const chance = calculateEncounterChance(st);
  document.getElementById('venc_chance').textContent = `Chance: ${Math.round(chance * 100)}%`;
  
  // Update auto-roll checkbox
  document.getElementById('venc_auto_roll').checked = st.autoRoll !== false;
}

function renderTerrainGrid(st) {
  const grid = document.getElementById('venc_terrain_grid');
  let html = '';
  
  for (const [id, terrain] of Object.entries(TERRAIN_TYPES)) {
    const selected = st.currentTerrain === id;
    html += `
      <button class="venc_terrain_btn ${selected ? 'venc_terrain_selected' : ''}" data-terrain="${id}" title="${terrain.desc}">
        <span class="venc_terrain_icon">${terrain.icon}</span>
        <span class="venc_terrain_name">${terrain.name}</span>
        <span class="venc_terrain_danger">⚠️ ${Math.round(terrain.danger * 100)}%</span>
      </button>
    `;
  }
  
  grid.innerHTML = html;
  
  // Add click handlers
  grid.querySelectorAll('.venc_terrain_btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const terrain = btn.dataset.terrain;
      st.currentTerrain = terrain;
      await commitState(st);
      render();
    });
  });
}

function renderContext(st) {
  const ctx = document.getElementById('venc_context');
  const timeOfDay = getTimeOfDay();
  const location = getCurrentLocation();
  const diplomacy = getFactionRelations();
  const wars = diplomacy?.getActiveWars?.() || [];
  
  const timeIcons = { dawn: '🌅', day: '☀️', dusk: '🌆', night: '🌙' };
  
  ctx.innerHTML = `
    <div class="venc_context_row">
      <span class="venc_context_label">Time:</span>
      <span class="venc_context_value">${timeIcons[timeOfDay]} ${timeOfDay.charAt(0).toUpperCase() + timeOfDay.slice(1)}</span>
    </div>
    ${location ? `
      <div class="venc_context_row">
        <span class="venc_context_label">Location:</span>
        <span class="venc_context_value">📍 ${location}</span>
      </div>
    ` : ''}
    <div class="venc_context_row">
      <span class="venc_context_label">World State:</span>
      <span class="venc_context_value">${wars.length > 0 ? `⚔️ ${wars.length} active war(s)` : '☮️ Peace'}</span>
    </div>
  `;
}

function renderEncounterResult(st) {
  const container = document.getElementById('venc_encounter_result');
  
  if (st.pendingEncounter) {
    container.innerHTML = formatEncounterForDisplay(st.pendingEncounter);
    
    // Add action buttons
    container.innerHTML += `
      <div class="venc_result_actions">
        <button class="venc_btn venc_btn_use" id="venc_use_encounter">📋 Copy to Clipboard</button>
        <button class="venc_btn venc_btn_dismiss" id="venc_dismiss_encounter">✕ Dismiss</button>
      </div>
    `;
    
    document.getElementById('venc_use_encounter')?.addEventListener('click', () => {
      const text = formatEncounterForNarrative(st.pendingEncounter);
      navigator.clipboard.writeText(text);
      setStatus('Copied to clipboard!');
    });
    
    document.getElementById('venc_dismiss_encounter')?.addEventListener('click', async () => {
      st.pendingEncounter = null;
      await commitState(st);
      render();
    });
  } else {
    container.innerHTML = '<div class="venc_empty">Roll for an encounter or wait for travel</div>';
  }
}

function renderHistory(st) {
  const container = document.getElementById('venc_history');
  
  if (!st.encounterHistory || st.encounterHistory.length === 0) {
    container.innerHTML = '<div class="venc_empty">No encounters yet</div>';
    return;
  }
  
  let html = '';
  for (const enc of st.encounterHistory.slice(0, 10)) {
    const typeInfo = ENCOUNTER_TYPES[enc.type] || ENCOUNTER_TYPES.social;
    html += `
      <div class="venc_history_item">
        <span class="venc_history_icon" style="color: ${typeInfo.color}">${typeInfo.icon}</span>
        <span class="venc_history_name">${enc.name}</span>
        <span class="venc_history_terrain">${TERRAIN_TYPES[enc.terrain]?.icon || '❓'}</span>
      </div>
    `;
  }
  
  container.innerHTML = html;
}

function setStatus(msg) {
  // Could add a status bar, for now just console
  console.log('[Encounters]', msg);
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

async function rollEncounter(forceType = null) {
  const st = getChatState();
  
  const encounter = generateEncounter(st, forceType);
  if (!encounter) {
    setStatus('Failed to generate encounter');
    return null;
  }
  
  st.pendingEncounter = encounter;
  st.lastEncounterTime = Date.now();
  
  // Add to history
  if (!st.encounterHistory) st.encounterHistory = [];
  st.encounterHistory.unshift(encounter);
  if (st.encounterHistory.length > 50) st.encounterHistory = st.encounterHistory.slice(0, 50);
  
  await commitState(st);
  render();
  
  console.log('[Encounters] Generated:', encounter.name);
  return encounter;
}

async function checkForEncounter() {
  const st = getChatState();
  
  // Don't spam encounters
  if (st.lastEncounterTime && Date.now() - st.lastEncounterTime < 30000) {
    return null; // 30 second cooldown
  }
  
  const chance = calculateEncounterChance(st);
  if (Math.random() > chance) {
    return null; // No encounter this time
  }
  
  return await rollEncounter();
}

// ══════════════════════════════════════════════════════════════════════════════
// NARRATIVE PARSING
// ══════════════════════════════════════════════════════════════════════════════

function parseNarrativeForTravel(text) {
  const textLower = text.toLowerCase();
  
  // Check for travel indicators
  const travelPatterns = [
    /travel(?:s|ed|ing)?\s+(?:to|through|across|into)/i,
    /journey(?:s|ed|ing)?\s+(?:to|through|across)/i,
    /head(?:s|ed|ing)?\s+(?:to|toward|north|south|east|west)/i,
    /walk(?:s|ed|ing)?\s+(?:to|through|along|into)/i,
    /ride(?:s|d|ing)?\s+(?:to|toward|through)/i,
    /march(?:es|ed|ing)?\s+(?:to|toward|through)/i,
    /set(?:s|ting)?\s+(?:out|off|forth)/i,
    /continue(?:s|d)?\s+(?:on|along|through)/i,
    /arrive(?:s|d)?\s+(?:at|in)/i,
    /enter(?:s|ed|ing)?\s+(?:the|a)/i,
    /leave(?:s|d|ing)?\s+(?:the|town|city|village)/i,
  ];
  
  for (const pattern of travelPatterns) {
    if (pattern.test(text)) {
      return true;
    }
  }
  
  return false;
}

function parseNarrativeForTerrain(text) {
  const textLower = text.toLowerCase();
  
  const terrainKeywords = {
    forest: ['forest', 'woods', 'woodland', 'grove', 'trees', 'timber'],
    mountain: ['mountain', 'peak', 'cliff', 'highland', 'summit', 'ridge', 'pass'],
    swamp: ['swamp', 'marsh', 'bog', 'wetland', 'mire', 'fen'],
    desert: ['desert', 'sand', 'dune', 'wasteland', 'arid'],
    plains: ['plains', 'grassland', 'prairie', 'meadow', 'field', 'steppe'],
    coastal: ['coast', 'beach', 'shore', 'harbor', 'port', 'seaside', 'dock'],
    urban: ['city', 'town', 'village', 'street', 'market', 'tavern', 'inn', 'shop'],
    underground: ['cave', 'tunnel', 'dungeon', 'underground', 'cavern', 'crypt', 'mine'],
    road: ['road', 'path', 'trail', 'highway', 'route'],
    tundra: ['tundra', 'frozen', 'ice', 'arctic', 'snow', 'glacier'],
    jungle: ['jungle', 'rainforest', 'tropical'],
    ruins: ['ruins', 'ancient', 'temple', 'tomb', 'monument'],
  };
  
  for (const [terrain, keywords] of Object.entries(terrainKeywords)) {
    for (const keyword of keywords) {
      if (textLower.includes(keyword)) {
        return terrain;
      }
    }
  }
  
  return null;
}

// ══════════════════════════════════════════════════════════════════════════════
// GLOBAL API
// ══════════════════════════════════════════════════════════════════════════════

window.VEncounters = {
  open: () => { UI.panelOpen = true; UI.root.classList.remove('venc_hidden'); render(); },
  close: () => { UI.panelOpen = false; UI.root.classList.add('venc_hidden'); },
  toggle: togglePanel,
  
  getState: getChatState,
  
  roll: rollEncounter,
  rollCombat: () => rollEncounter('combat'),
  rollSocial: () => rollEncounter('social'),
  rollEnvironmental: () => rollEncounter('environmental'),
  rollDiscovery: () => rollEncounter('discovery'),
  rollQuestHook: () => rollEncounter('quest_hook'),
  
  check: checkForEncounter,
  
  setTerrain: async (terrain) => {
    const st = getChatState();
    if (TERRAIN_TYPES[terrain]) {
      st.currentTerrain = terrain;
      await commitState(st);
      render();
    }
  },
  
  getPending: () => getChatState().pendingEncounter,
  clearPending: async () => {
    const st = getChatState();
    st.pendingEncounter = null;
    await commitState(st);
    render();
  },
  
  getHistory: () => getChatState().encounterHistory || [],
  
  formatForNarrative: formatEncounterForNarrative,
  
  render,
};

// ══════════════════════════════════════════════════════════════════════════════
// JOURNEY INTEGRATION - Context-aware encounters!
// ══════════════════════════════════════════════════════════════════════════════

function subscribeToJourney() {
  if (!window.VJourney) {
    console.log('[Encounters] VJourney not available yet, retrying...');
    setTimeout(subscribeToJourney, 1000);
    return;
  }
  
  // Subscribe to terrain changes from narrative
  window.VJourney.subscribe(window.VJourney.EVENTS.TERRAIN_CHANGED, async (data) => {
    console.log('[Encounters] Terrain changed via Journey:', data.terrain);
    const st = getChatState();
    const terrainMap = {
      urban: 'urban', forest: 'forest', mountain: 'mountain',
      swamp: 'swamp', desert: 'desert', coastal: 'coastal',
      underground: 'underground', tundra: 'tundra', plains: 'plains',
      road: 'road', ruins: 'ruins',
    };
    if (data.terrain && terrainMap[data.terrain]) {
      st.currentTerrain = terrainMap[data.terrain];
      await commitState(st);
      if (UI.panelOpen) render();
    }
  });
  
  // Subscribe to location changes for encounter probability
  window.VJourney.subscribe(window.VJourney.EVENTS.LOCATION_CHANGED, async (data) => {
    const st = getChatState();
    if (data.type === 'building' || data.type === 'settlement') {
      st.encounterChance = 0.15;
    } else if (data.type === 'dungeon') {
      st.encounterChance = 0.5;
    } else if (data.type === 'wilderness') {
      st.encounterChance = 0.35;
    } else if (data.type === 'travel') {
      st.encounterChance = 0.4;
    }
    await commitState(st);
  });
  
  // Sync with current journey state
  const ctx = window.VJourney.getContext();
  if (ctx.terrain) {
    const st = getChatState();
    st.currentTerrain = ctx.terrain;
    commitState(st);
  }
  
  console.log('[Encounters] Subscribed to Journey Tracker!');
}

// ══════════════════════════════════════════════════════════════════════════════
// LIFECYCLE
// ══════════════════════════════════════════════════════════════════════════════

function registerEvents() {
  if (!eventSource || !event_types) return;
  
  eventSource.on(event_types.CHAT_CHANGED, () => {
    console.log('[Encounters] Chat changed');
    if (UI.panelOpen) render();
  });
  
  // Parse AI messages for travel (terrain now handled by Journey Tracker)
  eventSource.on(event_types.MESSAGE_RECEIVED, (msgId) => {
    setTimeout(async () => {
      try {
        const ctx = getContext?.() || SillyTavern?.getContext?.();
        if (!ctx?.chat) return;
        
        const msg = ctx.chat.find(m => m.mes_id === msgId) || ctx.chat[ctx.chat.length - 1];
        if (msg?.mes && !msg.is_user) {
          const st = getChatState();
          
          // Check for travel (potential encounter) - terrain is synced via Journey
          if (st.autoRoll !== false && parseNarrativeForTravel(msg.mes)) {
            const encounter = await checkForEncounter();
            if (encounter) {
              console.log('[Encounters] Travel triggered encounter:', encounter.name);
              await commitState(st);
              if (UI.panelOpen) render();
            }
          }
        }
      } catch (e) {
        console.error('[Encounters] Parse error:', e);
      }
    }, 300);
  });
  
  // Subscribe to Journey Tracker
  setTimeout(subscribeToJourney, 500);
}

(async function main() {
  console.log('[Encounters] Loading...');
  try {
    mountUI();
    registerEvents();
    console.log('[Encounters] Ready!');
  } catch (e) {
    console.error('[Encounters] Init failed:', e);
  }
})();
