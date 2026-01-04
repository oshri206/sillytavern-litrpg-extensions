/**
 * VALDRIS TEMPORAL-SPATIAL STATE SYSTEM (VTSS)
 * Main Extension Entry Point
 * 
 * Tracks time, date, location, and world state for Valdris LitRPG campaigns.
 * Uses a custom 13-month calendar designed by Vex.
 * 
 * @author LO & ENI
 * @version 1.0.0
 */

import { ValdrisCalendar } from './vtss-calendar.js';
import { createDefaultState, validateState } from './vtss-state.js';
import { VTSSParser } from './vtss-parser.js';
import { VTSSManager, vtssManager } from './vtss-manager.js';
import { VTSSUI, vtssUI } from './vtss-ui.js';

// Extension name for SillyTavern
const MODULE_NAME = 'valdris-vtss';

// ═══════════════════════════════════════════════════════════════
// EXTENSION STATE
// ═══════════════════════════════════════════════════════════════

const extensionState = {
  initialized: false,
  manager: vtssManager,
  ui: vtssUI,
  calendar: ValdrisCalendar,
  settings: {
    enabled: true,
    autoParseMessages: true,
    showNotifications: true,
    panelPosition: 'right', // 'right', 'left', 'float'
    debugMode: false
  }
};

// ═══════════════════════════════════════════════════════════════
// SILLYTAVERN INTEGRATION
// ═══════════════════════════════════════════════════════════════

/**
 * Hook into SillyTavern's message events
 */
function setupMessageHooks() {
  // Listen for new messages
  const messageEvents = [
    'chatMessageReceived',
    'messageReceived',
    'message_received'
  ];

  messageEvents.forEach(eventName => {
    if (typeof eventSource !== 'undefined') {
      eventSource.on(eventName, handleNewMessage);
    }
  });

  // Also try jQuery event system if available
  if (typeof $ !== 'undefined') {
    $(document).on('messageReceived', handleNewMessage);
  }

  // Fallback: observe DOM changes for new messages
  setupMutationObserver();
}

/**
 * Handle incoming messages
 */
function handleNewMessage(data) {
  if (!extensionState.settings.enabled) return;
  if (!extensionState.settings.autoParseMessages) return;

  const messageText = extractMessageText(data);
  if (!messageText) return;

  const result = extensionState.manager.processNarrative(messageText);
  
  if (result?.changed && extensionState.settings.debugMode) {
    console.log('[VTSS] State updated from message:', result);
  }
}

/**
 * Extract text from various message formats
 */
function extractMessageText(data) {
  if (typeof data === 'string') return data;
  if (data?.message) return data.message;
  if (data?.mes) return data.mes;
  if (data?.text) return data.text;
  if (data?.content) return data.content;
  return null;
}

/**
 * Mutation observer fallback for message detection
 */
function setupMutationObserver() {
  const chatContainer = document.getElementById('chat') || 
                        document.querySelector('.mes_text')?.parentElement?.parentElement;
  
  if (!chatContainer) {
    console.warn('[VTSS] Could not find chat container for observer');
    return;
  }

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const mesText = node.querySelector?.('.mes_text');
            if (mesText) {
              handleNewMessage(mesText.textContent);
            }
          }
        });
      }
    });
  });

  observer.observe(chatContainer, { childList: true, subtree: true });
}

// ═══════════════════════════════════════════════════════════════
// SETTINGS / PERSISTENCE
// ═══════════════════════════════════════════════════════════════

/**
 * Load saved state from SillyTavern's extension data
 */
function loadSavedState() {
  try {
    // Try SillyTavern's extension settings
    if (typeof extension_settings !== 'undefined' && extension_settings[MODULE_NAME]) {
      const saved = extension_settings[MODULE_NAME];
      
      if (saved.settings) {
        Object.assign(extensionState.settings, saved.settings);
      }
      
      if (saved.worldState) {
        extensionState.manager.loadState(saved.worldState);
      }
      
      console.log('[VTSS] Loaded saved state');
      return true;
    }

    // Try localStorage fallback
    const localSaved = localStorage.getItem('vtss_state');
    if (localSaved) {
      const parsed = JSON.parse(localSaved);
      if (parsed.worldState) {
        extensionState.manager.loadState(parsed.worldState);
      }
      console.log('[VTSS] Loaded state from localStorage');
      return true;
    }
  } catch (error) {
    console.error('[VTSS] Error loading saved state:', error);
  }
  
  return false;
}

/**
 * Save current state
 */
