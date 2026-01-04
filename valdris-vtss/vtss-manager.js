/**
 * VALDRIS TEMPORAL-SPATIAL STATE SYSTEM - Manager
 * ================================================
 * The central controller that manages state, processes updates,
 * and broadcasts changes to subscriber extensions.
 */

import ValdrisCalendar from './vtss-calendar.js';
import VTSSParser from './vtss-parser.js';
import { createDefaultState, calculateDerivedValues, validateState, getTimeOfDay, formatTime } from './vtss-state.js';

export class VTSSManager {
    constructor() {
        this.state = createDefaultState();
        this.calendar = ValdrisCalendar;
        this.parser = VTSSParser;
        this.listeners = new Map(); // Extension subscribers
        this.initialized = false;
        this.debug = false;
        
        // Initialize with calculated values
        this.recalculateDerivedValues();
    }

    // ═══════════════════════════════════════════════════════════════
    // INITIALIZATION
    // ═══════════════════════════════════════════════════════════════

    /**
     * Initialize the manager with optional starting state
     */
    initialize(config = {}) {
        if (config.startingDate) {
            const parsed = this.calendar.parseDate(config.startingDate);
            if (parsed) {
                this.state.time.year = parsed.year;
                this.state.time.month = parsed.month;
                this.state.time.day = parsed.day;
            }
        }
        
        if (config.startingLocation) {
            Object.assign(this.state.location, config.startingLocation);
        }
        
        if (config.debug) {
            this.debug = true;
        }
        
        // Set session start
        this.state.time.sessionStartDate = this.getNumericDate();
        this.state.meta.lastUpdated = Date.now();
        
        this.recalculateDerivedValues();
        this.initialized = true;
        
        this.log('VTSS Manager initialized', this.state.time);
        
        return this;
    }

    // ═══════════════════════════════════════════════════════════════
    // NARRATIVE PARSING
    // ═══════════════════════════════════════════════════════════════

    /**
     * Process a narrative message and update state accordingly
     * @param {string} messageText - The narrative text to parse
     * @returns {object} Update result with changes made
     */
    processNarrative(messageText) {
        const parsed = this.parser.parseMessage(messageText);
        const changes = {
            timeChanged: false,
            locationChanged: false,
            daysDelta: 0,
            updates: []
        };

        if (!parsed.found && !parsed.timeSkip && !parsed.locationChange) {
            return changes;
        }

        const oldState = this.captureSnapshot();

        // Apply time updates
        if (parsed.time) {
            this.updateTime(parsed.time);
            changes.timeChanged = true;
            changes.updates.push('time');
        }

        // Apply time skip
        if (parsed.timeSkip) {
            this.applyTimeSkip(parsed.timeSkip.amount, parsed.timeSkip.unit);
            changes.timeChanged = true;
            changes.updates.push('timeSkip');
        }

        // If no explicit time skip or time update, advance by estimated narrative time
        if (!parsed.timeSkip && parsed.estimatedMinutes > 0) {
            this.advanceByNarrativeTime(parsed.estimatedMinutes);
            changes.timeChanged = true;
            changes.updates.push('narrativeTime');
            changes.minutesAdvanced = parsed.estimatedMinutes;
        }

        // Apply location updates
        if (parsed.location) {
            this.updateLocationFromParsed(parsed.location);
            changes.locationChanged = true;
            changes.updates.push('location');
        } else if (parsed.locationChange) {
            this.updateLocationFromParsed(parsed.locationChange);
            changes.locationChanged = true;
            changes.updates.push('locationChange');
        }

        // Apply weather
        if (parsed.weather) {
            this.state.environment.weather = parsed.weather;
            changes.updates.push('weather');
        }

        // Apply dungeon info
        if (parsed.dungeonInfo) {
            if (!this.state.location.dungeon) {
                this.state.location.dungeon = {};
            }
            this.state.location.dungeon.floor = parsed.dungeonInfo.floor;
            this.state.location.isDungeon = true;
            changes.updates.push('dungeon');
        }

        // Calculate days passed
        if (changes.timeChanged) {
            changes.daysDelta = this.calculateDaysDelta(
                oldState.time.lastKnownDate,
                this.state.time.lastKnownDate
            );
        }

        // Update meta
        this.state.meta.lastUpdated = Date.now();
        this.state.meta.updateSource = 'parsed';
        this.state.meta.updateConfidence = parsed.confidence;

        // Add to history
        this.addToHistory(oldState);

        // Notify listeners
        if (changes.timeChanged || changes.locationChanged) {
            this.notifyListeners(oldState, this.state, changes);
        }

        this.log('Narrative processed', changes);

        return changes;
    }

