/**
 * Valdris Weather System
 * ======================
 * Seasonal weather, dual moon phases, and gameplay effects.
 * 
 * Install folder:
 *   SillyTavern/public/scripts/extensions/third-party/valdris-weather/
 */

const EXT_NAME = 'valdris-weather';
const META_KEY = 'vwea_state_v1';

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
  console.error('[Weather] Failed to import extensions.js', e);
}

try {
  const scriptModule = await import('../../../../script.js');
  eventSource = scriptModule.eventSource;
  event_types = scriptModule.event_types;
  if (!saveSettingsDebounced) saveSettingsDebounced = scriptModule.saveSettingsDebounced;
} catch (e) {
  console.error('[Weather] Failed to import script.js', e);
}

// ══════════════════════════════════════════════════════════════════════════════
// VALDRIS CALENDAR CONSTANTS
// ══════════════════════════════════════════════════════════════════════════════

const MONTHS = [
  { id: 1, name: 'Frostmere', season: 'winter' },
  { id: 2, name: 'Iceveil', season: 'winter' },
  { id: 3, name: 'Thawbreak', season: 'spring' },
  { id: 4, name: 'Bloomrise', season: 'spring' },
  { id: 5, name: 'Sunsheight', season: 'summer' },
  { id: 6, name: 'Highflame', season: 'summer' },
  { id: 7, name: 'Goldfall', season: 'autumn' },
  { id: 8, name: 'Harvestend', season: 'autumn' },
  { id: 9, name: 'Misthollow', season: 'autumn' },
  { id: 10, name: 'Darkember', season: 'winter' },
];