function saveState() {
  try {
    const saveData = {
      settings: extensionState.settings,
      worldState: extensionState.manager.getStateForSave()
    };

    // Save to SillyTavern extension settings
    if (typeof extension_settings !== 'undefined') {
      extension_settings[MODULE_NAME] = saveData;
      if (typeof saveSettingsDebounced === 'function') {
        saveSettingsDebounced();
      }
    }

    // Also save to localStorage as backup
    localStorage.setItem('vtss_state', JSON.stringify(saveData));
    
  } catch (error) {
    console.error('[VTSS] Error saving state:', error);
  }
}

/**
 * Setup auto-save
 */
function setupAutoSave() {
  // Save on state changes
  extensionState.manager.subscribe(() => {
    saveState();
  });

  // Save periodically
  setInterval(saveState, 60000); // Every minute

  // Save on page unload
  window.addEventListener('beforeunload', saveState);
}

// ═══════════════════════════════════════════════════════════════
// SETTINGS UI (For SillyTavern settings panel)
// ═══════════════════════════════════════════════════════════════

/**
 * Generate settings HTML for SillyTavern's extension settings panel
 */
function getSettingsHtml() {
  return `
    <div class="vtss-extension-settings">
      <div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
          <b>Valdris VTSS - World State Tracker</b>
          <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
          <div class="vtss-settings-section">
            <h4>General Settings</h4>
            <label class="checkbox_label">
              <input type="checkbox" id="vtss_enabled" ${extensionState.settings.enabled ? 'checked' : ''}>
              <span>Enable VTSS</span>
            </label>
            <label class="checkbox_label">
              <input type="checkbox" id="vtss_auto_parse" ${extensionState.settings.autoParseMessages ? 'checked' : ''}>
              <span>Auto-parse messages for time/location</span>
            </label>
            <label class="checkbox_label">
              <input type="checkbox" id="vtss_notifications" ${extensionState.settings.showNotifications ? 'checked' : ''}>
              <span>Show change notifications</span>
            </label>
            <label class="checkbox_label">
              <input type="checkbox" id="vtss_debug" ${extensionState.settings.debugMode ? 'checked' : ''}>
              <span>Debug mode</span>
            </label>
          </div>
          
          <div class="vtss-settings-section">
            <h4>Quick Actions</h4>
            <div class="vtss-button-row">
              <input type="button" id="vtss_open_panel" class="menu_button" value="Open VTSS Panel">
              <input type="button" id="vtss_reset" class="menu_button" value="Reset State">
            </div>
          </div>
          
          <div class="vtss-settings-section">
            <h4>Current State</h4>
            <div id="vtss_current_state">
              <p><strong>Date:</strong> <span id="vtss_state_date">--</span></p>
              <p><strong>Location:</strong> <span id="vtss_state_location">--</span></p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Attach settings event listeners
 */
function setupSettingsListeners() {
  // Enabled toggle
  $('#vtss_enabled').on('change', function() {
    extensionState.settings.enabled = this.checked;
    saveState();
  });

  // Auto-parse toggle
  $('#vtss_auto_parse').on('change', function() {
    extensionState.settings.autoParseMessages = this.checked;
    extensionState.manager.settings.autoParseMessages = this.checked;
    saveState();
  });

  // Notifications toggle
  $('#vtss_notifications').on('change', function() {
    extensionState.settings.showNotifications = this.checked;
    extensionState.manager.settings.notifyOnChange = this.checked;
    saveState();
  });

  // Debug toggle
  $('#vtss_debug').on('change', function() {
    extensionState.settings.debugMode = this.checked;
    extensionState.manager.settings.debugMode = this.checked;
    saveState();
  });

  // Open panel button
  $('#vtss_open_panel').on('click', function() {
    extensionState.ui.render();
  });

  // Reset button
  $('#vtss_reset').on('click', function() {
    if (confirm('Reset all VTSS state to defaults? This cannot be undone.')) {
      extensionState.manager.reset();
      updateStateDisplay();
    }
  });

  // Update state display when manager changes
  extensionState.manager.subscribe(() => {
    updateStateDisplay();
  });
}

/**
 * Update the state display in settings
 */
function updateStateDisplay() {
  const dateEl = document.getElementById('vtss_state_date');
  const locEl = document.getElementById('vtss_state_location');
  
  if (dateEl) {
    dateEl.textContent = extensionState.manager.getFormattedDate('medium');
  }
  if (locEl) {
    locEl.textContent = extensionState.manager.currentLocation;
  }
}

// ═══════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════

/**
 * Main initialization function
 */
function init() {
  if (extensionState.initialized) return;

  console.log('[VTSS] Initializing Valdris Temporal-Spatial State System...');

  // Initialize manager
  extensionState.manager.initialize();

  // Load saved state
  loadSavedState();

  // Initialize UI
  extensionState.ui.init();

  // Setup message hooks
  setupMessageHooks();

  // Setup auto-save
  setupAutoSave();

  // Mark as initialized
  extensionState.initialized = true;

  // Update settings display
  updateStateDisplay();

  console.log('[VTSS] Initialization complete!');
  console.log('[VTSS] Current date:', extensionState.manager.getFormattedDate());
  console.log('[VTSS] Current location:', extensionState.manager.currentLocation);
}

// ═══════════════════════════════════════════════════════════════
// JQUERY EXTENSION REGISTRATION (SillyTavern style)
// ═══════════════════════════════════════════════════════════════

jQuery(async () => {
  // Add settings HTML to extension settings
  const settingsHtml = getSettingsHtml();
  $('#extensions_settings').append(settingsHtml);
  
  // Setup settings listeners
  setupSettingsListeners();
  
  // Initialize the extension
  init();
});

// ═══════════════════════════════════════════════════════════════
// JOURNEY INTEGRATION - Sync time detection from narrative!
// ═══════════════════════════════════════════════════════════════

function subscribeToJourney() {
  if (!window.VJourney) {
    console.log('[VTSS] VJourney not available yet, retrying...');
    setTimeout(subscribeToJourney, 1000);
    return;
  }
  
  // Subscribe to time of day changes detected in narrative
  window.VJourney.subscribe(window.VJourney.EVENTS.TIME_CHANGED, (data) => {
    console.log('[VTSS] Time of day detected via Journey:', data.timeOfDay);
    
    // Map journey time detection to hours
    const timeMap = {
      dawn: 6,
      morning: 9,
      noon: 12,
      afternoon: 15,
      dusk: 18,
      night: 22,
    };
    
    if (data.timeOfDay && timeMap[data.timeOfDay] !== undefined) {
      const currentState = vtssManager.state;
      if (currentState?.time) {
        const targetHour = timeMap[data.timeOfDay];
        // Only adjust if significantly different (avoid constant jumps)
        const currentHour = currentState.time.hour;
        const diff = Math.abs(targetHour - currentHour);
        if (diff >= 3) {
          vtssManager.setTime(
            currentState.time.year,
            currentState.time.month,
            currentState.time.day,
            targetHour
          );
          console.log('[VTSS] Adjusted hour to match narrative:', targetHour);
        }
      }
    }
  });
  
  // Subscribe to location changes - sync location name
  window.VJourney.subscribe(window.VJourney.EVENTS.LOCATION_CHANGED, (data) => {
    if (data.location) {
      const locationName = data.location.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      vtssManager.setLocation({
        name: locationName,
        type: data.type || 'unknown',
        terrain: window.VJourney.getCurrentTerrain?.() || 'unknown',
      });
      console.log('[VTSS] Location synced from Journey:', locationName);
    }
  });
  
  console.log('[VTSS] Subscribed to Journey Tracker!');
}

// Start Journey subscription after init
setTimeout(subscribeToJourney, 1000);

// ═══════════════════════════════════════════════════════════════
// EXPORTS (For other extensions to use)
// ═══════════════════════════════════════════════════════════════

// Export for other extensions (like Diplomacy) to import
window.VTSS = {
  manager: vtssManager,
  calendar: ValdrisCalendar,
  parser: VTSSParser,
  
  // Convenience methods
  getCurrentDate: () => vtssManager.getFormattedDate(),
  getCurrentLocation: () => vtssManager.currentLocation,
  getState: () => vtssManager.state,
  
  // Subscribe to changes (for Diplomacy extension etc)
  subscribe: (callback, options) => vtssManager.subscribe(callback, options),
  
  // Manual state updates
  setTime: (year, month, day, hour) => vtssManager.setTime(year, month, day, hour),
  setLocation: (locationData) => vtssManager.setLocation(locationData),
  advanceTime: (amount, unit) => vtssManager.applyTimeSkip({ amount, unit }),
  
  // Calendar utilities
  formatDate: (day, month, year, style) => ValdrisCalendar.formatDate(day, month, year, style),
  getMonth: (identifier) => ValdrisCalendar.getMonth(identifier),
  getMoonPhase: (day) => ValdrisCalendar.getMoonPhase(day),
  getHolidays: (day, month) => ValdrisCalendar.getHolidays(day, month)
};

// Also export as ES modules for modern imports
export {
  ValdrisCalendar,
  VTSSParser,
  VTSSManager,
  vtssManager,
  VTSSUI,
  vtssUI,
  createDefaultState,
  validateState
};

export default extensionState;
