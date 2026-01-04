/**
 * VALDRIS CALENDAR SYSTEM
 * =======================
 * A fully custom calendar for the world of Valdris
 * 
 * Structure:
 * - 10 months of 36 days each = 360 days
 * - 5 intercalary "Vexdays" between years (festival days outside normal months)
 * - 6 Vexdays on "Vex Years" (every 8 years, Vex adds an extra day for fun)
 * - 8-day weeks called "Octaves" 
 * - Two moons: Solara (golden, 36-day cycle) and Nyxara (silver, 24-day cycle)
 * - Year count: AV (After Vex) - current year ~2847 AV
 */

export const ValdrisCalendar = {
    // ═══════════════════════════════════════════════════════════════
    // MONTHS - 10 months, 36 days each
    // ═══════════════════════════════════════════════════════════════
    months: [
        {
            index: 1,
            name: "Vexrise",
            shortName: "Vex",
            days: 36,
            season: "winter",
            description: "The first month. Celebrates Vex's awakening and the new year. Cold but hopeful.",
            dominantForce: "Vex",
            festivals: ["Year's Turn (1st)", "Awakening Festival (15th)"],
            magicModifier: { system: 1.2, general: 1.0 }
        },
        {
            index: 2,
            name: "Frosthold",
            shortName: "Fro",
            days: 36,
            season: "winter",
            description: "Deep winter. The world sleeps under ice. Nyx's influence lingers.",
            dominantForce: "Nyx",
            festivals: ["Night of Ancestors (18th)"],
            magicModifier: { shadow: 1.15, ice: 1.2 }
        },
        {
            index: 3,
            name: "Thawbreak",
            shortName: "Thw",
            days: 36,
            season: "spring",
            description: "Winter's grip loosens. Rivers crack. Life stirs beneath snow.",
            dominantForce: "neutral",
            festivals: ["Thaw Festival (20th)"],
            magicModifier: { water: 1.1, nature: 1.1 }
        },
        {
            index: 4,
            name: "Seedsow",
            shortName: "See",
            days: 36,
            season: "spring",
            description: "Planting season. Farmers pray to nature spirits. Growth magic peaks.",
            dominantForce: "nature",
            festivals: ["Planting Day (1st)", "Green Moon (varies)"],
            magicModifier: { nature: 1.25, life: 1.15 }
        },
        {
            index: 5,
            name: "Bloomtide",
            shortName: "Blo",
            days: 36,
            season: "spring",
            description: "Peak spring. Flowers blanket the world. Fey are most active.",
            dominantForce: "fey",
            festivals: ["Bloom Festival (15th)", "Lover's Night (30th)"],
            magicModifier: { nature: 1.2, illusion: 1.15, charm: 1.1 }
        },
        {
            index: 6,
            name: "Solpeak",
            shortName: "Sol",
            days: 36,
            season: "summer",
            description: "Solarus's triumph. Longest days. Light magic at maximum. Undead weakest.",
            dominantForce: "Solarus",
            festivals: ["Solstice (18th) - Solarus's Holy Day", "Day of Burning (36th)"],
            magicModifier: { light: 1.3, fire: 1.2, holy: 1.25, shadow: 0.8 }
        },
        {
            index: 7,
            name: "Highfire",
            shortName: "Hig",
            days: 36,
            season: "summer",
            description: "Scorching heat. Deserts expand. Fire elementals roam freely.",
            dominantForce: "elemental",
            festivals: ["Fire Walking (10th)"],
            magicModifier: { fire: 1.3, water: 0.85 }
        },
        {
            index: 8,
            name: "Harvestgold",
            shortName: "Har",
            days: 36,
            season: "autumn",
            description: "Gathering time. Golden fields. Gratitude to land and System alike.",
            dominantForce: "neutral",
            festivals: ["Harvest Festival (20th-25th)", "Vex's Gratitude (36th)"],
            magicModifier: { earth: 1.15, nature: 1.1 }
        },
        {
            index: 9,
            name: "Shadowrise",
            shortName: "Sha",
            days: 36,
            season: "autumn",
            description: "Darkness grows. Nyx's power swells. Spirits grow restless.",
            dominantForce: "Nyx",
            festivals: ["Night of Veils (18th) - spirits walk", "Shadow's Eve (36th)"],
            magicModifier: { shadow: 1.2, necromancy: 1.15, spirit: 1.2 }
        },
        {
            index: 10,
            name: "Longnight",
            shortName: "Lon",
            days: 36,
            season: "winter",
            description: "Nyx's reign. Shortest days. Shadow magic peaks. Solarus's faithful endure.",
            dominantForce: "Nyx",
            festivals: ["Longest Night (18th) - Nyx's Holy Day", "Eve of Turning (36th)"],
            magicModifier: { shadow: 1.3, necromancy: 1.2, light: 0.8, holy: 0.85 }
        }
    ],

    // ═══════════════════════════════════════════════════════════════
    // INTERCALARY DAYS - The Vexdays
    // ═══════════════════════════════════════════════════════════════
    vexdays: {
        count: 5, // 6 on Vex Years (every 8 years)
        names: [
            "Remembrance",    // Honor the dead
            "Chaos",          // Vex's favorite - random events
            "Binding",        // Contracts renewed, oaths sworn
            "Revelation",     // Secrets revealed, truths spoken
            "Renewal"         // Cleansing, fresh starts
        ],
        extraDay: "Vex's Whim", // 6th day on Vex Years - literally anything can happen
        description: "Days outside the normal calendar, between Longnight and Vexrise. Time itself feels thin. Magic behaves strangely. Most businesses close. Wise travelers stay indoors.",
        isVexYear: (year) => year % 8 === 0
    },

    // ═══════════════════════════════════════════════════════════════
    // OCTAVE - 8-day week
    // ═══════════════════════════════════════════════════════════════
    octave: [
        {
            index: 0,
            name: "Firstday",
            shortName: "Fir",
            altName: "Vexday",
            description: "Week begins. Vex's influence acknowledged. System notifications more common.",
            activities: ["Weekly quests reset", "Guild meetings", "System maintenance"],
            businessHours: "normal",
            holyTo: "Vex"
        },
        {
            index: 1,
            name: "Solday",
            shortName: "Sol",
            altName: null,
            description: "Solarus's holy day. Churches of light hold services. Undead hunters most active.",
            activities: ["Solarus worship", "Healing services", "Light magic training"],
            businessHours: "morning only (Solarus faithful)",
            holyTo: "Solarus"
        },
        {
            index: 2,
            name: "Forgeday",
            shortName: "For",
            altName: null,
            description: "Day of creation. Smiths, artificers, crafters at peak productivity.",
            activities: ["Crafting", "Enchanting", "Construction"],
            businessHours: "extended",
            holyTo: null
        },
        {
            index: 3,
            name: "Wardday",
            shortName: "War",
            altName: null,
            description: "Military day. Training grounds active. Arena matches scheduled.",
            activities: ["Combat training", "Arena fights", "Military drills", "Guard rotations"],
            businessHours: "normal",
            holyTo: "war deities"
        },
        {
            index: 4,
            name: "Tradeday",
            shortName: "Tra",
            altName: "Marketday",
            description: "Commerce peaks. Markets busiest. Best day for buying/selling.",
            activities: ["Trading", "Auctions", "Merchant arrivals"],
            businessHours: "dawn to midnight",
            holyTo: "commerce deities"
        },
        {
            index: 5,
            name: "Courtday",
            shortName: "Cou",
            altName: null,
            description: "Law and politics. Courts in session. Noble audiences. Diplomatic meetings.",
            activities: ["Legal proceedings", "Political meetings", "Formal audiences"],
            businessHours: "government extended, others normal",
            holyTo: "justice deities"
        },
        {
            index: 6,
            name: "Nyxday",
            shortName: "Nyx",
            altName: null,
            description: "Nyx's holy day. Shadow temples active. Night creatures more brazen.",
            activities: ["Nyx worship", "Shadow magic", "Assassin contracts begin"],
            businessHours: "evening/night only (Nyx faithful)",
            holyTo: "Nyx"
        },
        {
            index: 7,
            name: "Restday",
            shortName: "Res",
            altName: null,
            description: "Rest and family. Most businesses closed. Taverns busy.",
            activities: ["Rest", "Family gatherings", "Leisure", "Tavern business"],
            businessHours: "limited (essential only)",
            holyTo: null
        }
    ],

    // ═══════════════════════════════════════════════════════════════
    // DUAL MOON SYSTEM
    // ═══════════════════════════════════════════════════════════════
    moons: {
        solara: {
            name: "Solara",
            title: "The Golden Eye",
            color: "golden/amber",
            cycle: 36, // days - perfectly matches one month
            description: "Larger moon, golden hue. Associated with Solarus, light magic, truth.",
            phases: ["new", "waxing crescent", "first quarter", "waxing gibbous", "full", "waning gibbous", "last quarter", "waning crescent"],
            magicEffect: {
                full: { light: 1.2, truth: 1.15, illusion: 0.9 },
                new: { shadow: 1.1, secrets: 1.1 }
            }
        },
        nyxara: {
            name: "Nyxara",
            title: "The Silver Whisper",
            color: "silver/pale blue",
            cycle: 24, // days - creates interesting phase interactions
            description: "Smaller, faster moon. Silver gleam. Associated with Nyx, shadow magic, secrets.",
            phases: ["new", "waxing crescent", "first quarter", "waxing gibbous", "full", "waning gibbous", "last quarter", "waning crescent"],
            magicEffect: {
                full: { shadow: 1.2, illusion: 1.15, madness: 1.1 },
                new: { clarity: 1.1, truth: 1.05 }
            }
        },
        // Special alignments
        alignments: {
            dualFull: {
                name: "The Convergence",
                description: "Both moons full. Extremely rare. Magic surges unpredictably. Portals may open.",
                frequency: "Every 72 days theoretically, but true alignment rarer",
                effects: ["Wild magic surges", "Planar bleeding", "Prophecies trigger"]
            },
            dualNew: {
                name: "The Void Night",
                description: "Both moons dark. True darkness. Shadow creatures at peak power.",
                frequency: "Every 72 days theoretically",
                effects: ["Shadow magic +50%", "Light magic -30%", "Undead empowered"]
            },
            eclipse: {
                name: "Nyxara's Crossing",
                description: "Nyxara passes before Solara. Brief but potent.",
                frequency: "Irregular",
                effects: ["Momentary reality flux", "Vex often speaks during these"]
            }
        }
    },

    // ═══════════════════════════════════════════════════════════════
    // CALCULATION METHODS
    // ═══════════════════════════════════════════════════════════════

    /**
     * Get total days in a standard year
     */
    getDaysInYear(year) {
        return 360 + (this.vexdays.isVexYear(year) ? 6 : 5);
    },

    /**
     * Check if a given day is during Vexdays (between years)
     */
    isVexday(day, month) {
        return month === 0; // We'll use month 0 for Vexdays
    },

    /**
     * Get the day of the year (1-365/366)
     */
    getDayOfYear(day, month, year) {
        if (month === 0) {
            // Vexday period
            return 360 + day;
        }
        let total = 0;
        for (let i = 1; i < month; i++) {
            total += this.months[i - 1].days;
        }
        return total + day;
    },

    /**
     * Get day of the Octave (0-7)
     */
    getDayOfOctave(day, month, year) {
        // Calculate days since epoch (1 AV, Firstday of Vexrise)
        const daysSinceEpoch = this.getTotalDaysSinceEpoch(day, month, year);
        return daysSinceEpoch % 8;
    },

    /**
     * Get the Octave day object
     */
    getOctaveDay(day, month, year) {
        const index = this.getDayOfOctave(day, month, year);
        return this.octave[index];
    },

    /**
     * Calculate total days since year 1 AV
     */
    getTotalDaysSinceEpoch(day, month, year) {
        let total = 0;
        
        // Add complete years
        for (let y = 1; y < year; y++) {
            total += this.getDaysInYear(y);
        }
        
        // Add days in current year
        total += this.getDayOfYear(day, month, year);
        
        return total;
    },

    /**
     * Calculate moon phase for Solara (36-day cycle)
     */
    getSolaraPhase(day, month, year) {
        const dayOfYear = this.getDayOfYear(day, month, year);
        const phaseDay = dayOfYear % 36;
        const phaseIndex = Math.floor(phaseDay / 4.5); // 8 phases over 36 days
        return {
            phase: this.moons.solara.phases[Math.min(phaseIndex, 7)],
            dayInCycle: phaseDay,
            percentFull: this.calculateMoonFullness(phaseDay, 36)
        };
    },

    /**
     * Calculate moon phase for Nyxara (24-day cycle)
     */
    getNyxaraPhase(day, month, year) {
        const totalDays = this.getTotalDaysSinceEpoch(day, month, year);
        const phaseDay = totalDays % 24;
        const phaseIndex = Math.floor(phaseDay / 3); // 8 phases over 24 days
        return {
            phase: this.moons.nyxara.phases[Math.min(phaseIndex, 7)],
            dayInCycle: phaseDay,
            percentFull: this.calculateMoonFullness(phaseDay, 24)
        };
    },

    /**
     * Calculate how "full" a moon appears (0-100%)
     */
    calculateMoonFullness(dayInCycle, cycleLength) {
        const halfCycle = cycleLength / 2;
        if (dayInCycle <= halfCycle) {
            return Math.round((dayInCycle / halfCycle) * 100);
        } else {
            return Math.round(((cycleLength - dayInCycle) / halfCycle) * 100);
        }
    },

    /**
     * Check for special moon alignments
     */
    checkMoonAlignment(day, month, year) {
        const solara = this.getSolaraPhase(day, month, year);
        const nyxara = this.getNyxaraPhase(day, month, year);
        
        const alignments = [];
        
        // Both full (within 2 days of peak)
        if (solara.percentFull >= 90 && nyxara.percentFull >= 90) {
            alignments.push('dualFull');
        }
        
        // Both new (within 2 days of new)
        if (solara.percentFull <= 10 && nyxara.percentFull <= 10) {
            alignments.push('dualNew');
        }
        
        return alignments.length > 0 ? alignments : null;
    },

    /**
     * Get season for a given month
     */
    getSeason(month) {
        if (month === 0) return "vexdays"; // Special period
        return this.months[month - 1].season;
    },

    /**
     * Get month object by index (1-10, 0 for Vexdays)
     */
    getMonth(monthIndex) {
        if (monthIndex === 0) {
            return {
                index: 0,
                name: "Vexdays",
                shortName: "VEX",
                days: 5, // or 6 on Vex Years
                season: "vexdays",
                description: this.vexdays.description,
                dominantForce: "Vex",
                festivals: this.vexdays.names,
                magicModifier: { chaos: 1.5, all: 1.1 }
            };
        }
        return this.months[monthIndex - 1];
    },

    /**
     * Format date to string
     */
    formatDate(day, month, year, style = 'full') {
        const suffix = this.getOrdinalSuffix(day);
        
        if (month === 0) {
            // Vexday period
            const vexdayName = this.vexdays.names[day - 1] || this.vexdays.extraDay;
            switch(style) {
                case 'full':
                    return `Vexday of ${vexdayName}, ${year} AV`;
                case 'short':
                    return `Vexday ${day}, ${year} AV`;
                case 'numeric':
                    return `${year}-00-${String(day).padStart(2, '0')}`;
                default:
                    return `Vexday of ${vexdayName}, ${year} AV`;
            }
        }
        
        const monthData = this.months[month - 1];
        
        switch(style) {
            case 'full':
                return `${day}${suffix} of ${monthData.name}, ${year} AV`;
            case 'long':
                return `${day}${suffix} ${monthData.name} ${year} AV`;
            case 'short':
                return `${day} ${monthData.shortName} ${year}`;
            case 'numeric':
                return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            case 'narrative':
                return `the ${day}${suffix} day of ${monthData.name} in the year ${year} After Vex`;
            default:
                return `${day}${suffix} of ${monthData.name}, ${year} AV`;
        }
    },

    /**
     * Parse a date string back to components
     */
    parseDate(dateStr) {
        // Numeric format: 2847-09-15
        const numericMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
        if (numericMatch) {
            return {
                year: parseInt(numericMatch[1]),
                month: parseInt(numericMatch[2]),
                day: parseInt(numericMatch[3])
            };
        }
        
        // Full format: 15th of Harvestgold, 2847 AV
        const fullMatch = dateStr.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(\w+),?\s*(\d{4})\s*AV/i);
        if (fullMatch) {
            const monthIndex = this.months.findIndex(m => 
                m.name.toLowerCase() === fullMatch[2].toLowerCase() ||
                m.shortName.toLowerCase() === fullMatch[2].toLowerCase()
            );
            return {
                year: parseInt(fullMatch[3]),
                month: monthIndex + 1,
                day: parseInt(fullMatch[1])
            };
        }
        
        // Vexday format
        const vexMatch = dateStr.match(/Vexday\s+(?:of\s+)?(\w+)?,?\s*(\d{4})\s*AV/i);
        if (vexMatch) {
            const vexdayIndex = this.vexdays.names.findIndex(n => 
                n.toLowerCase() === (vexMatch[1] || '').toLowerCase()
            );
            return {
                year: parseInt(vexMatch[2]),
                month: 0,
                day: vexdayIndex >= 0 ? vexdayIndex + 1 : 1
            };
        }
        
        return null;
    },

    /**
     * Get ordinal suffix for a number
     */
    getOrdinalSuffix(n) {
        const s = ['th', 'st', 'nd', 'rd'];
        const v = n % 100;
        return s[(v - 20) % 10] || s[v] || s[0];
    },

    /**
     * Add days to a date
     */
    addDays(day, month, year, daysToAdd) {
        let d = day;
        let m = month;
        let y = year;
        
        while (daysToAdd > 0) {
            const daysInCurrentMonth = m === 0 
                ? (this.vexdays.isVexYear(y) ? 6 : 5)
                : this.months[m - 1].days;
            
            const daysLeftInMonth = daysInCurrentMonth - d;
            
            if (daysToAdd <= daysLeftInMonth) {
                d += daysToAdd;
                daysToAdd = 0;
            } else {
                daysToAdd -= (daysLeftInMonth + 1);
                d = 1;
                m++;
                
                if (m > 10) {
                    m = 0; // Vexdays
                } else if (m === 0 && d > (this.vexdays.isVexYear(y) ? 6 : 5)) {
                    // Past Vexdays, into new year
                    m = 1;
                    d = 1;
                    y++;
                }
                
                // If we were in Vexdays and finished them
                if (m === 0) {
                    const vexdayCount = this.vexdays.isVexYear(y) ? 6 : 5;
                    if (daysToAdd >= vexdayCount) {
                        daysToAdd -= vexdayCount;
                        m = 1;
                        d = 1;
                        y++;
                    }
                }
            }
        }
        
        return { day: d, month: m, year: y };
    },

    /**
     * Calculate days between two dates
     */
    daysBetween(date1, date2) {
        const days1 = this.getTotalDaysSinceEpoch(date1.day, date1.month, date1.year);
        const days2 = this.getTotalDaysSinceEpoch(date2.day, date2.month, date2.year);
        return days2 - days1;
    },

    /**
     * Get all holidays/festivals for a given month
     */
    getMonthFestivals(month) {
        if (month === 0) {
            return this.vexdays.names.map((name, i) => ({
                day: i + 1,
                name: `Vexday of ${name}`,
                type: 'vexday'
            }));
        }
        return this.months[month - 1].festivals || [];
    },

    /**
     * Check if a specific date is a holiday
     */
    isHoliday(day, month) {
        if (month === 0) return true; // All Vexdays are special
        const monthData = this.months[month - 1];
        if (!monthData.festivals) return false;
        
        return monthData.festivals.some(f => {
            const dayMatch = f.match(/\((\d+)(?:st|nd|rd|th)?\)/);
            return dayMatch && parseInt(dayMatch[1]) === day;
        });
    }
};

export default ValdrisCalendar;