const SEASONS = {
  winter: {
    name: 'Winter',
    icon: '❄️',
    baseTemp: { min: -10, max: 5 },
    precipitation: 0.4,
    stormChance: 0.15,
    dayLength: 'short',
    desc: 'Bitter cold grips the land',
  },
  spring: {
    name: 'Spring',
    icon: '🌸',
    baseTemp: { min: 5, max: 20 },
    precipitation: 0.5,
    stormChance: 0.2,
    dayLength: 'medium',
    desc: 'Life returns to the world',
  },
  summer: {
    name: 'Summer',
    icon: '☀️',
    baseTemp: { min: 18, max: 35 },
    precipitation: 0.25,
    stormChance: 0.1,
    dayLength: 'long',
    desc: 'The sun blazes overhead',
  },
  autumn: {
    name: 'Autumn',
    icon: '🍂',
    baseTemp: { min: 5, max: 18 },
    precipitation: 0.45,
    stormChance: 0.15,
    dayLength: 'medium',
    desc: 'Leaves turn and fall',
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// MOON PHASES
// ══════════════════════════════════════════════════════════════════════════════

// Solara - Golden moon, 32-day cycle (healing, light, undead weakness)
// Nyxara - Silver moon, 24-day cycle (shadow, divination, mystery)

const SOLARA_CYCLE = 32; // days
const NYXARA_CYCLE = 24; // days

const MOON_PHASES = {
  new: { name: 'New', icon: '🌑', fraction: 0 },
  waxing_crescent: { name: 'Waxing Crescent', icon: '🌒', fraction: 0.125 },
  first_quarter: { name: 'First Quarter', icon: '🌓', fraction: 0.25 },
  waxing_gibbous: { name: 'Waxing Gibbous', icon: '🌔', fraction: 0.375 },
  full: { name: 'Full', icon: '🌕', fraction: 0.5 },
  waning_gibbous: { name: 'Waning Gibbous', icon: '🌖', fraction: 0.625 },
  third_quarter: { name: 'Third Quarter', icon: '🌗', fraction: 0.75 },
  waning_crescent: { name: 'Waning Crescent', icon: '🌘', fraction: 0.875 },
};

const SOLARA_EFFECTS = {
  new: { healing: -0.2, undead: 0.3, light: -0.3, desc: 'Solara hides her face—healing weakened, undead empowered' },
  waxing_crescent: { healing: -0.1, undead: 0.15, light: -0.15, desc: 'A sliver of golden light returns' },
  first_quarter: { healing: 0, undead: 0, light: 0, desc: 'Solara shows her half-face' },
  waxing_gibbous: { healing: 0.1, undead: -0.1, light: 0.1, desc: 'Golden light grows stronger' },
  full: { healing: 0.3, undead: -0.3, light: 0.3, desc: 'Solara\'s radiance at its peak—healing empowered, undead weakened' },
  waning_gibbous: { healing: 0.15, undead: -0.15, light: 0.15, desc: 'The golden glow begins to fade' },
  third_quarter: { healing: 0, undead: 0, light: 0, desc: 'Half of Solara remains' },
  waning_crescent: { healing: -0.1, undead: 0.1, light: -0.1, desc: 'Solara retreats into darkness' },
};

const NYXARA_EFFECTS = {
  new: { shadow: -0.2, divination: -0.2, illusion: -0.2, desc: 'Nyxara sleeps—shadow magic weakened' },
  waxing_crescent: { shadow: -0.1, divination: 0, illusion: -0.1, desc: 'A silver sliver emerges' },
  first_quarter: { shadow: 0, divination: 0.1, illusion: 0, desc: 'Nyxara half-revealed' },
  waxing_gibbous: { shadow: 0.1, divination: 0.15, illusion: 0.1, desc: 'Silver light intensifies' },
  full: { shadow: 0.3, divination: 0.3, illusion: 0.3, desc: 'Nyxara\'s mysteries unveiled—divination and shadow magic empowered' },
  waning_gibbous: { shadow: 0.2, divination: 0.2, illusion: 0.15, desc: 'The veil begins to close' },
  third_quarter: { shadow: 0.1, divination: 0.1, illusion: 0, desc: 'Half in shadow, half revealed' },
  waning_crescent: { shadow: 0, divination: 0, illusion: -0.1, desc: 'Nyxara fades toward sleep' },
};

// Special celestial events
const CELESTIAL_EVENTS = {
  dual_full: {
    name: 'Conjunction of Light',
    icon: '✨',
    desc: 'Both moons full—wild magic surges, portals unstable, prophetic visions abound',
    effects: { wildMagic: 0.5, portals: -0.5, prophecy: 0.5 },
  },
  dual_new: {
    name: 'The Dark Convergence',
    icon: '🌑',
    desc: 'Both moons hidden—darkness reigns, undead at their strongest, light magic fails',
    effects: { darkness: 0.5, undead: 0.5, light: -0.5 },
  },
  eclipse_solara: {
    name: 'Eclipse of Solara',
    icon: '🌘',
    desc: 'Nyxara passes before Solara—healing disrupted, shadows dance in daylight',
    effects: { healing: -0.4, shadow: 0.4 },
    rarity: 0.02,
  },
  eclipse_nyxara: {
    name: 'Eclipse of Nyxara',
    icon: '🌒',
    desc: 'Solara outshines Nyxara—divination clouded, but undead flee',
    effects: { divination: -0.4, undead: -0.4 },
    rarity: 0.02,
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// WEATHER TYPES
// ══════════════════════════════════════════════════════════════════════════════

const WEATHER_TYPES = {
  clear: {
    name: 'Clear',
    icon: '☀️',
    desc: 'Clear skies',
    effects: { visibility: 1, travel: 1, ranged: 1, fire: 1 },
    nightIcon: '🌙',
    nightDesc: 'Clear night sky',
  },
  partly_cloudy: {
    name: 'Partly Cloudy',
    icon: '⛅',
    desc: 'Scattered clouds',
    effects: { visibility: 0.95, travel: 1, ranged: 1, fire: 1 },
    nightIcon: '☁️',
    nightDesc: 'Clouds drift across the moons',
  },
  cloudy: {
    name: 'Cloudy',
    icon: '☁️',
    desc: 'Overcast skies',
    effects: { visibility: 0.85, travel: 1, ranged: 0.95, fire: 1 },
    nightIcon: '☁️',
    nightDesc: 'Heavy clouds obscure the moons',
  },
  foggy: {
    name: 'Foggy',
    icon: '🌫️',
    desc: 'Thick fog blankets the land',
    effects: { visibility: 0.4, travel: 0.7, ranged: 0.5, fire: 1 },
    nightIcon: '🌫️',
    nightDesc: 'Impenetrable fog in the darkness',
  },
  light_rain: {
    name: 'Light Rain',
    icon: '🌦️',
    desc: 'Gentle rain falls',
    effects: { visibility: 0.8, travel: 0.9, ranged: 0.85, fire: 0.8 },
    nightIcon: '🌧️',
    nightDesc: 'Rain patters softly in the darkness',
  },
  rain: {
    name: 'Rain',
    icon: '🌧️',
    desc: 'Steady rainfall',
    effects: { visibility: 0.6, travel: 0.75, ranged: 0.7, fire: 0.5 },
    nightIcon: '🌧️',
    nightDesc: 'Heavy rain drums through the night',
  },
  heavy_rain: {
    name: 'Heavy Rain',
    icon: '🌧️',
    desc: 'Torrential downpour',
    effects: { visibility: 0.35, travel: 0.5, ranged: 0.4, fire: 0.2 },
    nightIcon: '🌧️',
    nightDesc: 'Sheets of rain pour from black skies',
  },
  thunderstorm: {
    name: 'Thunderstorm',
    icon: '⛈️',
    desc: 'Thunder and lightning',
    effects: { visibility: 0.3, travel: 0.4, ranged: 0.3, fire: 0.1, lightning: 0.3 },
    nightIcon: '⛈️',
    nightDesc: 'Lightning splits the darkness',
    hazard: true,
  },
  light_snow: {
    name: 'Light Snow',
    icon: '🌨️',
    desc: 'Gentle snowfall',
    effects: { visibility: 0.75, travel: 0.8, ranged: 0.85, fire: 0.9, cold: 0.2 },
    nightIcon: '🌨️',
    nightDesc: 'Snow drifts down in silence',
  },
  snow: {
    name: 'Snow',
    icon: '❄️',
    desc: 'Heavy snowfall',
    effects: { visibility: 0.5, travel: 0.6, ranged: 0.6, fire: 0.7, cold: 0.4 },
    nightIcon: '❄️',
    nightDesc: 'Snow blankets everything in white',
  },
  blizzard: {
    name: 'Blizzard',
    icon: '🌨️',
    desc: 'Blinding blizzard',
    effects: { visibility: 0.15, travel: 0.2, ranged: 0.2, fire: 0.3, cold: 0.7 },
    nightIcon: '🌨️',
    nightDesc: 'A howling wall of white',
    hazard: true,
  },
  hail: {
    name: 'Hail',
    icon: '🧊',
    desc: 'Hailstones fall',
    effects: { visibility: 0.6, travel: 0.5, ranged: 0.5, fire: 0.6 },
    nightIcon: '🧊',
    nightDesc: 'Ice pelts from above',
    hazard: true,
  },
  windy: {
    name: 'Windy',
    icon: '💨',
    desc: 'Strong winds',
    effects: { visibility: 0.9, travel: 0.85, ranged: 0.6, fire: 0.7 },
    nightIcon: '💨',
    nightDesc: 'Wind howls through the darkness',
  },
  sandstorm: {
    name: 'Sandstorm',
    icon: '🏜️',
    desc: 'Swirling sand',
    effects: { visibility: 0.2, travel: 0.3, ranged: 0.2, fire: 0.8 },
    nightIcon: '🏜️',
    nightDesc: 'Sand scours everything',
    hazard: true,
    terrains: ['desert'],
  },
  heatwave: {
    name: 'Heat Wave',
    icon: '🔥',
    desc: 'Oppressive heat',
    effects: { visibility: 0.85, travel: 0.7, ranged: 1, fire: 1.2, heat: 0.5 },
    nightIcon: '🌡️',
    nightDesc: 'Even the night brings no relief',
    hazard: true,
  },
};

// Weather chances by season
const SEASONAL_WEATHER = {
  winter: {
    clear: 0.15,
    partly_cloudy: 0.15,
    cloudy: 0.2,
    foggy: 0.1,
    light_snow: 0.15,
    snow: 0.15,
    blizzard: 0.05,
    windy: 0.05,
  },
  spring: {
    clear: 0.25,
    partly_cloudy: 0.2,
    cloudy: 0.15,
    foggy: 0.1,
    light_rain: 0.15,
    rain: 0.1,
    thunderstorm: 0.05,
  },
  summer: {
    clear: 0.4,
    partly_cloudy: 0.25,
    cloudy: 0.1,
    light_rain: 0.1,
    thunderstorm: 0.1,
    heatwave: 0.05,
  },
  autumn: {
    clear: 0.2,
    partly_cloudy: 0.2,
    cloudy: 0.2,
    foggy: 0.15,
    light_rain: 0.1,
    rain: 0.1,
    windy: 0.05,
  },
};

// Terrain modifiers for weather
const TERRAIN_WEATHER_MODS = {
  mountain: { snow: 1.5, blizzard: 1.5, windy: 1.3, clear: 0.8 },
  desert: { clear: 1.3, heatwave: 2, sandstorm: 1, rain: 0.1 },
  swamp: { foggy: 2, rain: 1.3, clear: 0.6 },
  coastal: { windy: 1.5, rain: 1.2, foggy: 1.3 },
  forest: { foggy: 1.2, rain: 1.1 },
  tundra: { snow: 2, blizzard: 2, cold: 1.5, clear: 0.7 },
  plains: { windy: 1.2, clear: 1.1 },
};

// ══════════════════════════════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════════════════════════════

function newEmptyState() {
  return {
    version: 1,
    currentWeather: 'clear',
    currentTerrain: 'plains',
    temperature: 15,
    windSpeed: 10,  // km/h
    humidity: 50,   // percent
    lastUpdateDay: 0,
    lastUpdateHour: 0,
    weatherHistory: [],
    forecast: [],   // Next 3 days
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
// TIME HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function getValdrisTime() {
  if (window.VTSS) {
    const vtss = window.VTSS.getState();
    if (vtss?.time) {
      return {
        year: vtss.time.year,
        month: vtss.time.month,
        day: vtss.time.day,
        hour: vtss.time.hour,
        totalDays: (vtss.time.year * 360) + ((vtss.time.month - 1) * 36) + vtss.time.day,
      };
    }
  }
  // Fallback
  const now = Date.now();
  const days = Math.floor(now / 86400000);
  return {
    year: Math.floor(days / 360),
    month: (Math.floor(days / 36) % 10) + 1,
    day: (days % 36) + 1,
    hour: Math.floor((now % 86400000) / 3600000),
    totalDays: days,
  };
}

function getSeason(month) {
  const monthData = MONTHS[month - 1];
  return monthData ? monthData.season : 'summer';
}

function getMonthName(month) {
  const monthData = MONTHS[month - 1];
  return monthData ? monthData.name : 'Unknown';
}

function isNight(hour) {
  return hour < 6 || hour >= 20;
}

// ══════════════════════════════════════════════════════════════════════════════
// MOON CALCULATIONS
// ══════════════════════════════════════════════════════════════════════════════

function getMoonPhase(totalDays, cycle) {
  const dayInCycle = totalDays % cycle;
  const fraction = dayInCycle / cycle;
  
  if (fraction < 0.0625) return 'new';
  if (fraction < 0.1875) return 'waxing_crescent';
  if (fraction < 0.3125) return 'first_quarter';
  if (fraction < 0.4375) return 'waxing_gibbous';
  if (fraction < 0.5625) return 'full';
  if (fraction < 0.6875) return 'waning_gibbous';
  if (fraction < 0.8125) return 'third_quarter';
  if (fraction < 0.9375) return 'waning_crescent';
  return 'new';
}

function getSolaraPhase(totalDays) {
  return getMoonPhase(totalDays, SOLARA_CYCLE);
}

function getNyxaraPhase(totalDays) {
  return getMoonPhase(totalDays, NYXARA_CYCLE);
}

function getMoonData(totalDays) {
  const solaraPhase = getSolaraPhase(totalDays);
  const nyxaraPhase = getNyxaraPhase(totalDays);
  
  const solara = {
    phase: solaraPhase,
    ...MOON_PHASES[solaraPhase],
    effects: SOLARA_EFFECTS[solaraPhase],
    color: 'golden',
  };
  
  const nyxara = {
    phase: nyxaraPhase,
    ...MOON_PHASES[nyxaraPhase],
    effects: NYXARA_EFFECTS[nyxaraPhase],
    color: 'silver',
  };
  
  // Check for special events
  let celestialEvent = null;
  if (solaraPhase === 'full' && nyxaraPhase === 'full') {
    celestialEvent = CELESTIAL_EVENTS.dual_full;
  } else if (solaraPhase === 'new' && nyxaraPhase === 'new') {
    celestialEvent = CELESTIAL_EVENTS.dual_new;
  } else if (Math.random() < 0.02) {
    // Rare eclipse chance
    if (Math.abs(MOON_PHASES[solaraPhase].fraction - MOON_PHASES[nyxaraPhase].fraction) < 0.1) {
      celestialEvent = Math.random() < 0.5 ? CELESTIAL_EVENTS.eclipse_solara : CELESTIAL_EVENTS.eclipse_nyxara;
    }
  }
  
  return { solara, nyxara, celestialEvent };
}

function getDaysUntilPhase(totalDays, cycle, targetPhase) {
  const phaseStart = MOON_PHASES[targetPhase].fraction;
  const currentFraction = (totalDays % cycle) / cycle;
  let daysUntil = Math.floor((phaseStart - currentFraction) * cycle);
  if (daysUntil <= 0) daysUntil += cycle;
  return daysUntil;
}

// ══════════════════════════════════════════════════════════════════════════════
// WEATHER GENERATION
// ══════════════════════════════════════════════════════════════════════════════

function generateWeather(season, terrain) {
  const baseWeather = SEASONAL_WEATHER[season] || SEASONAL_WEATHER.summer;
  const terrainMods = TERRAIN_WEATHER_MODS[terrain] || {};
  
  // Apply terrain modifiers
  const adjusted = {};
  let total = 0;
  
  for (const [type, chance] of Object.entries(baseWeather)) {
    const mod = terrainMods[type] || 1;
    adjusted[type] = chance * mod;
    total += adjusted[type];
  }
  
  // Normalize and select
  let roll = Math.random() * total;
  for (const [type, chance] of Object.entries(adjusted)) {
    roll -= chance;
    if (roll <= 0) {
      return type;
    }
  }
  
  return 'clear';
}

function generateTemperature(season, weather, hour) {
  const seasonData = SEASONS[season];
  const baseMin = seasonData.baseTemp.min;
  const baseMax = seasonData.baseTemp.max;
  
  // Time of day affects temperature
  let timeMod = 0;
  if (hour >= 12 && hour <= 15) {
    timeMod = 5; // Warmest in early afternoon
  } else if (hour >= 3 && hour <= 6) {
    timeMod = -5; // Coldest before dawn
  } else if (hour >= 20 || hour <= 3) {
    timeMod = -3;
  }
  
  // Weather affects temperature
  const weatherData = WEATHER_TYPES[weather];
  let weatherMod = 0;
  if (weatherData.effects.cold) weatherMod -= 5 * weatherData.effects.cold;
  if (weatherData.effects.heat) weatherMod += 10 * weatherData.effects.heat;
  if (weather.includes('rain')) weatherMod -= 3;
  if (weather.includes('cloud')) weatherMod -= 2;
  
  const baseTemp = baseMin + Math.random() * (baseMax - baseMin);
  return Math.round(baseTemp + timeMod + weatherMod);
}

function generateWind(weather) {
  const weatherData = WEATHER_TYPES[weather];
  let base = 5 + Math.random() * 15;
  
  if (weather === 'windy') base = 30 + Math.random() * 20;
  if (weather === 'thunderstorm') base = 25 + Math.random() * 25;
  if (weather === 'blizzard') base = 40 + Math.random() * 30;
  if (weather === 'sandstorm') base = 35 + Math.random() * 25;
  
  return Math.round(base);
}

function generateHumidity(weather, season) {
  let base = 50;
  
  if (weather.includes('rain') || weather === 'thunderstorm') base = 80 + Math.random() * 20;
  else if (weather.includes('snow') || weather === 'blizzard') base = 70 + Math.random() * 15;
  else if (weather === 'foggy') base = 90 + Math.random() * 10;
  else if (weather === 'clear' && season === 'summer') base = 30 + Math.random() * 20;
  else if (weather === 'heatwave') base = 20 + Math.random() * 15;
  else base = 40 + Math.random() * 30;
  
  return Math.round(Math.min(100, Math.max(0, base)));
}

function updateWeather(st) {
  const time = getValdrisTime();
  const season = getSeason(time.month);
  
  // Update weather every 4 hours or on new day
  const hoursSinceUpdate = (time.totalDays - st.lastUpdateDay) * 24 + (time.hour - st.lastUpdateHour);
  if (hoursSinceUpdate < 4 && time.totalDays === st.lastUpdateDay) {
    return;
  }
  
  // Chance to change weather (higher if more time passed)
  const changeChance = Math.min(0.8, 0.3 + (hoursSinceUpdate * 0.05));
  
  if (Math.random() < changeChance || !st.currentWeather) {
    // Log old weather
    if (st.currentWeather) {
      st.weatherHistory.unshift({
        weather: st.currentWeather,
        temp: st.temperature,
        day: st.lastUpdateDay,
        hour: st.lastUpdateHour,
      });
      if (st.weatherHistory.length > 20) st.weatherHistory = st.weatherHistory.slice(0, 20);
    }
    
    // Generate new weather
    st.currentWeather = generateWeather(season, st.currentTerrain);
  }
  
  // Always update temperature (changes through day)
  st.temperature = generateTemperature(season, st.currentWeather, time.hour);
  st.windSpeed = generateWind(st.currentWeather);
  st.humidity = generateHumidity(st.currentWeather, season);
  
  st.lastUpdateDay = time.totalDays;
  st.lastUpdateHour = time.hour;
  
  // Generate forecast
  st.forecast = [];
  for (let d = 1; d <= 3; d++) {
    const futureMonth = MONTHS[Math.floor(((time.totalDays + d) % 360) / 36)];
    const futureSeason = futureMonth ? futureMonth.season : season;
    st.forecast.push({
      day: d,
      weather: generateWeather(futureSeason, st.currentTerrain),
      season: futureSeason,
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// EFFECTS CALCULATION
// ══════════════════════════════════════════════════════════════════════════════

function getCurrentEffects(st) {
  const time = getValdrisTime();
  const weatherData = WEATHER_TYPES[st.currentWeather] || WEATHER_TYPES.clear;
  const moonData = getMoonData(time.totalDays);
  
  const effects = {
    // Weather effects
    visibility: weatherData.effects.visibility || 1,
    travel: weatherData.effects.travel || 1,
    ranged: weatherData.effects.ranged || 1,
    fire: weatherData.effects.fire || 1,
    
    // Moon effects (Solara)
    healing: moonData.solara.effects.healing || 0,
    undead: moonData.solara.effects.undead || 0,
    light: moonData.solara.effects.light || 0,
    
    // Moon effects (Nyxara)
    shadow: moonData.nyxara.effects.shadow || 0,
    divination: moonData.nyxara.effects.divination || 0,
    illusion: moonData.nyxara.effects.illusion || 0,
  };
  
  // Apply celestial event modifiers
  if (moonData.celestialEvent) {
    for (const [key, value] of Object.entries(moonData.celestialEvent.effects)) {
      if (effects[key] !== undefined) {
        effects[key] += value;
      } else {
        effects[key] = value;
      }
    }
  }
  
  // Night penalties
  if (isNight(time.hour)) {
    effects.visibility *= 0.5;
  }
  
  return effects;
}

function formatEffectForDisplay(value, isMultiplier = true) {
  if (isMultiplier) {
    const pct = Math.round((value - 1) * 100);
    if (pct === 0) return '—';
    return pct > 0 ? `+${pct}%` : `${pct}%`;
  } else {
    const pct = Math.round(value * 100);
    if (pct === 0) return '—';
    return pct > 0 ? `+${pct}%` : `${pct}%`;
  }
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
  launcher.id = 'vwea_launcher';
  launcher.className = 'vwea_launcher';
  launcher.innerHTML = '🌤️';
  launcher.title = 'Weather & Moons';
  launcher.addEventListener('click', togglePanel);
  document.body.appendChild(launcher);
  
  // Main panel
  const panel = document.createElement('div');
  panel.id = 'vwea_root';
  panel.className = 'vwea_panel vwea_hidden';
  panel.innerHTML = `
    <div class="vwea_header">
      <div class="vwea_title">
        <span class="vwea_title_icon">🌤️</span>
        <span>Weather & Moons</span>
      </div>
      <div class="vwea_header_actions">
        <button class="vwea_btn" id="vwea_btn_refresh" title="Refresh">🔄</button>
        <button class="vwea_btn" id="vwea_btn_close" title="Close">✕</button>
      </div>
    </div>
    
    <div class="vwea_body">
      <!-- Current Weather -->
      <div class="vwea_current" id="vwea_current">
        <!-- Rendered by JS -->
      </div>
      
      <!-- Moons -->
      <div class="vwea_moons" id="vwea_moons">
        <!-- Rendered by JS -->
      </div>
      
      <!-- Effects -->
      <div class="vwea_section">
        <div class="vwea_section_title">Current Effects</div>
        <div class="vwea_effects" id="vwea_effects">
          <!-- Rendered by JS -->
        </div>
      </div>
      
      <!-- Forecast -->
      <div class="vwea_section">
        <div class="vwea_section_title">3-Day Forecast</div>
        <div class="vwea_forecast" id="vwea_forecast">
          <!-- Rendered by JS -->
        </div>
      </div>
      
      <!-- Terrain -->
      <div class="vwea_section">
        <div class="vwea_section_title">Current Terrain</div>
        <div class="vwea_terrain_select">
          <select id="vwea_terrain">
            <option value="plains">🌾 Plains</option>
            <option value="forest">🌲 Forest</option>
            <option value="mountain">⛰️ Mountain</option>
            <option value="swamp">🐊 Swamp</option>
            <option value="desert">🏜️ Desert</option>
            <option value="coastal">🏖️ Coastal</option>
            <option value="tundra">❄️ Tundra</option>
            <option value="underground">🕳️ Underground</option>
          </select>
        </div>
      </div>
    </div>
    
    <div class="vwea_footer">
      <button class="vwea_btn vwea_btn_copy" id="vwea_copy">📋 Copy Weather Description</button>
    </div>
  `;
  
  document.body.appendChild(panel);
  UI.root = panel;
  
  setupEventListeners();
  render();
  
  console.log('[Weather] UI mounted');
}

function setupEventListeners() {
  document.getElementById('vwea_btn_close').addEventListener('click', togglePanel);
  document.getElementById('vwea_btn_refresh').addEventListener('click', forceRefresh);
  document.getElementById('vwea_copy').addEventListener('click', copyWeatherDescription);
  
  document.getElementById('vwea_terrain').addEventListener('change', async (e) => {
    const st = getChatState();
    st.currentTerrain = e.target.value;
    updateWeather(st);
    await commitState(st);
    render();
  });
}

function togglePanel() {
  UI.panelOpen = !UI.panelOpen;
  UI.root.classList.toggle('vwea_hidden', !UI.panelOpen);
  if (UI.panelOpen) {
    const st = getChatState();
    updateWeather(st);
    commitState(st);
    render();
  }
}

async function forceRefresh() {
  const st = getChatState();
  st.lastUpdateDay = 0;
  st.lastUpdateHour = 0;
  updateWeather(st);
  await commitState(st);
  render();
}

function render() {
  const st = getChatState();
  const time = getValdrisTime();
  
  renderCurrentWeather(st, time);
  renderMoons(time);
  renderEffects(st);
  renderForecast(st);
  
  // Update terrain select
  document.getElementById('vwea_terrain').value = st.currentTerrain || 'plains';
}

function renderCurrentWeather(st, time) {
  const container = document.getElementById('vwea_current');
  const weather = WEATHER_TYPES[st.currentWeather] || WEATHER_TYPES.clear;
  const season = SEASONS[getSeason(time.month)];
  const night = isNight(time.hour);
  
  const icon = night ? weather.nightIcon : weather.icon;
  const desc = night ? weather.nightDesc : weather.desc;
  
  container.innerHTML = `
    <div class="vwea_weather_main">
      <div class="vwea_weather_icon">${icon}</div>
      <div class="vwea_weather_info">
        <div class="vwea_weather_name">${weather.name}</div>
        <div class="vwea_weather_desc">${desc}</div>
        <div class="vwea_weather_temp">${st.temperature}°C</div>
      </div>
    </div>
    <div class="vwea_weather_details">
      <div class="vwea_detail">
        <span class="vwea_detail_icon">💨</span>
        <span class="vwea_detail_value">${st.windSpeed} km/h</span>
      </div>
      <div class="vwea_detail">
        <span class="vwea_detail_icon">💧</span>
        <span class="vwea_detail_value">${st.humidity}%</span>
      </div>
      <div class="vwea_detail">
        <span class="vwea_detail_icon">${season.icon}</span>
        <span class="vwea_detail_value">${season.name}</span>
      </div>
      <div class="vwea_detail">
        <span class="vwea_detail_icon">📅</span>
        <span class="vwea_detail_value">${getMonthName(time.month)} ${time.day}</span>
      </div>
    </div>
    ${weather.hazard ? '<div class="vwea_hazard">⚠️ Hazardous Conditions</div>' : ''}
  `;
}

function renderMoons(time) {
  const container = document.getElementById('vwea_moons');
  const moonData = getMoonData(time.totalDays);
  
  const solaraNext = getDaysUntilPhase(time.totalDays, SOLARA_CYCLE, 'full');
  const nyxaraNext = getDaysUntilPhase(time.totalDays, NYXARA_CYCLE, 'full');
  
  let eventHtml = '';
  if (moonData.celestialEvent) {
    eventHtml = `
      <div class="vwea_celestial_event">
        <span class="vwea_event_icon">${moonData.celestialEvent.icon}</span>
        <span class="vwea_event_name">${moonData.celestialEvent.name}</span>
        <span class="vwea_event_desc">${moonData.celestialEvent.desc}</span>
      </div>
    `;
  }
  
  container.innerHTML = `
    <div class="vwea_moons_row">
      <div class="vwea_moon vwea_solara">
        <div class="vwea_moon_icon">${moonData.solara.icon}</div>
        <div class="vwea_moon_name">Solara</div>
        <div class="vwea_moon_phase">${moonData.solara.name}</div>
        <div class="vwea_moon_next">Full in ${solaraNext} days</div>
        <div class="vwea_moon_desc">${moonData.solara.effects.desc}</div>
      </div>
      <div class="vwea_moon vwea_nyxara">
        <div class="vwea_moon_icon">${moonData.nyxara.icon}</div>
        <div class="vwea_moon_name">Nyxara</div>
        <div class="vwea_moon_phase">${moonData.nyxara.name}</div>
        <div class="vwea_moon_next">Full in ${nyxaraNext} days</div>
        <div class="vwea_moon_desc">${moonData.nyxara.effects.desc}</div>
      </div>
    </div>
    ${eventHtml}
  `;
}

function renderEffects(st) {
  const container = document.getElementById('vwea_effects');
  const effects = getCurrentEffects(st);
  
  const effectItems = [
    { key: 'visibility', name: 'Visibility', icon: '👁️', mult: true },
    { key: 'travel', name: 'Travel Speed', icon: '🚶', mult: true },
    { key: 'ranged', name: 'Ranged Combat', icon: '🏹', mult: true },
    { key: 'fire', name: 'Fire Magic', icon: '🔥', mult: true },
    { key: 'healing', name: 'Healing', icon: '💚', mult: false },
    { key: 'undead', name: 'Undead Power', icon: '💀', mult: false },
    { key: 'shadow', name: 'Shadow Magic', icon: '🌑', mult: false },
    { key: 'divination', name: 'Divination', icon: '🔮', mult: false },
  ];
  
  let html = '<div class="vwea_effects_grid">';
  for (const item of effectItems) {
    const value = effects[item.key];
    if (value === undefined) continue;
    
    const formatted = formatEffectForDisplay(value, item.mult);
    if (formatted === '—' && item.mult) continue;
    
    const colorClass = item.mult ? 
      (value > 1 ? 'vwea_effect_pos' : value < 1 ? 'vwea_effect_neg' : '') :
      (value > 0 ? 'vwea_effect_pos' : value < 0 ? 'vwea_effect_neg' : '');
    
    html += `
      <div class="vwea_effect_item ${colorClass}">
        <span class="vwea_effect_icon">${item.icon}</span>
        <span class="vwea_effect_name">${item.name}</span>
        <span class="vwea_effect_value">${formatted}</span>
      </div>
    `;
  }
  html += '</div>';
  
  container.innerHTML = html;
}

function renderForecast(st) {
  const container = document.getElementById('vwea_forecast');
  
  let html = '<div class="vwea_forecast_row">';
  for (const day of st.forecast) {
    const weather = WEATHER_TYPES[day.weather] || WEATHER_TYPES.clear;
    html += `
      <div class="vwea_forecast_day">
        <div class="vwea_forecast_label">Day +${day.day}</div>
        <div class="vwea_forecast_icon">${weather.icon}</div>
        <div class="vwea_forecast_name">${weather.name}</div>
      </div>
    `;
  }
  html += '</div>';
  
  container.innerHTML = html;
}

function copyWeatherDescription() {
  const st = getChatState();
  const time = getValdrisTime();
  const weather = WEATHER_TYPES[st.currentWeather] || WEATHER_TYPES.clear;
  const season = SEASONS[getSeason(time.month)];
  const moonData = getMoonData(time.totalDays);
  const night = isNight(time.hour);
  
  let text = `[WEATHER - ${getMonthName(time.month)} ${time.day}, ${night ? 'Night' : 'Day'}]\n`;
  text += `${weather.name}: ${night ? weather.nightDesc : weather.desc}\n`;
  text += `Temperature: ${st.temperature}°C | Wind: ${st.windSpeed} km/h | Humidity: ${st.humidity}%\n`;
  text += `Season: ${season.name}\n\n`;
  text += `[MOONS]\n`;
  text += `Solara (Golden): ${moonData.solara.name} - ${moonData.solara.effects.desc}\n`;
  text += `Nyxara (Silver): ${moonData.nyxara.name} - ${moonData.nyxara.effects.desc}\n`;
  
  if (moonData.celestialEvent) {
    text += `\n⚡ ${moonData.celestialEvent.name}: ${moonData.celestialEvent.desc}`;
  }
  
  navigator.clipboard.writeText(text);
  console.log('[Weather] Copied to clipboard');
}

// ══════════════════════════════════════════════════════════════════════════════
// GLOBAL API
// ══════════════════════════════════════════════════════════════════════════════

window.VWeather = {
  open: () => { UI.panelOpen = true; UI.root.classList.remove('vwea_hidden'); render(); },
  close: () => { UI.panelOpen = false; UI.root.classList.add('vwea_hidden'); },
  toggle: togglePanel,
  
  getState: getChatState,
  
  getWeather: () => {
    const st = getChatState();
    return WEATHER_TYPES[st.currentWeather] || WEATHER_TYPES.clear;
  },
  
  getTemperature: () => getChatState().temperature,
  
  getMoons: () => {
    const time = getValdrisTime();
    return getMoonData(time.totalDays);
  },
  
  getEffects: () => {
    const st = getChatState();
    return getCurrentEffects(st);
  },
  
  getSeason: () => {
    const time = getValdrisTime();
    return SEASONS[getSeason(time.month)];
  },
  
  setTerrain: async (terrain) => {
    const st = getChatState();
    st.currentTerrain = terrain;
    updateWeather(st);
    await commitState(st);
    render();
  },
  
  forceWeather: async (weatherType) => {
    const st = getChatState();
    if (WEATHER_TYPES[weatherType]) {
      st.currentWeather = weatherType;
      await commitState(st);
      render();
    }
  },
  
  refresh: forceRefresh,
  
  getDescription: () => {
    const st = getChatState();
    const time = getValdrisTime();
    const weather = WEATHER_TYPES[st.currentWeather] || WEATHER_TYPES.clear;
    const night = isNight(time.hour);
    return night ? weather.nightDesc : weather.desc;
  },
  
  render,
};

// ══════════════════════════════════════════════════════════════════════════════
// JOURNEY INTEGRATION - Subscribe to narrative context!
// ══════════════════════════════════════════════════════════════════════════════

function subscribeToJourney() {
  if (!window.VJourney) {
    console.log('[Weather] VJourney not available yet, retrying...');
    setTimeout(subscribeToJourney, 1000);
    return;
  }
  
  // Subscribe to terrain changes from narrative
  window.VJourney.subscribe(window.VJourney.EVENTS.TERRAIN_CHANGED, async (data) => {
    console.log('[Weather] Terrain changed via Journey:', data.terrain);
    const st = getChatState();
    if (data.terrain && st.currentTerrain !== data.terrain) {
      st.currentTerrain = data.terrain;
      updateWeather(st);
      await commitState(st);
      if (UI.panelOpen) render();
    }
  });
  
  // Subscribe to weather mentions in narrative
  window.VJourney.subscribe(window.VJourney.EVENTS.WEATHER_CHANGED, async (data) => {
    console.log('[Weather] Weather detected in narrative:', data.weather);
    const st = getChatState();
    // Map journey weather detection to our weather types
    const weatherMap = {
      clear: 'clear',
      cloudy: 'cloudy',
      rain: 'rain',
      storm: 'thunderstorm',
      snow: 'snow',
      fog: 'foggy',
      wind: 'windy',
      hot: 'heatwave',
    };
    if (data.weather && weatherMap[data.weather]) {
      st.currentWeather = weatherMap[data.weather];
      await commitState(st);
      if (UI.panelOpen) render();
    }
  });
  
  // Sync with current journey state on load
  const ctx = window.VJourney.getContext();
  if (ctx.terrain) {
    const st = getChatState();
    st.currentTerrain = ctx.terrain;
    commitState(st);
  }
  
  console.log('[Weather] Subscribed to Journey Tracker!');
}

// ══════════════════════════════════════════════════════════════════════════════
// LIFECYCLE
// ══════════════════════════════════════════════════════════════════════════════

function registerEvents() {
  if (!eventSource || !event_types) return;
  
  eventSource.on(event_types.CHAT_CHANGED, () => {
    console.log('[Weather] Chat changed');
    if (UI.panelOpen) render();
  });
  
  eventSource.on(event_types.MESSAGE_RECEIVED, () => {
    setTimeout(async () => {
      try {
        const st = getChatState();
        updateWeather(st);
        await commitState(st);
        if (UI.panelOpen) render();
      } catch (e) {
        console.error('[Weather] Update error:', e);
      }
    }, 300);
  });
  
  // Subscribe to Journey Tracker
  setTimeout(subscribeToJourney, 500);
}

(async function main() {
  console.log('[Weather] Loading...');
  try {
    mountUI();
    registerEvents();
    console.log('[Weather] Ready!');
  } catch (e) {
    console.error('[Weather] Init failed:', e);
  }
})();
