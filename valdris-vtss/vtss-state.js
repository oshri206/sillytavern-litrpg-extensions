/**
 * VALDRIS TEMPORAL-SPATIAL STATE SYSTEM - State Structure
 * ========================================================
 * Central state object that tracks everything about the current
 * game world state. Other extensions subscribe to changes.
 */

import ValdrisCalendar from './vtss-calendar.js';

/**
 * Create a fresh default state
 */
export function createDefaultState() {
    return {
        // ═══════════════════════════════════════════════════════════════
        // TEMPORAL DATA
        // ═══════════════════════════════════════════════════════════════
        time: {
            // Core date/time
            year: 2847,
            month: 1,              // 1-10 (0 = Vexdays period)
            day: 1,
            hour: 12,              // 0-23 
            minute: 0,
            era: "AV",             // After Vex
            
            // Derived (auto-calculated)
            season: "winter",
            timeOfDay: "midday",
            octaveDay: null,       // Object from calendar
            octaveDayIndex: 0,     // 0-7
            moonSolara: null,      // Phase object
            moonNyxara: null,      // Phase object
            moonAlignment: null,   // Special alignment if any
            isHoliday: false,
            holidayName: null,
            
            // Session tracking
            sessionStartDate: null,   // When this campaign started
            lastKnownDate: null,      // Last confirmed date (numeric)
            totalDaysPassed: 0,       // Days since session start
            
            // Display cache
            formattedDate: "",
            formattedTime: ""
        },

        // ═══════════════════════════════════════════════════════════════
        // SPATIAL DATA
        // ═══════════════════════════════════════════════════════════════
        location: {
            // Macro scale
            continent: "Aethermain",      // Main continent name
            nation: null,                  // Current nation
            nationAlignment: null,         // Nation's political stance
            region: null,                  // Province/territory
            
            // Settlement scale
            settlement: null,              // City/town/village name
            settlementType: null,          // capital/city/town/village/outpost/camp/none
            settlementPopulation: null,    // Rough population
            district: null,                // City district if applicable
            
            // Micro scale
            specificLocation: null,        // Building, room, clearing, etc.
            locationType: "outdoor",       // indoor/outdoor/underground/underwater/aerial/planar
            
            // Status
            isWilderness: true,
            isSafeZone: false,
            isDungeon: false,
            isUrban: false,
            
            // Faction presence
            controllingFaction: null,
            factionInfluence: {},          // { factionName: influenceLevel }
            
            // Dungeon-specific (null if not in dungeon)
            dungeon: null,
            /*
            dungeon: {
                name: "The Depths",
                type: "arcane",           // natural/arcane/divine/corrupted/ancient
                floor: 1,
                zone: "Entry Hall",
                dangerLevel: "moderate",  // trivial/easy/moderate/hard/deadly/legendary
                isCleared: false,
                hasCore: true,
                coreStatus: "active"
            }
            */
            
            // Map coordinates (for map extension)
            coordinates: null,             // { x, y } or null
            
            // Travel tracking
            isInTransit: false,
            travelOrigin: null,
            travelDestination: null,
            travelMode: null,              // walking/riding/carriage/sailing/flying/teleport
            travelStartDate: null,
            travelEstimatedDays: null
        },

        // ═══════════════════════════════════════════════════════════════
        // ENVIRONMENTAL DATA
        // ═══════════════════════════════════════════════════════════════
        environment: {
            // Weather
            weather: "clear",              // clear/cloudy/overcast/rain/storm/snow/blizzard/fog/magical
            weatherSeverity: "normal",     // mild/normal/severe/extreme
            temperature: "mild",           // freezing/cold/cool/mild/warm/hot/scorching
            wind: "calm",                  // calm/light/moderate/strong/gale
            
            // Visibility
            visibility: "good",            // blind/poor/limited/moderate/good/excellent/perfect
            lightLevel: "bright",          // pitch black/dark/dim/moderate/bright/blinding
            lightSource: "natural",        // natural/torches/magical/bioluminescent/none
            
            // Magic environment
            magicDensity: "normal",        // void/low/normal/high/saturated/wild
            magicType: null,               // null or dominant type (arcane/divine/nature/shadow/etc.)
            leylineProximity: "none",      // none/distant/near/on/nexus
            
            // Ambient conditions
            ambientDanger: "none",         // none/low/moderate/high/extreme/lethal
            ambientMood: "neutral",        // peaceful/neutral/tense/hostile/terrifying
            
            // Active effects (magical weather, events, etc.)
            activeEffects: [],
            /*
            activeEffects: [
                { name: "Mana Storm", type: "magical", severity: "severe", duration: "hours" },
                { name: "Blood Moon", type: "celestial", severity: "moderate", duration: "night" }
            ]
            */
            
            // Sensory details (for narrative)
            dominantSmells: [],
            dominantSounds: [],
            notableFeatures: []
        },

        // ═══════════════════════════════════════════════════════════════
        // SOCIAL CONTEXT
        // ═══════════════════════════════════════════════════════════════
        context: {
            // Party state
            partyMembers: [],              // Array of character names
            partySize: 0,
            companionsPresent: [],
            
            // Current NPCs
            npcsPresent: [],               // Currently in scene
            npcsNearby: [],                // In vicinity but not directly interacting
            
            // Social situation
            socialContext: "neutral",      // private/semi-private/public/formal/hostile/intimate
            crowdDensity: "empty",         // empty/sparse/moderate/crowded/packed
            socialTension: "relaxed",      // relaxed/normal/tense/hostile/dangerous
            
            // Identity
            disguiseActive: false,
            disguiseIdentity: null,
            reputationKnown: false,        // Do locals know who PC is?
            wantedLevel: 0,                // 0-5 (0 = not wanted)
            
            // Current activity
            currentActivity: "idle",       // idle/exploring/combat/dialogue/rest/travel/shopping/training/quest/stealth/crafting
            activityDetails: null,
            
            // Combat state
            inCombat: false,
            combatRound: 0,
            combatEnemies: [],
            combatAllies: [],
            combatTerrain: null,
            
            // Dialogue state
            inDialogue: false,
            dialoguePartner: null,
            dialogueTone: null,            // friendly/neutral/tense/hostile/flirty/business
            
            // Transaction state
            inTransaction: false,
            transactionType: null,         // buying/selling/trading/negotiating
            transactionPartner: null
        },

        // ═══════════════════════════════════════════════════════════════
        // META / SYSTEM
        // ═══════════════════════════════════════════════════════════════
        meta: {
            // Update tracking
            lastUpdated: null,             // Timestamp
            updateSource: "manual",        // manual/parsed/event/travel/combat
            updateConfidence: "high",      // low/medium/high (how sure are we?)
            
            // State history (for undo/review)
            historyEnabled: true,
            maxHistoryEntries: 50,
            history: [],
            
            // Pending changes queue
            pendingChanges: [],
            
            // Extension communication
            lastBroadcast: null,
            subscriberCount: 0,
            
            // Debug
            parseErrors: [],
            warnings: []
        }
    };
}