    // ═══════════════════════════════════════════════════════════════
    // TIME MANAGEMENT
    // ═══════════════════════════════════════════════════════════════

    /**
     * Update time from parsed data
     */
    updateTime(timeData) {
        if (timeData.year !== undefined) this.state.time.year = timeData.year;
        if (timeData.month !== undefined) this.state.time.month = timeData.month;
        if (timeData.day !== undefined) this.state.time.day = timeData.day;
        if (timeData.hour !== undefined) this.state.time.hour = timeData.hour;
        if (timeData.minute !== undefined) this.state.time.minute = timeData.minute;
        if (timeData.timeOfDay) {
            this.state.time.timeOfDay = timeData.timeOfDay;
            if (!timeData.hour) {
                this.state.time.hour = this.parser.estimateHourFromTimeOfDay(timeData.timeOfDay);
            }
        }

        this.recalculateDerivedValues();
    }

    /**
     * Advance time by estimated narrative minutes
     * Called after each prompt to simulate passage of in-game time
     */
    advanceByNarrativeTime(estimatedMinutes) {
        if (!estimatedMinutes || estimatedMinutes <= 0) return;
        
        this.advanceMinutes(estimatedMinutes);
        this.log(`Advanced ${estimatedMinutes} minutes from narrative`);
        
        this.recalculateDerivedValues();
    }

    /**
     * Apply a time skip
     */
    applyTimeSkip(amount, unit) {
        if (!amount || amount <= 0) return;

        const oldDate = this.getTotalDays();

        switch (unit) {
            case 'minute':
                this.advanceMinutes(amount);
                break;
            case 'hour':
                this.advanceHours(amount);
                break;
            case 'day':
                this.advanceDays(amount);
                break;
            case 'week':
                this.advanceDays(amount * 7);
                break;
            case 'octave':
                this.advanceDays(amount * 8);
                break;
            case 'month':
                this.advanceMonths(amount);
                break;
            case 'year':
                this.state.time.year += amount;
                break;
        }

        const newDate = this.getTotalDays();
        this.state.time.totalDaysPassed += Math.max(0, newDate - oldDate);

        this.recalculateDerivedValues();
    }

    /**
     * Advance time by minutes
     */
    advanceMinutes(minutes) {
        this.state.time.minute += minutes;
        while (this.state.time.minute >= 60) {
            this.state.time.minute -= 60;
            this.advanceHours(1);
        }
    }

    /**
     * Advance time by hours
     */
    advanceHours(hours) {
        this.state.time.hour += hours;
        while (this.state.time.hour >= 24) {
            this.state.time.hour -= 24;
            this.advanceDays(1);
        }
    }

    /**
     * Advance time by days
     */
    advanceDays(days) {
        let remaining = days;
        
        while (remaining > 0) {
            const currentMonth = this.state.time.month;
            let daysInMonth;
            
            if (currentMonth === 0) {
                // Vexdays period
                daysInMonth = this.calendar.vexdays.isVexYear(this.state.time.year) ? 6 : 5;
            } else {
                daysInMonth = this.calendar.months[currentMonth - 1].days;
            }
            
            const daysLeftInMonth = daysInMonth - this.state.time.day;
            
            if (remaining <= daysLeftInMonth) {
                this.state.time.day += remaining;
                remaining = 0;
            } else {
                remaining -= (daysLeftInMonth + 1);
                this.state.time.day = 1;
                this.advanceMonths(1);
            }
        }
    }

    /**
     * Advance time by months
     */
    advanceMonths(months) {
        for (let i = 0; i < months; i++) {
            if (this.state.time.month === 0) {
                // From Vexdays to Vexrise
                this.state.time.month = 1;
                this.state.time.year++;
            } else if (this.state.time.month === 10) {
                // From Longnight to Vexdays
                this.state.time.month = 0;
            } else {
                this.state.time.month++;
            }
        }
    }

    /**
     * Set time manually
     */
    setTime(timeData) {
        const oldState = this.captureSnapshot();
        
        if (timeData.year !== undefined) this.state.time.year = timeData.year;
        if (timeData.month !== undefined) this.state.time.month = timeData.month;
        if (timeData.day !== undefined) this.state.time.day = timeData.day;
        if (timeData.hour !== undefined) this.state.time.hour = timeData.hour;
        if (timeData.minute !== undefined) this.state.time.minute = timeData.minute;
        
        this.state.meta.updateSource = 'manual';
        this.state.meta.lastUpdated = Date.now();
        
        this.recalculateDerivedValues();
        this.addToHistory(oldState);
        this.notifyListeners(oldState, this.state, { timeChanged: true, locationChanged: false });
    }

