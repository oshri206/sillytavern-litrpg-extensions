/**
 * VALDRIS TEMPORAL-SPATIAL STATE SYSTEM - Parser
 * ===============================================
 * Extracts date, time, and location information from narrative text.
 * Designed to parse the standard format: [Location, Date, Time]
 * Also catches inline references to time passage and location changes.
 */

import ValdrisCalendar from './vtss-calendar.js';

export const VTSSParser = {
    // ═══════════════════════════════════════════════════════════════
    // REGEX PATTERNS
    // ═══════════════════════════════════════════════════════════════
    patterns: {
        // VEX FORMAT: [Location: X | 15th of Bloomrise, 1247 AC | Evening, 7th hour | Weather: X]
        vexHeader: /\[Location:\s*([^|]+)\s*\|\s*(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(\w+),?\s*(\d{4})\s*AC?\s*\|\s*(\w+)(?:,\s*(\d{1,2})(?:st|nd|rd|th)?\s*hour)?(?:,?\s*(\d{1,2})\s*(?:min(?:ute)?s?)?)?\s*(?:\|\s*Weather:\s*([^|\]]+))?\]/i,
        
        // PRIMARY FORMAT: [Location, 15th of Harvestgold, 2847 AV, Afternoon]
        fullHeader: /\[([^,\]]+),\s*(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(\w+),?\s*(\d{4})\s*(?:AV|AC)(?:,\s*([^\]]+))?\]/i,
        
        // ALTERNATE: [Location, Harvestgold 15, 2847 AV]
        altHeader: /\[([^,\]]+),\s*(\w+)\s+(\d{1,2}),?\s*(\d{4})\s*(?:AV|AC)/i,
        
        // VEXDAY FORMAT: [Location, Vexday of Chaos, 2847 AV]
        vexdayHeader: /\[([^,\]]+),\s*Vexday\s+(?:of\s+)?(\w+),?\s*(\d{4})\s*(?:AV|AC)/i,
        
        // DATE ONLY (no location): 15th of Harvestgold, 2847 AV
        dateOnly: /(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(\w+),?\s*(\d{4})\s*(?:AV|AC)/i,
        
        // TIME OF DAY phrases
        timeOfDay: /\b(dawn|daybreak|sunrise|early\s+morning|morning|mid-?morning|midday|noon|high\s+noon|afternoon|late\s+afternoon|evening|dusk|sunset|twilight|night|nightfall|late\s+night|midnight|witching\s+hour|small\s+hours|pre-?dawn)\b/gi,
        
        // SPECIFIC TIME: "around 3 in the afternoon", "at midnight", "nearing 6 PM", "7th hour"
        specificTime: /(?:around|at|nearing|past|before|after)?\s*(\d{1,2})(?::(\d{2}))?\s*(?:in\s+the\s+)?(morning|afternoon|evening|night|AM|PM|o'clock|hour)/i,
        
        // TIME SKIP phrases - now includes minutes!
        timeSkip: /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|forty-five|several|a\s+few|many)\s+(minute|hour|day|week|month|year|octave)s?\s+(later|pass(?:ed)?|elapsed|went\s+by|since)\b/gi,
        
        // RELATIVE TIME: "the next morning", "that evening", "three days hence"
        relativeTime: /\b(?:the\s+)?(next|following|previous|last|that|this)\s+(dawn|morning|afternoon|evening|night|day|week|month|octave)\b/gi,
        
        // LOCATION CHANGE: "arrived at", "entered", "reached", "traveled to"
        locationChange: /\b(?:arriv(?:ed?|ing)\s+(?:at|in)|enter(?:ed|ing)?|reach(?:ed|ing)?|travel(?:ed|ing)?\s+to|journeyed?\s+to|came?\s+to|left\s+for|departed\s+(?:for|to))\s+(?:the\s+)?([A-Z][^.,!?]+?)(?:\.|,|!|\?|$)/gi,
        
        // LOCATION DESCRIPTORS
        locationDescriptor: /\b(?:in(?:side)?|at|within|outside|near|beneath|above|through)\s+(?:the\s+)?([A-Z][A-Za-z\s'-]+?)(?:\.|,|!|\?|'s|$)/gi,
        
        // WEATHER mentions
        weather: /\b(rain(?:ing|ed|y)?|snow(?:ing|ed|y)?|storm(?:ing|y)?|clear\s+(?:sky|skies|day)?|fog(?:gy)?|mist(?:y)?|overcast|cloud(?:y|ed)?|sunny|wind(?:y)?|blizzard|thunder(?:storm)?|hail(?:ing)?)\b/gi,
        
        // DUNGEON FLOOR references
        dungeonFloor: /\b(?:floor|level|depth)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/gi,
        
        // MOON references
        moonRef: /\b(Solara|Nyxara|golden\s+moon|silver\s+moon|both\s+moons|dual\s+moons|the\s+moons?)\s+(?:was|were|hung|shone|rose|set|is|are)?\s*(full|new|waxing|waning|crescent|gibbous|dark|bright)?\b/gi,

        // VALDRIS-SPECIFIC month names (for validation)
        monthNames: /\b(Vexrise|Frosthold|Thawbreak|Seedsow|Bloomtide|Solpeak|Highfire|Harvestgold|Shadowrise|Longnight|Vexday|Frostmere|Iceveil|Bloomrise|Sunsheight|Highflame|Goldfall|Harvestend|Misthollow|Darkember)\b/gi,
        
        // VALDRIS-SPECIFIC day names
        dayNames: /\b(Firstday|Solday|Forgeday|Wardday|Tradeday|Courtday|Nyxday|Restday|Primus|Secundus|Tertius|Quartus|Quintus|Sextus|Septimus|Octavus)\b/gi
    },

    // ═══════════════════════════════════════════════════════════════
    // NUMBER WORD MAPPING
    // ═══════════════════════════════════════════════════════════════
    numberWords: {
        'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
        'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
        'eleven': 11, 'twelve': 12, 'fifteen': 15, 'twenty': 20,
        'thirty': 30, 'forty': 40, 'forty-five': 45,
        'several': 3, 'a few': 3, 'many': 5
    },

    // ═══════════════════════════════════════════════════════════════
    // TIME ESTIMATION - Estimate minutes based on narrative content
    // ═══════════════════════════════════════════════════════════════
    estimateNarrativeTime(text) {
        // Base time: 5 minutes for any scene
        let minutes = 5;
        
        // Conversation indicators add time
        const dialogueCount = (text.match(/[""][^""]+[""]/g) || []).length;
        minutes += dialogueCount * 2; // 2 min per dialogue line
        
        // Combat adds significant time
        if (/\b(attack|strike|fight|battle|combat|slash|parry|dodge)\b/i.test(text)) {
            minutes += 15;
        }
        
        // Travel adds time based on distance words
        if (/\b(travel|journey|walk|ride|march|trek)\b/i.test(text)) {
            if (/\b(hours?|long|far|distant)\b/i.test(text)) {
                minutes += 60;
            } else {
                minutes += 20;
            }
        }
        
        // Meals and rest
        if (/\b(eat|meal|breakfast|lunch|dinner|rest|sleep)\b/i.test(text)) {
            minutes += 30;
        }
        
        // Quick actions are fast
        if (/\b(quick|moment|instant|brief|sudden)\b/i.test(text)) {
            minutes = Math.max(2, minutes - 10);
        }
        
        // Long scenes
        if (/\b(hours? pass|time pass|long while|lengthy)\b/i.test(text)) {
            minutes += 45;
        }
        
        // Cap at reasonable amounts
        return Math.min(minutes, 120); // Max 2 hours per prompt
    },

    // ═══════════════════════════════════════════════════════════════
    // MAIN PARSE FUNCTION
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * Parse a message and extract all temporal-spatial data
     * @param {string} text - The narrative text to parse
     * @returns {object} Parsed data object
     */
    parseMessage(text) {
        const result = {
            found: false,
            time: null,
            location: null,
            timeSkip: null,
            weather: null,
            moonPhase: null,
            dungeonInfo: null,
            estimatedMinutes: this.estimateNarrativeTime(text),
            confidence: 'low',
            rawMatches: []
        };

        // Try VEX header format first (our preferred format!)
        const vexMatch = text.match(this.patterns.vexHeader);
        if (vexMatch) {
            result.found = true;
            result.confidence = 'high';
            result.location = this.parseLocation(vexMatch[1]);
            const hourFromName = this.estimateHourFromTimeOfDay(vexMatch[5]?.trim().toLowerCase());
            const explicitHour = vexMatch[6] ? parseInt(vexMatch[6]) : null;
            const explicitMinute = vexMatch[7] ? parseInt(vexMatch[7]) : 0;
            result.time = {
                day: parseInt(vexMatch[2]),
                month: this.parseMonth(vexMatch[3]),
                year: parseInt(vexMatch[4]),
                timeOfDay: vexMatch[5]?.trim().toLowerCase() || null,
                hour: explicitHour !== null ? explicitHour : hourFromName,
                minute: explicitMinute
            };
            if (vexMatch[8]) {
                result.weather = vexMatch[8].trim().toLowerCase();
            }
            result.rawMatches.push({ type: 'vexHeader', match: vexMatch[0] });
            return result; // Vex header is authoritative, skip other parsing
        }

        // Try full header format first (most reliable)
        const fullMatch = text.match(this.patterns.fullHeader);
        if (fullMatch) {
            result.found = true;
            result.confidence = 'high';
            result.location = this.parseLocation(fullMatch[1]);
            result.time = {
                day: parseInt(fullMatch[2]),
                month: this.parseMonth(fullMatch[3]),
                year: parseInt(fullMatch[4]),
                timeOfDay: fullMatch[5]?.trim().toLowerCase() || null,
                hour: this.estimateHourFromTimeOfDay(fullMatch[5]?.trim().toLowerCase()),
                minute: 0
            };
            result.rawMatches.push({ type: 'fullHeader', match: fullMatch[0] });
        }

        // Try alternate header format
        if (!result.found) {
            const altMatch = text.match(this.patterns.altHeader);
            if (altMatch) {
                result.found = true;
                result.confidence = 'high';
                result.location = this.parseLocation(altMatch[1]);
                result.time = {
                    month: this.parseMonth(altMatch[2]),
                    day: parseInt(altMatch[3]),
                    year: parseInt(altMatch[4])
                };
                result.rawMatches.push({ type: 'altHeader', match: altMatch[0] });
            }
        }

        // Try Vexday format
        if (!result.found) {
            const vexMatch = text.match(this.patterns.vexdayHeader);
            if (vexMatch) {
                result.found = true;
                result.confidence = 'high';
                result.location = this.parseLocation(vexMatch[1]);
                const vexdayIndex = ValdrisCalendar.vexdays.names.findIndex(
                    n => n.toLowerCase() === vexMatch[2].toLowerCase()
                );
                result.time = {
                    month: 0, // Vexdays
                    day: vexdayIndex >= 0 ? vexdayIndex + 1 : 1,
                    year: parseInt(vexMatch[3]),
                    isVexday: true,
                    vexdayName: vexMatch[2]
                };
                result.rawMatches.push({ type: 'vexdayHeader', match: vexMatch[0] });
            }
        }

        // Check for time skip phrases
        const skipMatches = [...text.matchAll(this.patterns.timeSkip)];
        if (skipMatches.length > 0) {
            const lastSkip = skipMatches[skipMatches.length - 1];
            result.timeSkip = {
                amount: this.parseNumber(lastSkip[1]),
                unit: lastSkip[2].toLowerCase(),
                direction: 'forward'
            };
            result.rawMatches.push({ type: 'timeSkip', match: lastSkip[0] });
        }

        // Check for location changes in narrative
        const locMatches = [...text.matchAll(this.patterns.locationChange)];
        if (locMatches.length > 0) {
            const lastLoc = locMatches[locMatches.length - 1];
            result.locationChange = this.parseLocation(lastLoc[1]);
            result.rawMatches.push({ type: 'locationChange', match: lastLoc[0] });
        }

        // Check for time of day mentions (if not already found)
        if (!result.time?.timeOfDay) {
            const timeMatches = [...text.matchAll(this.patterns.timeOfDay)];
            if (timeMatches.length > 0) {
                const timeOfDay = timeMatches[timeMatches.length - 1][1].toLowerCase().replace(/\s+/g, ' ');
                if (result.time) {
                    result.time.timeOfDay = timeOfDay;
                    result.time.hour = this.estimateHourFromTimeOfDay(timeOfDay);
                } else {
                    result.timeOfDayOnly = timeOfDay;
                }
                result.rawMatches.push({ type: 'timeOfDay', match: timeMatches[timeMatches.length - 1][0] });
            }
        }

        // Check for weather
        const weatherMatches = [...text.matchAll(this.patterns.weather)];
        if (weatherMatches.length > 0) {
            result.weather = this.normalizeWeather(weatherMatches[weatherMatches.length - 1][1]);
            result.rawMatches.push({ type: 'weather', match: weatherMatches[weatherMatches.length - 1][0] });
        }

        // Check for dungeon floor
        const floorMatches = [...text.matchAll(this.patterns.dungeonFloor)];
        if (floorMatches.length > 0) {
            result.dungeonInfo = {
                floor: this.parseNumber(floorMatches[floorMatches.length - 1][1])
            };
            result.rawMatches.push({ type: 'dungeonFloor', match: floorMatches[floorMatches.length - 1][0] });
        }

        // Check for moon references
        const moonMatches = [...text.matchAll(this.patterns.moonRef)];
        if (moonMatches.length > 0) {
            result.moonPhase = {
                moon: moonMatches[0][1],
                phase: moonMatches[0][2] || null
            };
            result.rawMatches.push({ type: 'moonRef', match: moonMatches[0][0] });
        }

        return result;
    },

    // ═══════════════════════════════════════════════════════════════
    // HELPER METHODS
    // ═══════════════════════════════════════════════════════════════

    /**
     * Parse month name to index (1-10, 0 for Vexdays)
     */
    parseMonth(monthStr) {
        if (!monthStr) return null;
        const normalized = monthStr.toLowerCase().trim();
        
        // Check for Vexday
        if (normalized === 'vexday' || normalized === 'vexdays') {
            return 0;
        }
        
        // Find matching month
        const index = ValdrisCalendar.months.findIndex(m => 
            m.name.toLowerCase() === normalized ||
            m.shortName.toLowerCase() === normalized
        );
        
        return index >= 0 ? index + 1 : null;
    },

    /**
     * Parse number from string (digit or word)
     */
    parseNumber(str) {
        if (!str) return null;
        const normalized = str.toLowerCase().trim();
        
        // Check word numbers
        if (this.numberWords[normalized]) {
            return this.numberWords[normalized];
        }
        
        // Try parsing as integer
        const num = parseInt(str);
        return isNaN(num) ? null : num;
    },

    /**
     * Estimate hour from time of day description
     */
    estimateHourFromTimeOfDay(timeOfDay) {
        if (!timeOfDay) return 12; // Default to midday
        
        const normalized = timeOfDay.toLowerCase().replace(/\s+/g, ' ').trim();
        
        const hourMap = {
            'dawn': 5,
            'daybreak': 5,
            'sunrise': 6,
            'pre-dawn': 4,
            'predawn': 4,
            'early morning': 7,
            'morning': 9,
            'mid-morning': 10,
            'midmorning': 10,
            'late morning': 11,
            'midday': 12,
            'noon': 12,
            'high noon': 12,
            'early afternoon': 13,
            'afternoon': 15,
            'late afternoon': 17,
            'evening': 19,
            'dusk': 19,
            'sunset': 19,
            'twilight': 20,
            'early evening': 18,
            'night': 21,
            'nightfall': 20,
            'late night': 23,
            'midnight': 0,
            'witching hour': 3,
            'small hours': 2
        };

        return hourMap[normalized] ?? 12;
    },

    /**
     * Parse location string into structured data
     */
    parseLocation(locStr) {
        if (!locStr) return null;
        
        const trimmed = locStr.trim();
        
        // Check for compound locations: "The Spiral - Main Hall"
        const compoundMatch = trimmed.match(/^([^-–]+)\s*[-–]\s*(.+)$/);
        if (compoundMatch) {
            return {
                raw: trimmed,
                primary: compoundMatch[1].trim(),
                specific: compoundMatch[2].trim(),
                isCompound: true
            };
        }
        
        // Check for possessive locations: "Kira's Shop"
        const possessiveMatch = trimmed.match(/^([A-Z][a-z]+)'s\s+(.+)$/);
        if (possessiveMatch) {
            return {
                raw: trimmed,
                owner: possessiveMatch[1],
                place: possessiveMatch[2],
                isPossessive: true
            };
        }
        
        // Simple location
        return {
            raw: trimmed,
            primary: trimmed,
            isCompound: false
        };
    },

    /**
     * Normalize weather descriptions
     */
    normalizeWeather(weatherStr) {
        if (!weatherStr) return null;
        
        const normalized = weatherStr.toLowerCase();
        
        const weatherMap = {
            'raining': 'rain',
            'rained': 'rain',
            'rainy': 'rain',
            'snowing': 'snow',
            'snowed': 'snow',
            'snowy': 'snow',
            'storming': 'storm',
            'stormy': 'storm',
            'thunderstorm': 'storm',
            'foggy': 'fog',
            'misty': 'mist',
            'cloudy': 'cloudy',
            'clouded': 'cloudy',
            'windy': 'windy',
            'hailing': 'hail',
            'sunny': 'clear',
            'clear sky': 'clear',
            'clear skies': 'clear',
            'clear day': 'clear'
        };

        return weatherMap[normalized] || normalized;
    },

    /**
     * Extract all Valdris-specific terms from text
     */
    extractValdrisTerms(text) {
        return {
            months: [...text.matchAll(this.patterns.monthNames)].map(m => m[1]),
            days: [...text.matchAll(this.patterns.dayNames)].map(m => m[1])
        };
    },

    /**
     * Check if text contains temporal markers
     */
    hasTemporalMarkers(text) {
        return this.patterns.fullHeader.test(text) ||
               this.patterns.altHeader.test(text) ||
               this.patterns.vexdayHeader.test(text) ||
               this.patterns.timeSkip.test(text) ||
               this.patterns.dateOnly.test(text);
    },

    /**
     * Check if text contains location markers
     */
    hasLocationMarkers(text) {
        return this.patterns.fullHeader.test(text) ||
               this.patterns.altHeader.test(text) ||
               this.patterns.locationChange.test(text);
    }
};

export default VTSSParser;