/**
 * Time of day calculation from hour
 */
export function getTimeOfDay(hour) {
    if (hour >= 4 && hour < 6) return "dawn";
    if (hour >= 6 && hour < 9) return "early morning";
    if (hour >= 9 && hour < 12) return "morning";
    if (hour === 12) return "midday";
    if (hour > 12 && hour < 15) return "early afternoon";
    if (hour >= 15 && hour < 18) return "afternoon";
    if (hour >= 18 && hour < 20) return "evening";
    if (hour >= 20 && hour < 22) return "night";
    if (hour >= 22 || hour < 2) return "late night";
    return "midnight"; // 2-4
}

/**
 * Format hour to display string
 */
export function formatTime(hour, minute = 0) {
    const timeOfDay = getTimeOfDay(hour);
    const hourDisplay = hour % 12 || 12;
    const period = hour < 12 ? 'AM' : 'PM';
    const minuteStr = String(minute).padStart(2, '0');
    return `${hourDisplay}:${minuteStr} ${period} (${timeOfDay})`;
}

/**
 * Calculate derived values for a state object
 */
export function calculateDerivedValues(state) {
    const { time, location, environment } = state;
    
    // Time derivations
    time.season = ValdrisCalendar.getSeason(time.month);
    time.timeOfDay = getTimeOfDay(time.hour);
    time.octaveDay = ValdrisCalendar.getOctaveDay(time.day, time.month, time.year);
    time.octaveDayIndex = ValdrisCalendar.getDayOfOctave(time.day, time.month, time.year);
    time.moonSolara = ValdrisCalendar.getSolaraPhase(time.day, time.month, time.year);
    time.moonNyxara = ValdrisCalendar.getNyxaraPhase(time.day, time.month, time.year);
    time.moonAlignment = ValdrisCalendar.checkMoonAlignment(time.day, time.month, time.year);
    time.isHoliday = ValdrisCalendar.isHoliday(time.day, time.month);
    time.formattedDate = ValdrisCalendar.formatDate(time.day, time.month, time.year, 'full');
    time.formattedTime = formatTime(time.hour, time.minute);
    time.lastKnownDate = ValdrisCalendar.formatDate(time.day, time.month, time.year, 'numeric');
    
    // Location derivations
    location.isUrban = ['capital', 'city', 'town'].includes(location.settlementType);
    location.isWilderness = !location.settlement && !location.isDungeon;
    
    // Environment based on location type
    if (location.locationType === 'indoor') {
        environment.lightSource = environment.lightSource || 'torches';
    }
    if (location.locationType === 'underground') {
        environment.lightLevel = environment.lightLevel === 'bright' ? 'dim' : environment.lightLevel;
    }
    
    return state;
}

/**
 * Validate state object
 */
export function validateState(state) {
    const errors = [];
    
    // Time validation
    if (state.time.month < 0 || state.time.month > 10) {
        errors.push(`Invalid month: ${state.time.month}`);
    }
    if (state.time.day < 1 || state.time.day > 36) {
        errors.push(`Invalid day: ${state.time.day}`);
    }
    if (state.time.hour < 0 || state.time.hour > 23) {
        errors.push(`Invalid hour: ${state.time.hour}`);
    }
    if (state.time.year < 1) {
        errors.push(`Invalid year: ${state.time.year}`);
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

export default createDefaultState;