    // ═══════════════════════════════════════════════════════════════
    // LOCATION MANAGEMENT
    // ═══════════════════════════════════════════════════════════════

    /**
     * Update location from parsed data
     */
    updateLocationFromParsed(parsed) {
        if (!parsed) return;

        if (parsed.raw) {
            this.state.location.specificLocation = parsed.raw;
        }
        if (parsed.primary) {
            // Try to determine if this is a settlement or specific location
            // This would ideally cross-reference with lorebook
            this.state.location.specificLocation = parsed.primary;
        }
        if (parsed.specific) {
            this.state.location.specificLocation = `${parsed.primary} - ${parsed.specific}`;
        }
    }

    /**
     * Set location manually
     */
    setLocation(locationData) {
        const oldState = this.captureSnapshot();
        
        Object.assign(this.state.location, locationData);
        
        this.state.meta.updateSource = 'manual';
        this.state.meta.lastUpdated = Date.now();
        
        // Recalculate derived location values
        this.state.location.isUrban = ['capital', 'city', 'town'].includes(this.state.location.settlementType);
        this.state.location.isWilderness = !this.state.location.settlement && !this.state.location.isDungeon;
        
        this.addToHistory(oldState);
        this.notifyListeners(oldState, this.state, { timeChanged: false, locationChanged: true });
    }

    /**
     * Start travel
     */
    startTravel(destination, mode, estimatedDays) {
        this.state.location.isInTransit = true;
        this.state.location.travelOrigin = this.state.location.specificLocation || this.state.location.settlement;
        this.state.location.travelDestination = destination;
        this.state.location.travelMode = mode;
        this.state.location.travelStartDate = this.getNumericDate();
        this.state.location.travelEstimatedDays = estimatedDays;
        this.state.context.currentActivity = 'travel';
    }

    /**
     * End travel
     */
    endTravel(arrivedLocation) {
        this.state.location.isInTransit = false;
        this.state.location.travelOrigin = null;
        this.state.location.travelDestination = null;
        this.state.location.travelMode = null;
        this.state.location.travelStartDate = null;
        this.state.location.travelEstimatedDays = null;
        this.state.context.currentActivity = 'idle';
        
        if (arrivedLocation) {
            this.setLocation(arrivedLocation);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // ENVIRONMENT MANAGEMENT
    // ═══════════════════════════════════════════════════════════════

    /**
     * Set environment conditions
     */
    setEnvironment(envData) {
        Object.assign(this.state.environment, envData);
        this.state.meta.lastUpdated = Date.now();
    }

    /**
     * Add an active environmental effect
     */
    addEnvironmentEffect(effect) {
        this.state.environment.activeEffects.push(effect);
    }

    /**
     * Remove an environmental effect
     */
    removeEnvironmentEffect(effectName) {
        this.state.environment.activeEffects = this.state.environment.activeEffects.filter(
            e => e.name !== effectName
        );
    }

    // ═══════════════════════════════════════════════════════════════
    // CONTEXT MANAGEMENT
    // ═══════════════════════════════════════════════════════════════

    /**
     * Set social context
     */
    setContext(contextData) {
        Object.assign(this.state.context, contextData);
        this.state.meta.lastUpdated = Date.now();
    }

    /**
     * Enter combat
     */
    enterCombat(enemies = [], allies = [], terrain = null) {
        this.state.context.inCombat = true;
        this.state.context.combatRound = 1;
        this.state.context.combatEnemies = enemies;
        this.state.context.combatAllies = allies;
        this.state.context.combatTerrain = terrain;
        this.state.context.currentActivity = 'combat';
    }

    /**
     * Exit combat
     */
    exitCombat() {
        this.state.context.inCombat = false;
        this.state.context.combatRound = 0;
        this.state.context.combatEnemies = [];
        this.state.context.combatAllies = [];
        this.state.context.combatTerrain = null;
        this.state.context.currentActivity = 'idle';
    }

    /**
     * Advance combat round
     */
    advanceCombatRound() {
        if (this.state.context.inCombat) {
            this.state.context.combatRound++;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // SUBSCRIBER SYSTEM
    // ═══════════════════════════════════════════════════════════════

    /**
     * Subscribe to state changes
     * @param {string} id - Unique identifier for the subscriber
     * @param {function} callback - Function to call on state change
     * @returns {function} Unsubscribe function
     */
    subscribe(id, callback) {
        this.listeners.set(id, callback);
        this.state.meta.subscriberCount = this.listeners.size;
        
        this.log(`Subscriber added: ${id}`);
        
        // Return unsubscribe function
        return () => {
            this.listeners.delete(id);
            this.state.meta.subscriberCount = this.listeners.size;
            this.log(`Subscriber removed: ${id}`);
        };
    }

    /**
     * Notify all subscribers of state change
     */
    notifyListeners(oldState, newState, changes) {
        const notification = {
            oldState,
            newState,
            changes,
            daysDelta: changes.daysDelta || this.calculateDaysDelta(
                oldState.time.lastKnownDate,
                newState.time.lastKnownDate
            ),
            timestamp: Date.now()
        };

        this.state.meta.lastBroadcast = notification.timestamp;

        for (const [id, callback] of this.listeners) {
            try {
                callback(notification);
            } catch (err) {
                this.log(`Error notifying subscriber ${id}:`, err);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // UTILITY METHODS
    // ═══════════════════════════════════════════════════════════════

    /**
     * Recalculate all derived values
     */
    recalculateDerivedValues() {
        calculateDerivedValues(this.state);
    }

    /**
     * Get total days since epoch
     */
    getTotalDays() {
        return this.calendar.getTotalDaysSinceEpoch(
            this.state.time.day,
            this.state.time.month,
            this.state.time.year
        );
    }

    /**
     * Get current date in numeric format
     */
    getNumericDate() {
        return this.calendar.formatDate(
            this.state.time.day,
            this.state.time.month,
            this.state.time.year,
            'numeric'
        );
    }

    /**
     * Get formatted current date
     */
    getFormattedDate(style = 'full') {
        return this.calendar.formatDate(
            this.state.time.day,
            this.state.time.month,
            this.state.time.year,
            style
        );
    }

    /**
     * Get formatted current time
     */
    getFormattedTime() {
        return formatTime(this.state.time.hour, this.state.time.minute);
    }

    /**
     * Calculate days between two numeric dates
     */
    calculateDaysDelta(oldDate, newDate) {
        if (!oldDate || !newDate) return 0;
        
        const old = this.calendar.parseDate(oldDate);
        const curr = this.calendar.parseDate(newDate);
        
        if (!old || !curr) return 0;
        
        return this.calendar.daysBetween(old, curr);
    }

    /**
     * Capture a snapshot of current state
     */
    captureSnapshot() {
        return JSON.parse(JSON.stringify(this.state));
    }

    /**
     * Add state to history
     */
    addToHistory(oldState) {
        if (!this.state.meta.historyEnabled) return;
        
        this.state.meta.history.unshift({
            state: oldState,
            timestamp: Date.now()
        });
        
        // Trim history if needed
        while (this.state.meta.history.length > this.state.meta.maxHistoryEntries) {
            this.state.meta.history.pop();
        }
    }

    /**
     * Undo to previous state
     */
    undo() {
        if (this.state.meta.history.length === 0) return false;
        
        const previous = this.state.meta.history.shift();
        const currentHistory = [...this.state.meta.history];
        
        this.state = previous.state;
        this.state.meta.history = currentHistory;
        
        this.recalculateDerivedValues();
        return true;
    }

    /**
     * Get current state (read-only copy)
     */
    getState() {
        return JSON.parse(JSON.stringify(this.state));
    }

    /**
     * Validate current state
     */
    validate() {
        return validateState(this.state);
    }

    /**
     * Export state for saving
     */
    exportState() {
        return JSON.stringify(this.state, null, 2);
    }

    /**
     * Import state from saved data
     */
    importState(jsonString) {
        try {
            const imported = JSON.parse(jsonString);
            this.state = imported;
            this.recalculateDerivedValues();
            return true;
        } catch (err) {
            this.log('Import failed:', err);
            return false;
        }
    }

    /**
     * Reset to default state
     */
    reset() {
        this.state = createDefaultState();
        this.recalculateDerivedValues();
        this.initialized = false;
    }

    /**
     * Debug logging
     */
    log(...args) {
        if (this.debug) {
            console.log('[VTSS]', ...args);
        }
    }
}

// Create and export singleton instance
export const vtssManager = new VTSSManager();
export default vtssManager;
