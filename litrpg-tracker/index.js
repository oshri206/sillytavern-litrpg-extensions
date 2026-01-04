/**
 * Valdris Character Tracker v4 (Rebuilt)
 * - Per-chat state (chat metadata)
 * - Hidden SYSTEM injection (AI always sees tracker)
 * - Auto-update on every assistant message
 * - Deterministic Sync/Rebuild (wipe -> seed -> replay chat)
 *
 * Install folder:
 *   SillyTavern/public/scripts/extensions/third-party/litrpg-tracker/
 */

const EXT_NAME = 'litrpg-tracker';
const EXT_FOLDER = `scripts/extensions/third-party/${EXT_NAME}`;
const META_KEY = 'vct_state_v4';

// ──────────────────────────────────────────────────────────────────────────────
// Imports (with fallbacks)
// ──────────────────────────────────────────────────────────────────────────────
let extension_settings, getContext, saveSettingsDebounced;
let eventSource, event_types;
let setExtensionPrompt, extension_prompt_types, extension_prompt_roles;

try {
  const extModule = await import('../../../extensions.js');
  extension_settings = extModule.extension_settings;
  getContext = extModule.getContext;
  saveSettingsDebounced = extModule.saveSettingsDebounced;
} catch (e) {
  console.error('[VCTv4] Failed to import extensions.js', e);
}

try {
  const scriptModule = await import('../../../../script.js');
  eventSource = scriptModule.eventSource;
  event_types = scriptModule.event_types;
  setExtensionPrompt = scriptModule.setExtensionPrompt;
  extension_prompt_types = scriptModule.extension_prompt_types;
  extension_prompt_roles = scriptModule.extension_prompt_roles;
  if (!saveSettingsDebounced) saveSettingsDebounced = scriptModule.saveSettingsDebounced;
} catch (e) {
  console.error('[VCTv4] Failed to import script.js', e);
}

// Minimal fallbacks (older builds)
extension_prompt_types ??= { NONE: -1, IN_PROMPT: 0, IN_CHAT: 1, BEFORE_PROMPT: 2 };
extension_prompt_roles ??= { SYSTEM: 0, USER: 1, ASSISTANT: 2 };

// ──────────────────────────────────────────────────────────────────────────────
// Defaults
// ──────────────────────────────────────────────────────────────────────────────
const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  injectionEnabled: true,
  autoTrackingEnabled: true,
  injectCompact: true,
  maxListItems: 60,
  abilitiesFile: `${EXT_FOLDER}/lia-abilities.md`,
});

function getSettings() {
  if (!extension_settings) return structuredClone(DEFAULT_SETTINGS);
  if (!extension_settings[EXT_NAME]) extension_settings[EXT_NAME] = structuredClone(DEFAULT_SETTINGS);
  const s = extension_settings[EXT_NAME];
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    if (!Object.hasOwn(s, k)) s[k] = DEFAULT_SETTINGS[k];
  }
  return s;
}

function saveSettings() {
  try { saveSettingsDebounced?.(); } catch { /* noop */ }
}

// ──────────────────────────────────────────────────────────────────────────────
// State model (per-chat)
// ──────────────────────────────────────────────────────────────────────────────
function newEmptyState() {
  return {
    version: 4,
    character: {
      name: 'Lia Mor',
      race: '',
      class: 'Tempest Sovereign',
      level: 30,
      alignment: '',
      overview: '',
      location: '',
    },
    stats: {
      STR: null, DEX: null, CON: null, INT: null, WIS: null, CHA: null,
    },
    resources: {
      HP: { cur: null, max: null },
      MP: { cur: null, max: null },
      SP: { cur: null, max: null },
      XP: { cur: 0, next: null },
      currencies: { Gold: 0, Silver: 0, Copper: 0 },
      regenPerMinute: { HP: null, MP: null, SP: null },
    },
    // Enhanced traits: {name, type (Innate/Acquired/Racial/Background), description, source, effect}
    traits: [],
    titles: [],        // {name,description,effect,rarity}
    modifiers: [],     // {name,description,expires,effects}
    inventory: [],     // {name,qty,notes}
    equipment: {       // slots -> {name,notes,mods}
      head: null, face: null, neck: null, shoulders: null, chest: null, back: null,
      wrists: null, hands: null, waist: null, legs: null, feet: null,
      mainhand: null, offhand: null, ring1: null, ring2: null, accessory: null
    },
    // Enhanced skills: {name, description, cooldown, cost, rank, damage, category, isPassive}
    skills: [],
    // Proficiencies: weapons, armor, tools, languages
    proficiencies: {
      weapons: [],     // {name, description}
      armor: [],       // {name, description}
      tools: [],       // {name, description}
      languages: [],   // {name, description}
    },
    // Enhanced spells: {name, description, school, defaultMana, currentMana, defaultDamage, currentDamage,
    //                   castingTime, range, duration, concentration, level, cooldown, tags}
    spells: [],
    // Spell slots tracking: { level1: {cur, max}, level2: {cur, max}, ... }
    spellSlots: {
      1: { cur: 0, max: 0 },
      2: { cur: 0, max: 0 },
      3: { cur: 0, max: 0 },
      4: { cur: 0, max: 0 },
      5: { cur: 0, max: 0 },
      6: { cur: 0, max: 0 },
      7: { cur: 0, max: 0 },
      8: { cur: 0, max: 0 },
      9: { cur: 0, max: 0 },
    },
    quests: [],        // {name,status,description,objectives,progress,notes}
    relationships: [], // {name,standing,notes,flags}
    factions: [],      // {name,standing,notes}
    locations: { current: '', discovered: [] }, // discovered: {name,notes}
    bestiary: [],      // {name,threat,notes,seenCount,loot}
    journal: [],       // {ts,text,tags}
    dice: { last: '' },
    _meta: {
      lastProcessedMsgId: 0,
      seededFromAbilities: false,
      seededFromCard: false,
      lastSyncAt: null,
    }
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Chat metadata helpers
// ──────────────────────────────────────────────────────────────────────────────

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
    console.error('[VCTv4] Error getting ST context:', e);
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
    console.warn('[VCTv4] Cannot save metadata: ST context unavailable');
    return false;
  }

  try {
    if (typeof ctx.saveMetadata === 'function') {
      await ctx.saveMetadata();
      return true;
    }
    // Older builds sometimes expose debounced saver
    if (typeof ctx.saveMetadataDebounced === 'function') {
      await ctx.saveMetadataDebounced();
      return true;
    }
    console.warn('[VCTv4] No save method available on ST context');
    return false;
  } catch (e) {
    console.error('[VCTv4] Error saving metadata:', e);
    return false;
  }
}

function getChatState() {
  const md = getChatMetadata();
  if (!md) return newEmptyState();
  if (!md[META_KEY]) md[META_KEY] = newEmptyState();
  // Upgrade path if needed
  if (!md[META_KEY].version || md[META_KEY].version < 4) md[META_KEY] = newEmptyState();
  return md[META_KEY];
}

async function commitState(state) {
  const md = getChatMetadata();
  if (md) md[META_KEY] = state;
  await saveChatMetadata();
}

// ──────────────────────────────────────────────────────────────────────────────
// UI
// ──────────────────────────────────────────────────────────────────────────────
const TAB_DEFS = [
  { key: 'character', label: 'Character', icon: '👤' },
  { key: 'traits', label: 'Traits', icon: '🧬' },
  { key: 'titles', label: 'Titles', icon: '👑' },
  { key: 'modifiers', label: 'Modifiers', icon: '📊' },
  { key: 'inventory', label: 'Inventory', icon: '🎒' },
  { key: 'equipment', label: 'Equipment', icon: '⚔️' },
  { key: 'skills', label: 'Skills', icon: '✨' },
  { key: 'spells', label: 'Spells', icon: '🔮' },
  { key: 'quests', label: 'Quests', icon: '📜' },
  { key: 'relationships', label: 'Bonds', icon: '💕' },
  { key: 'factions', label: 'Factions', icon: '🏰' },
  { key: 'locations', label: 'Locations', icon: '🗺️' },
  { key: 'bestiary', label: 'Bestiary', icon: '🐉' },
  { key: 'journal', label: 'Journal', icon: '📔' },
  { key: 'dice', label: 'Dice', icon: '🎲' },
];

const UI = {
  mounted: false,
  root: null,
  activeTab: 'character',
  // Filter states for enhanced tabs
  skillsFilter: { category: 'all', showPassive: true, showActive: true },
  spellsFilter: { school: 'all', sortBy: 'name' },
  traitsFilter: { category: 'all' },
  // Modal state
  modal: { type: null, mode: null, data: null, index: null },
};

function mountUI() {
  if (UI.mounted) return;
  UI.mounted = true;

  const host = document.body;

  const wrapper = document.createElement('div');
  wrapper.id = 'vct4_root';
  wrapper.classList.add('vct4_dock');
  // Inline positioning to avoid theme/layout interference
  wrapper.style.cssText = 'position:fixed; right:14px; bottom:120px; width:420px; max-width:92vw; z-index:999999; display:block; opacity:1; pointer-events:auto;';
  wrapper.innerHTML = `
    <div class="vct4_panel">
      <div class="vct4_header">
        <div class="vct4_title">
          <span class="vct4_badge">VCT</span>
          <span>Valdris Tracker</span>
          <span class="vct4_sub">v4</span>
        </div>
        <div class="vct4_header_actions">
          <button class="vct4_btn" id="vct4_btn_seed" title="Seed from abilities file + character card">Populate</button>
          <button class="vct4_btn vct4_btn_warn" id="vct4_btn_sync" title="Wipe state and rebuild by replaying the chat">Sync/Rebuild</button>
          <button class="vct4_btn" id="vct4_btn_settings" title="Settings">⚙️</button>
          <button class="vct4_btn" id="vct4_btn_collapse" title="Collapse">▾</button>
        </div>
      </div>

      <div class="vct4_tabs" id="vct4_tabs"></div>
      <div class="vct4_body" id="vct4_body"></div>

      <div class="vct4_footer">
        <div class="vct4_status" id="vct4_status">Ready.</div>
        <div class="vct4_footer_right">
          <label class="vct4_toggle">
            <input type="checkbox" id="vct4_toggle_enabled">
            <span>Enabled</span>
          </label>
          <label class="vct4_toggle">
            <input type="checkbox" id="vct4_toggle_inject">
            <span>Inject</span>
          </label>
          <label class="vct4_toggle">
            <input type="checkbox" id="vct4_toggle_auto">
            <span>Auto</span>
          </label>
        </div>
      </div>
    </div>

    <div class="vct4_modal" id="vct4_modal" aria-hidden="true">
      <div class="vct4_modal_card">
        <div class="vct4_modal_header">
          <div class="vct4_modal_title">Valdris Tracker Settings</div>
          <button class="vct4_btn" id="vct4_modal_close">✕</button>
        </div>
        <div class="vct4_modal_body">
          <div class="vct4_field">
            <label>Abilities file URL (relative to ST)</label>
            <input type="text" id="vct4_abilities_file" spellcheck="false">
            <div class="vct4_hint">Put <code>lia-abilities.md</code> in the extension folder. Default: <code>scripts/extensions/third-party/litrpg-tracker/lia-abilities.md</code></div>
          </div>

          <div class="vct4_field">
            <label>Max list items injected per section</label>
            <input type="number" id="vct4_max_items" min="10" max="500" step="10">
          </div>

          <div class="vct4_field vct4_row">
            <label class="vct4_toggle"><input type="checkbox" id="vct4_compact_inject"><span>Compact injection (recommended)</span></label>
          </div>

          <hr class="vct4_hr">

          <div class="vct4_actions_row">
            <button class="vct4_btn" id="vct4_btn_apply_settings">Apply</button>
            <button class="vct4_btn" id="vct4_btn_force_inject">Force Inject Now</button>
            <button class="vct4_btn vct4_btn_warn" id="vct4_btn_clear_state">Clear State (this chat)</button>
          </div>

          <div class="vct4_hint">
            <b>Tip:</b> Ask the narrator to end each response with a small <code>MECHANICS</code> block (HP/MP changes, items, quests). The tracker will read it.
          </div>
        </div>
      </div>
    </div>

    <div class="vct4_modal" id="vct4_item_modal" aria-hidden="true">
      <div class="vct4_modal_card">
        <div class="vct4_modal_header">
          <div class="vct4_modal_title" id="vct4_item_modal_title">Add Item</div>
          <button class="vct4_btn" id="vct4_item_modal_close">✕</button>
        </div>
        <div class="vct4_modal_body" id="vct4_item_modal_body">
          <!-- Dynamically populated -->
        </div>
        <div class="vct4_modal_footer">
          <div class="vct4_actions_row">
            <button class="vct4_btn vct4_btn_primary" id="vct4_item_modal_save">Save</button>
            <button class="vct4_btn" id="vct4_item_modal_cancel">Cancel</button>
            <button class="vct4_btn vct4_btn_warn" id="vct4_item_modal_delete" style="margin-left:auto;">Delete</button>
          </div>
        </div>
      </div>
    </div>
  `;
  host.appendChild(wrapper);
  UI.root = wrapper;

  // Floating launcher (always visible)
  const launcher = document.createElement("button");
  launcher.id = "vct4_launcher";
  launcher.className = "vct4_launcher";
  launcher.textContent = "VCT";
  launcher.title = "Toggle Valdris Tracker";
  launcher.addEventListener("click", () => {
    wrapper.classList.toggle("vct4_hidden");
  });
  document.body.appendChild(launcher);


  // Tabs
  const tabsEl = wrapper.querySelector('#vct4_tabs');
  for (const t of TAB_DEFS) {
    const btn = document.createElement('button');
    btn.className = 'vct4_tab';
    btn.dataset.tab = t.key;
    btn.innerHTML = `<span class="vct4_tab_icon">${t.icon}</span><span class="vct4_tab_label">${t.label}</span>`;
    btn.addEventListener('click', () => {
      UI.activeTab = t.key;
      render();
    });
    tabsEl.appendChild(btn);
  }

  // Buttons
  wrapper.querySelector('#vct4_btn_settings').addEventListener('click', () => openSettings(true));
  wrapper.querySelector('#vct4_modal_close').addEventListener('click', () => openSettings(false));
  wrapper.querySelector('#vct4_modal').addEventListener('click', (e) => {
    if (e.target.id === 'vct4_modal') openSettings(false);
  });

  // Item modal handlers
  wrapper.querySelector('#vct4_item_modal_close').addEventListener('click', () => closeItemModal());
  wrapper.querySelector('#vct4_item_modal_cancel').addEventListener('click', () => closeItemModal());
  wrapper.querySelector('#vct4_item_modal').addEventListener('click', (e) => {
    if (e.target.id === 'vct4_item_modal') closeItemModal();
  });
  wrapper.querySelector('#vct4_item_modal_save').addEventListener('click', () => saveItemModal());
  wrapper.querySelector('#vct4_item_modal_delete').addEventListener('click', () => deleteItemModal());

  wrapper.querySelector('#vct4_btn_seed').addEventListener('click', async () => {
    setStatus('Populating from sources...');
    const s = getSettings();
    const st = getChatState();
    const had = !!st._meta.seededFromAbilities;

    await seedFromSources(st, s);

    st._meta.lastProcessedMsgId = 0;

    await commitState(st);
    render();
    updateInjection();

    if (st._meta.seededFromAbilities || had) {
      setStatus('Populated.');
    } else {
      setStatus('Populate failed: could not load abilities file. Check Settings → Abilities file path.');
    }
  });

  wrapper.querySelector('#vct4_btn_sync').addEventListener('click', async () => {
    await syncRebuild();
  });


  // Collapse/expand panel
  wrapper.querySelector('#vct4_btn_collapse').addEventListener('click', () => {
    wrapper.classList.toggle('vct4_collapsed');
    const btn = wrapper.querySelector('#vct4_btn_collapse');
    btn.textContent = wrapper.classList.contains('vct4_collapsed') ? '▸' : '▾';
  });

  wrapper.querySelector('#vct4_btn_apply_settings').addEventListener('click', () => {
    const s = getSettings();
    s.abilitiesFile = wrapper.querySelector('#vct4_abilities_file').value.trim() || DEFAULT_SETTINGS.abilitiesFile;
    s.maxListItems = parseInt(wrapper.querySelector('#vct4_max_items').value || DEFAULT_SETTINGS.maxListItems, 10);
    s.injectCompact = !!wrapper.querySelector('#vct4_compact_inject').checked;
    saveSettings();
    openSettings(false);
    updateInjection();
    render();
  });

  wrapper.querySelector('#vct4_btn_force_inject').addEventListener('click', () => {
    updateInjection();
    setStatus('Injected.');
  });

  wrapper.querySelector('#vct4_btn_clear_state').addEventListener('click', async () => {
    const st = newEmptyState();
    await commitState(st);
    render();
    updateInjection();
    setStatus('State cleared for this chat.');
  });

  // Toggles
  const enabledCb = wrapper.querySelector('#vct4_toggle_enabled');
  const injectCb = wrapper.querySelector('#vct4_toggle_inject');
  const autoCb = wrapper.querySelector('#vct4_toggle_auto');

  enabledCb.addEventListener('change', () => {
    const s = getSettings();
    s.enabled = !!enabledCb.checked;
    saveSettings();
    render();
    updateInjection();
  });
  injectCb.addEventListener('change', () => {
    const s = getSettings();
    s.injectionEnabled = !!injectCb.checked;
    saveSettings();
    updateInjection();
  });
  autoCb.addEventListener('change', () => {
    const s = getSettings();
    s.autoTrackingEnabled = !!autoCb.checked;
    saveSettings();
    render();
  });

  // Initial render
  render();
  hydrateSettingsUI();
}

function openSettings(open) {
  const modal = UI.root.querySelector('#vct4_modal');
  modal.setAttribute('aria-hidden', open ? 'false' : 'true');
  if (open) hydrateSettingsUI();
}

// ──────────────────────────────────────────────────────────────────────────────
// Item Modal System (for Skills, Spells, Traits, Proficiencies)
// ──────────────────────────────────────────────────────────────────────────────
function openItemModal(type, mode, data = null, index = null) {
  UI.modal = { type, mode, data: data ? { ...data } : {}, index };
  const modal = UI.root.querySelector('#vct4_item_modal');
  const title = UI.root.querySelector('#vct4_item_modal_title');
  const body = UI.root.querySelector('#vct4_item_modal_body');
  const deleteBtn = UI.root.querySelector('#vct4_item_modal_delete');

  deleteBtn.style.display = mode === 'edit' ? 'block' : 'none';

  const labels = {
    skill: 'Skill',
    spell: 'Spell',
    trait: 'Trait',
    proficiency_weapons: 'Weapon Proficiency',
    proficiency_armor: 'Armor Proficiency',
    proficiency_tools: 'Tool Proficiency',
    proficiency_languages: 'Language',
  };

  title.textContent = `${mode === 'add' ? 'Add' : 'Edit'} ${labels[type] || 'Item'}`;
  body.innerHTML = '';
  body.appendChild(buildItemModalForm(type, UI.modal.data));
  modal.setAttribute('aria-hidden', 'false');
}

function closeItemModal() {
  UI.modal = { type: null, mode: null, data: null, index: null };
  const modal = UI.root.querySelector('#vct4_item_modal');
  modal.setAttribute('aria-hidden', 'true');
}

function buildItemModalForm(type, data) {
  const form = h('div', { class: 'vct4_modal_form' });

  const addField = (label, name, fieldType = 'text', options = {}) => {
    const field = h('div', { class: 'vct4_field' });
    const labelEl = h('label', {}, label);
    field.appendChild(labelEl);

    if (fieldType === 'select' && options.choices) {
      const select = h('select', { class: 'vct4_input', 'data-field': name });
      for (const choice of options.choices) {
        const opt = h('option', { value: choice }, choice);
        if (data[name] === choice) opt.selected = true;
        select.appendChild(opt);
      }
      field.appendChild(select);
    } else if (fieldType === 'checkbox') {
      const wrap = h('div', { class: 'vct4_row' });
      const input = h('input', { type: 'checkbox', 'data-field': name });
      input.checked = !!data[name];
      wrap.appendChild(input);
      wrap.appendChild(h('span', {}, options.checkLabel || ''));
      field.appendChild(wrap);
    } else if (fieldType === 'textarea') {
      const input = h('textarea', { class: 'vct4_input vct4_textarea', 'data-field': name, rows: 3 }, data[name] || '');
      field.appendChild(input);
    } else {
      const input = h('input', { class: 'vct4_input', type: fieldType, 'data-field': name, value: data[name] ?? '' });
      field.appendChild(input);
    }
    form.appendChild(field);
  };

  if (type === 'skill') {
    addField('Name', 'name');
    addField('Description', 'description', 'textarea');
    addField('Category', 'category', 'select', { choices: ['All', 'Combat', 'Magic', 'Utility', 'Movement', 'Defense', 'Support'] });
    addField('Passive Skill', 'isPassive', 'checkbox', { checkLabel: 'This is a passive skill' });
    addField('Cooldown', 'cooldown');
    addField('Cost (MP/SP)', 'cost');
    addField('Rank', 'rank');
    addField('Damage/Effect', 'damage');
  } else if (type === 'spell') {
    addField('Name', 'name');
    addField('Description', 'description', 'textarea');
    addField('School', 'school', 'select', { choices: ['All', 'Evocation', 'Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Illusion', 'Necromancy', 'Transmutation', 'Storm', 'Lightning', 'Fire', 'Ice', 'Nature', 'Holy', 'Shadow'] });
    addField('Level', 'level', 'number');
    addField('Default Mana Cost', 'defaultMana', 'number');
    addField('Current Mana Cost', 'currentMana', 'number');
    addField('Default Damage', 'defaultDamage');
    addField('Current Damage', 'currentDamage');
    addField('Casting Time', 'castingTime');
    addField('Range', 'range');
    addField('Duration', 'duration');
    addField('Concentration', 'concentration', 'checkbox', { checkLabel: 'Requires concentration' });
  } else if (type === 'trait') {
    addField('Name', 'name');
    addField('Description', 'description', 'textarea');
    addField('Category', 'type', 'select', { choices: ['Innate', 'Acquired', 'Racial', 'Background'] });
    addField('Source', 'source');
    addField('Effect', 'effect', 'textarea');
  } else if (type.startsWith('proficiency_')) {
    addField('Name', 'name');
    addField('Description', 'description', 'textarea');
  }

  return form;
}

async function saveItemModal() {
  const { type, mode, index } = UI.modal;
  const st = getChatState();
  const body = UI.root.querySelector('#vct4_item_modal_body');

  // Collect form data
  const data = {};
  for (const el of body.querySelectorAll('[data-field]')) {
    const field = el.dataset.field;
    if (el.type === 'checkbox') {
      data[field] = el.checked;
    } else if (el.type === 'number') {
      data[field] = el.value === '' ? null : Number(el.value);
    } else {
      data[field] = el.value?.trim() || '';
    }
  }

  // Validate name
  if (!data.name) {
    setStatus('Name is required.');
    return;
  }

  // Get target array
  let targetArray;
  if (type === 'skill') targetArray = st.skills;
  else if (type === 'spell') targetArray = st.spells;
  else if (type === 'trait') targetArray = st.traits;
  else if (type === 'proficiency_weapons') targetArray = st.proficiencies.weapons;
  else if (type === 'proficiency_armor') targetArray = st.proficiencies.armor;
  else if (type === 'proficiency_tools') targetArray = st.proficiencies.tools;
  else if (type === 'proficiency_languages') targetArray = st.proficiencies.languages;

  if (!targetArray) {
    closeItemModal();
    return;
  }

  if (mode === 'add') {
    targetArray.push(data);
  } else if (mode === 'edit' && index !== null) {
    targetArray[index] = data;
  }

  await commitState(st);
  render();
  updateInjection();
  closeItemModal();
  setStatus(`${type.charAt(0).toUpperCase() + type.slice(1)} saved.`);
}

async function deleteItemModal() {
  const { type, index } = UI.modal;
  if (index === null) {
    closeItemModal();
    return;
  }

  const st = getChatState();
  let targetArray;
  if (type === 'skill') targetArray = st.skills;
  else if (type === 'spell') targetArray = st.spells;
  else if (type === 'trait') targetArray = st.traits;
  else if (type === 'proficiency_weapons') targetArray = st.proficiencies.weapons;
  else if (type === 'proficiency_armor') targetArray = st.proficiencies.armor;
  else if (type === 'proficiency_tools') targetArray = st.proficiencies.tools;
  else if (type === 'proficiency_languages') targetArray = st.proficiencies.languages;

  if (targetArray && index < targetArray.length) {
    targetArray.splice(index, 1);
    await commitState(st);
    render();
    updateInjection();
  }

  closeItemModal();
  setStatus('Item deleted.');
}

function hydrateSettingsUI() {
  const s = getSettings();
  UI.root.querySelector('#vct4_toggle_enabled').checked = !!s.enabled;
  UI.root.querySelector('#vct4_toggle_inject').checked = !!s.injectionEnabled;
  UI.root.querySelector('#vct4_toggle_auto').checked = !!s.autoTrackingEnabled;

  UI.root.querySelector('#vct4_abilities_file').value = s.abilitiesFile;
  UI.root.querySelector('#vct4_max_items').value = s.maxListItems;
  UI.root.querySelector('#vct4_compact_inject').checked = !!s.injectCompact;
}

function setStatus(msg) {
  const el = UI.root?.querySelector('#vct4_status');
  if (el) el.textContent = msg;
}

function render() {
  if (!UI.root) return;
  const s = getSettings();
  const st = getChatState();

  // Tabs active state
  for (const btn of UI.root.querySelectorAll('.vct4_tab')) {
    btn.classList.toggle('active', btn.dataset.tab === UI.activeTab);
  }

  UI.root.querySelector('#vct4_toggle_enabled').checked = !!s.enabled;
  UI.root.querySelector('#vct4_toggle_inject').checked = !!s.injectionEnabled;
  UI.root.querySelector('#vct4_toggle_auto').checked = !!s.autoTrackingEnabled;

  const body = UI.root.querySelector('#vct4_body');
  if (!s.enabled) {
    body.innerHTML = `<div class="vct4_empty">Tracker disabled. Enable it in the footer to resume injection + updates.</div>`;
    return;
  }

  body.innerHTML = '';
  body.appendChild(renderTab(UI.activeTab, st, s));
}

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.substring(2), v);
    else if (v === false || v === null || v === undefined) continue;
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined) continue;
    if (typeof c === 'string' || typeof c === 'number' || typeof c === 'boolean') {
      el.appendChild(document.createTextNode(String(c)));
    } else {
      // assume Node
      el.appendChild(c);
    }
  }
  return el;
}

function renderKeyValueTable(rows) {
  const table = h('table', { class: 'vct4_table' });
  for (const [k, v] of rows) {
    const tr = h('tr', {}, h('td', { class: 'vct4_k' }, k), h('td', { class: 'vct4_v' }, v ?? '—'));
    table.appendChild(tr);
  }
  return table;
}

function renderList(items, renderItem, emptyText = 'None yet.') {
  if (!items || items.length === 0) return h('div', { class: 'vct4_empty' }, emptyText);
  const wrap = h('div', { class: 'vct4_list' });
  for (const it of items) wrap.appendChild(renderItem(it));
  return wrap;
}

function pill(text) { return h('span', { class: 'vct4_pill' }, text); }

function renderTab(tabKey, st, settings) {
  switch (tabKey) {
    case 'character': return renderCharacter(st);
    case 'traits': return renderTraits(st);
    case 'titles': return renderTitles(st);
    case 'modifiers': return renderModifiers(st);
    case 'inventory': return renderInventory(st);
    case 'equipment': return renderEquipment(st);
    case 'skills': return renderSkills(st);
    case 'spells': return renderSpells(st);
    case 'quests': return renderQuests(st);
    case 'relationships': return renderRelationships(st);
    case 'factions': return renderFactions(st);
    case 'locations': return renderLocations(st);
    case 'bestiary': return renderBestiary(st);
    case 'journal': return renderJournal(st);
    case 'dice': return renderDice(st);
    default: return h('div', { class: 'vct4_empty' }, 'Unknown tab.');
  }
}

function renderCharacter(st) {
  const c = st.character;
  const r = st.resources;
  const s = st.stats;

  const header = h('div', { class: 'vct4_section' },
    h('div', { class: 'vct4_h2' }, 'Profile'),
    renderKeyValueTable([
      ['Name', c.name],
      ['Class', c.class],
      ['Race', c.race],
      ['Level', c.level],
      ['Location', st.locations.current || c.location || '—'],
    ]),
  );

  const stats = h('div', { class: 'vct4_section' },
    h('div', { class: 'vct4_h2' }, 'Core Stats'),
    renderKeyValueTable([
      ['STR', s.STR], ['DEX', s.DEX], ['CON', s.CON],
      ['INT', s.INT], ['WIS', s.WIS], ['CHA', s.CHA],
    ]),
  );

  const res = h('div', { class: 'vct4_section' },
    h('div', { class: 'vct4_h2' }, 'Resources'),
    renderKeyValueTable([
      ['HP', fmtCurMax(r.HP)],
      ['MP', fmtCurMax(r.MP)],
      ['SP', fmtCurMax(r.SP)],
      ['XP', r.XP?.next ? `${r.XP.cur ?? 0} / ${r.XP.next}` : (r.XP?.cur ?? 0)],
      ['Gold', r.currencies?.Gold ?? 0],
      ['Silver', r.currencies?.Silver ?? 0],
      ['Copper', r.currencies?.Copper ?? 0],
      ['Regen (per min)', `HP ${r.regenPerMinute.HP ?? '—'} | MP ${r.regenPerMinute.MP ?? '—'} | SP ${r.regenPerMinute.SP ?? '—'}`],
    ]),
  );

  return h('div', { class: 'vct4_tab_content' }, header, stats, res);
}

function renderTraits(st) {
  const wrap = h('div', { class: 'vct4_tab_content' });

  // Filter controls
  const filterBar = h('div', { class: 'vct4_filter_bar' });

  // Category filter
  const categories = ['All', 'Innate', 'Acquired', 'Racial', 'Background'];
  const categorySelect = h('select', { class: 'vct4_select' });
  for (const cat of categories) {
    const opt = h('option', { value: cat.toLowerCase() }, cat);
    if (UI.traitsFilter.category === cat.toLowerCase()) opt.selected = true;
    categorySelect.appendChild(opt);
  }
  categorySelect.addEventListener('change', () => {
    UI.traitsFilter.category = categorySelect.value;
    render();
  });
  filterBar.appendChild(h('div', { class: 'vct4_filter_group' },
    h('span', { class: 'vct4_filter_label' }, 'Category:'),
    categorySelect
  ));

  // Add trait button
  const addBtn = h('button', { class: 'vct4_btn vct4_btn_add', onclick: () => openItemModal('trait', 'add') }, '+ Add Trait');
  filterBar.appendChild(addBtn);

  wrap.appendChild(filterBar);

  // Group traits by category
  const traitCategories = ['Innate', 'Acquired', 'Racial', 'Background'];
  const groupedTraits = {};

  for (const cat of traitCategories) {
    groupedTraits[cat] = [];
  }
  groupedTraits['Other'] = [];

  for (const trait of (st.traits || [])) {
    const traitType = trait.type || 'Other';
    const normalizedType = traitCategories.find(c => c.toLowerCase() === traitType.toLowerCase()) || 'Other';
    groupedTraits[normalizedType].push(trait);
  }

  // Filter by selected category
  const categoriesToShow = UI.traitsFilter.category === 'all'
    ? [...traitCategories, 'Other']
    : [traitCategories.find(c => c.toLowerCase() === UI.traitsFilter.category) || 'Other'];

  let totalTraits = 0;

  for (const cat of categoriesToShow) {
    const traitsInCat = groupedTraits[cat];
    if (traitsInCat.length === 0 && UI.traitsFilter.category !== 'all') continue;

    totalTraits += traitsInCat.length;

    const sec = h('div', { class: 'vct4_section' },
      h('div', { class: 'vct4_h2' }, `${cat} Traits`, pill(`${traitsInCat.length}`))
    );

    if (traitsInCat.length === 0) {
      sec.appendChild(h('div', { class: 'vct4_empty' }, `No ${cat.toLowerCase()} traits.`));
    } else {
      const list = h('div', { class: 'vct4_list' });
      traitsInCat.forEach((trait) => {
        const realIdx = st.traits.indexOf(trait);
        list.appendChild(renderTraitCard(trait, realIdx, st));
      });
      sec.appendChild(list);
    }

    wrap.appendChild(sec);
  }

  if (totalTraits === 0 && UI.traitsFilter.category === 'all') {
    wrap.appendChild(h('div', { class: 'vct4_empty' }, 'No traits loaded. Click Populate or Add Trait.'));
  }

  return wrap;
}

function renderTraitCard(trait, idx, st) {
  const card = h('div', { class: 'vct4_card vct4_card_clickable', onclick: () => openItemModal('trait', 'edit', trait, idx) });

  const title = h('div', { class: 'vct4_card_title' }, trait.name);
  if (trait.type) title.appendChild(pill(trait.type));
  card.appendChild(title);

  if (trait.description) {
    card.appendChild(h('div', { class: 'vct4_card_text' }, trait.description));
  }

  if (trait.source) {
    card.appendChild(h('div', { class: 'vct4_card_text vct4_dim' }, `Source: ${trait.source}`));
  }

  if (trait.effect) {
    card.appendChild(h('div', { class: 'vct4_card_text vct4_dim' }, `Effect: ${trait.effect}`));
  }

  return card;
}

function renderTitles(st) {
  return h('div', { class: 'vct4_tab_content' },
    h('div', { class: 'vct4_section' },
      h('div', { class: 'vct4_h2' }, 'Titles'),
      renderList(st.titles, (t) =>
        h('div', { class: 'vct4_card' },
          h('div', { class: 'vct4_card_title' }, t.name, t.rarity ? pill(t.rarity) : ''),
          t.description ? h('div', { class: 'vct4_card_text' }, t.description) : null,
          t.effect ? h('div', { class: 'vct4_card_text vct4_dim' }, `Effect: ${t.effect}`) : null,
        ), 'No titles loaded. Click Populate.'
      ),
    )
  );
}


function renderModifiers(st) {
  const wrap = h('div', { class: 'vct4_tab_content' });

  // Permanent effects = traits + titles + class baseline + equipment notes (if any)
  const permanent = [];
  permanent.push({ name: `Class: ${st.character.class || '—'}`, description: 'Baseline class features apply.', expires: 'Permanent', effects: '' });

  for (const t of (st.traits || [])) {
    permanent.push({ name: `Trait: ${t.name}`, description: t.description || '', expires: 'Permanent', effects: t.effect || '' });
  }
  for (const t of (st.titles || [])) {
    permanent.push({ name: `Title: ${t.name}`, description: t.description || '', expires: 'Permanent', effects: t.effect || '' });
  }

  // Equipment as passive modifiers (if present)
  const eq = [];
  for (const [slot, item] of Object.entries(st.equipment || {})) {
    if (!item) continue;
    eq.push({ name: `${slot.toUpperCase()}: ${item.name}`, description: item.notes || '', expires: 'Equipped', effects: item.mods || '' });
  }
  if (eq.length) {
    permanent.push(...eq);
  }

  // Temporary modifiers/statuses
  const temporary = (st.modifiers || []).map(m => ({ ...m, expires: m.expires || 'Temporary' }));

  wrap.appendChild(
    h('div', { class: 'vct4_section' },
      h('div', { class: 'vct4_h2' }, 'Permanent Effects'),
      renderList(permanent, (m) =>
        h('div', { class: 'vct4_card' },
          h('div', { class: 'vct4_card_title' }, m.name, m.expires ? pill(m.expires) : ''),
          m.description ? h('div', { class: 'vct4_card_text' }, m.description) : null,
          m.effects ? h('div', { class: 'vct4_card_text vct4_dim' }, `Effects: ${m.effects}`) : null,
        ),
        'No permanent effects found. Click Populate.'
      ),
    )
  );

  wrap.appendChild(
    h('div', { class: 'vct4_section' },
      h('div', { class: 'vct4_h2' }, 'Temporary Buffs / Debuffs'),
      renderList(temporary, (m) =>
        h('div', { class: 'vct4_card' },
          h('div', { class: 'vct4_card_title' }, m.name, m.expires ? pill(m.expires) : ''),
          m.description ? h('div', { class: 'vct4_card_text' }, m.description) : null,
          m.effects ? h('div', { class: 'vct4_card_text vct4_dim' }, `Effects: ${m.effects}`) : null,
        ),
        'No temporary modifiers.'
      ),
    )
  );

  wrap.appendChild(
    h('div', { class: 'vct4_hint' },
      'Tip: The narrator should use tags like [Status +"Poisoned"] and [Status -"Poisoned"], or include details in a MECHANICS block.'
    )
  );

  return wrap;
}

function renderInventory(st) {
  return h('div', { class: 'vct4_tab_content' },
    h('div', { class: 'vct4_section' },
      h('div', { class: 'vct4_h2' }, 'Inventory'),
      renderList(st.inventory, (it) =>
        h('div', { class: 'vct4_card' },
          h('div', { class: 'vct4_card_title' }, `${it.name}`, pill(`x${it.qty ?? 1}`)),
          it.notes ? h('div', { class: 'vct4_card_text vct4_dim' }, it.notes) : null,
        ),
        'Empty inventory.'
      ),
    )
  );
}

function renderEquipment(st) {
  const slots = Object.keys(st.equipment);
  return h('div', { class: 'vct4_tab_content' },
    h('div', { class: 'vct4_section' },
      h('div', { class: 'vct4_h2' }, 'Equipment'),
      h('div', { class: 'vct4_grid' },
        ...slots.map((slot) => {
          const item = st.equipment[slot];
          return h('div', { class: 'vct4_slot' },
            h('div', { class: 'vct4_slot_name' }, slot.toUpperCase()),
            h('div', { class: 'vct4_slot_item' }, item?.name || '—'),
            item?.notes ? h('div', { class: 'vct4_slot_notes' }, item.notes) : null,
          );
        })
      )
    )
  );
}

function renderSkills(st) {
  // Ensure proficiencies exist
  if (!st.proficiencies) {
    st.proficiencies = { weapons: [], armor: [], tools: [], languages: [] };
  }

  const wrap = h('div', { class: 'vct4_tab_content' });

  // Filter controls
  const filterBar = h('div', { class: 'vct4_filter_bar' });

  // Category filter
  const categories = ['All', 'Combat', 'Magic', 'Utility', 'Movement', 'Defense', 'Support'];
  const categorySelect = h('select', { class: 'vct4_select' });
  for (const cat of categories) {
    const opt = h('option', { value: cat.toLowerCase() }, cat);
    if (UI.skillsFilter.category === cat.toLowerCase()) opt.selected = true;
    categorySelect.appendChild(opt);
  }
  categorySelect.addEventListener('change', () => {
    UI.skillsFilter.category = categorySelect.value;
    render();
  });
  filterBar.appendChild(h('div', { class: 'vct4_filter_group' },
    h('span', { class: 'vct4_filter_label' }, 'Category:'),
    categorySelect
  ));

  // Active/Passive toggles
  const activeToggle = h('label', { class: 'vct4_toggle' });
  const activeCb = h('input', { type: 'checkbox' });
  activeCb.checked = UI.skillsFilter.showActive;
  activeCb.addEventListener('change', () => {
    UI.skillsFilter.showActive = activeCb.checked;
    render();
  });
  activeToggle.appendChild(activeCb);
  activeToggle.appendChild(h('span', {}, 'Active'));

  const passiveToggle = h('label', { class: 'vct4_toggle' });
  const passiveCb = h('input', { type: 'checkbox' });
  passiveCb.checked = UI.skillsFilter.showPassive;
  passiveCb.addEventListener('change', () => {
    UI.skillsFilter.showPassive = passiveCb.checked;
    render();
  });
  passiveToggle.appendChild(passiveCb);
  passiveToggle.appendChild(h('span', {}, 'Passive'));

  filterBar.appendChild(h('div', { class: 'vct4_filter_group' }, activeToggle, passiveToggle));

  // Add skill button
  const addBtn = h('button', { class: 'vct4_btn vct4_btn_add', onclick: () => openItemModal('skill', 'add') }, '+ Add Skill');
  filterBar.appendChild(addBtn);

  wrap.appendChild(filterBar);

  // Filter skills
  const filteredSkills = (st.skills || []).filter(sk => {
    const isPassive = !!sk.isPassive;
    if (isPassive && !UI.skillsFilter.showPassive) return false;
    if (!isPassive && !UI.skillsFilter.showActive) return false;
    if (UI.skillsFilter.category !== 'all') {
      const skCat = (sk.category || 'all').toLowerCase();
      if (skCat !== 'all' && skCat !== UI.skillsFilter.category) return false;
    }
    return true;
  });

  // Separate active and passive
  const activeSkills = filteredSkills.filter(sk => !sk.isPassive);
  const passiveSkills = filteredSkills.filter(sk => sk.isPassive);

  // Active Skills Section
  if (UI.skillsFilter.showActive) {
    const activeSec = h('div', { class: 'vct4_section' },
      h('div', { class: 'vct4_h2' }, 'Active Skills', pill(`${activeSkills.length}`))
    );
    if (activeSkills.length === 0) {
      activeSec.appendChild(h('div', { class: 'vct4_empty' }, 'No active skills match filters.'));
    } else {
      const list = h('div', { class: 'vct4_list' });
      activeSkills.forEach((sk, idx) => {
        const realIdx = st.skills.indexOf(sk);
        list.appendChild(renderSkillCard(sk, realIdx, st));
      });
      activeSec.appendChild(list);
    }
    wrap.appendChild(activeSec);
  }

  // Passive Skills Section
  if (UI.skillsFilter.showPassive) {
    const passiveSec = h('div', { class: 'vct4_section' },
      h('div', { class: 'vct4_h2' }, 'Passive Skills', pill(`${passiveSkills.length}`))
    );
    if (passiveSkills.length === 0) {
      passiveSec.appendChild(h('div', { class: 'vct4_empty' }, 'No passive skills match filters.'));
    } else {
      const list = h('div', { class: 'vct4_list' });
      passiveSkills.forEach((sk, idx) => {
        const realIdx = st.skills.indexOf(sk);
        list.appendChild(renderSkillCard(sk, realIdx, st));
      });
      passiveSec.appendChild(list);
    }
    wrap.appendChild(passiveSec);
  }

  // Proficiencies Section
  const profSec = h('div', { class: 'vct4_section' },
    h('div', { class: 'vct4_h2' }, 'Proficiencies')
  );

  const profGrid = h('div', { class: 'vct4_prof_grid' });

  // Weapons
  profGrid.appendChild(renderProficiencySubsection('Weapons', 'proficiency_weapons', st.proficiencies.weapons || []));
  // Armor
  profGrid.appendChild(renderProficiencySubsection('Armor', 'proficiency_armor', st.proficiencies.armor || []));
  // Tools
  profGrid.appendChild(renderProficiencySubsection('Tools', 'proficiency_tools', st.proficiencies.tools || []));
  // Languages
  profGrid.appendChild(renderProficiencySubsection('Languages', 'proficiency_languages', st.proficiencies.languages || []));

  profSec.appendChild(profGrid);
  wrap.appendChild(profSec);

  return wrap;
}

function renderSkillCard(sk, idx, st) {
  const card = h('div', { class: 'vct4_card vct4_card_clickable', onclick: () => openItemModal('skill', 'edit', sk, idx) });

  const title = h('div', { class: 'vct4_card_title' }, sk.name);
  if (sk.isPassive) title.appendChild(pill('Passive'));
  if (sk.category && sk.category !== 'All') title.appendChild(pill(sk.category));
  if (sk.rank) title.appendChild(pill(`Rank ${sk.rank}`));
  card.appendChild(title);

  if (sk.description) {
    card.appendChild(h('div', { class: 'vct4_card_text' }, sk.description));
  }

  const details = [];
  if (sk.cooldown) details.push(`Cooldown: ${sk.cooldown}`);
  if (sk.cost) details.push(`Cost: ${sk.cost}`);
  if (sk.damage) details.push(`Damage: ${sk.damage}`);

  if (details.length > 0) {
    card.appendChild(h('div', { class: 'vct4_card_details' }, details.join(' | ')));
  }

  // Legacy effect field
  if (sk.effect && !sk.damage) {
    card.appendChild(h('div', { class: 'vct4_card_text vct4_dim' }, `Effect: ${sk.effect}`));
  }

  return card;
}

function renderProficiencySubsection(title, type, items) {
  const subsec = h('div', { class: 'vct4_prof_subsection' });

  const header = h('div', { class: 'vct4_prof_header' },
    h('span', { class: 'vct4_prof_title' }, title),
    h('button', { class: 'vct4_btn vct4_btn_small', onclick: () => openItemModal(type, 'add') }, '+')
  );
  subsec.appendChild(header);

  if (!items || items.length === 0) {
    subsec.appendChild(h('div', { class: 'vct4_prof_empty' }, 'None'));
  } else {
    const list = h('div', { class: 'vct4_prof_list' });
    items.forEach((item, idx) => {
      const itemEl = h('div', { class: 'vct4_prof_item', onclick: () => openItemModal(type, 'edit', item, idx) },
        h('span', { class: 'vct4_prof_name' }, item.name),
        item.description ? h('span', { class: 'vct4_prof_desc' }, item.description) : null
      );
      list.appendChild(itemEl);
    });
    subsec.appendChild(list);
  }

  return subsec;
}

function renderSpells(st) {
  // Ensure spellSlots exist
  if (!st.spellSlots) {
    st.spellSlots = {
      1: { cur: 0, max: 0 }, 2: { cur: 0, max: 0 }, 3: { cur: 0, max: 0 },
      4: { cur: 0, max: 0 }, 5: { cur: 0, max: 0 }, 6: { cur: 0, max: 0 },
      7: { cur: 0, max: 0 }, 8: { cur: 0, max: 0 }, 9: { cur: 0, max: 0 },
    };
  }

  const wrap = h('div', { class: 'vct4_tab_content' });

  // Filter and sort controls
  const filterBar = h('div', { class: 'vct4_filter_bar' });

  // School filter
  const schools = ['All', 'Evocation', 'Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Illusion', 'Necromancy', 'Transmutation', 'Storm', 'Lightning', 'Fire', 'Ice', 'Nature', 'Holy', 'Shadow'];
  const schoolSelect = h('select', { class: 'vct4_select' });
  for (const school of schools) {
    const opt = h('option', { value: school.toLowerCase() }, school);
    if (UI.spellsFilter.school === school.toLowerCase()) opt.selected = true;
    schoolSelect.appendChild(opt);
  }
  schoolSelect.addEventListener('change', () => {
    UI.spellsFilter.school = schoolSelect.value;
    render();
  });
  filterBar.appendChild(h('div', { class: 'vct4_filter_group' },
    h('span', { class: 'vct4_filter_label' }, 'School:'),
    schoolSelect
  ));

  // Sort options
  const sortOptions = [
    { value: 'name', label: 'Name' },
    { value: 'level', label: 'Level' },
    { value: 'school', label: 'School' },
    { value: 'mana', label: 'Mana Cost' },
  ];
  const sortSelect = h('select', { class: 'vct4_select' });
  for (const opt of sortOptions) {
    const optEl = h('option', { value: opt.value }, opt.label);
    if (UI.spellsFilter.sortBy === opt.value) optEl.selected = true;
    sortSelect.appendChild(optEl);
  }
  sortSelect.addEventListener('change', () => {
    UI.spellsFilter.sortBy = sortSelect.value;
    render();
  });
  filterBar.appendChild(h('div', { class: 'vct4_filter_group' },
    h('span', { class: 'vct4_filter_label' }, 'Sort:'),
    sortSelect
  ));

  // Add spell button
  const addBtn = h('button', { class: 'vct4_btn vct4_btn_add', onclick: () => openItemModal('spell', 'add') }, '+ Add Spell');
  filterBar.appendChild(addBtn);

  wrap.appendChild(filterBar);

  // Spell Slots Section
  const slotsSec = h('div', { class: 'vct4_section' },
    h('div', { class: 'vct4_h2' }, 'Spell Slots')
  );
  const slotsGrid = h('div', { class: 'vct4_slots_grid' });

  for (let level = 1; level <= 9; level++) {
    const slot = st.spellSlots[level] || { cur: 0, max: 0 };
    if (slot.max > 0 || level <= 5) {
      const slotEl = h('div', { class: 'vct4_slot_tracker' });
      slotEl.appendChild(h('div', { class: 'vct4_slot_level' }, `Lv ${level}`));

      const controls = h('div', { class: 'vct4_slot_controls' });

      const minusBtn = h('button', { class: 'vct4_btn vct4_btn_tiny', onclick: async () => {
        if (slot.cur > 0) {
          slot.cur--;
          await commitState(st);
          render();
          updateInjection();
        }
      }}, '-');

      const display = h('span', { class: 'vct4_slot_display' }, `${slot.cur}/${slot.max}`);

      const plusBtn = h('button', { class: 'vct4_btn vct4_btn_tiny', onclick: async () => {
        if (slot.cur < slot.max) {
          slot.cur++;
          await commitState(st);
          render();
          updateInjection();
        }
      }}, '+');

      const maxInput = h('input', {
        class: 'vct4_input vct4_input_tiny',
        type: 'number',
        min: 0,
        max: 20,
        value: slot.max
      });
      maxInput.addEventListener('change', async () => {
        slot.max = Math.max(0, Number(maxInput.value) || 0);
        if (slot.cur > slot.max) slot.cur = slot.max;
        await commitState(st);
        render();
        updateInjection();
      });

      controls.appendChild(minusBtn);
      controls.appendChild(display);
      controls.appendChild(plusBtn);
      controls.appendChild(h('span', { class: 'vct4_slot_max_label' }, 'max:'));
      controls.appendChild(maxInput);

      slotEl.appendChild(controls);
      slotsGrid.appendChild(slotEl);
    }
  }

  slotsSec.appendChild(slotsGrid);

  // Rest button to restore all slots
  const restBtn = h('button', { class: 'vct4_btn', onclick: async () => {
    for (let level = 1; level <= 9; level++) {
      if (st.spellSlots[level]) {
        st.spellSlots[level].cur = st.spellSlots[level].max;
      }
    }
    await commitState(st);
    render();
    updateInjection();
    setStatus('Spell slots restored.');
  }}, 'Long Rest (Restore All)');
  slotsSec.appendChild(h('div', { class: 'vct4_row', style: 'margin-top: 8px;' }, restBtn));

  wrap.appendChild(slotsSec);

  // Filter and sort spells
  let filteredSpells = (st.spells || []).filter(sp => {
    if (UI.spellsFilter.school !== 'all') {
      const spSchool = (sp.school || '').toLowerCase();
      if (spSchool !== UI.spellsFilter.school) return false;
    }
    return true;
  });

  // Sort
  filteredSpells = [...filteredSpells].sort((a, b) => {
    switch (UI.spellsFilter.sortBy) {
      case 'level':
        return (a.level || 0) - (b.level || 0);
      case 'school':
        return (a.school || '').localeCompare(b.school || '');
      case 'mana':
        return (a.currentMana ?? a.defaultMana ?? 999) - (b.currentMana ?? b.defaultMana ?? 999);
      default:
        return (a.name || '').localeCompare(b.name || '');
    }
  });

  // Spells list
  const spellsSec = h('div', { class: 'vct4_section' },
    h('div', { class: 'vct4_h2' }, 'Spells', pill(`${filteredSpells.length}`))
  );

  if (filteredSpells.length === 0) {
    spellsSec.appendChild(h('div', { class: 'vct4_empty' }, 'No spells match filters. Click Populate or Add Spell.'));
  } else {
    const list = h('div', { class: 'vct4_list' });
    filteredSpells.forEach((sp) => {
      const realIdx = st.spells.indexOf(sp);
      list.appendChild(renderSpellCard(sp, realIdx, st));
    });
    spellsSec.appendChild(list);
  }

  wrap.appendChild(spellsSec);
  return wrap;
}

function renderSpellCard(sp, idx, st) {
  const card = h('div', { class: 'vct4_card vct4_card_clickable', onclick: () => openItemModal('spell', 'edit', sp, idx) });

  const top = h('div', { class: 'vct4_card_title' }, sp.name);
  if (sp.school) top.appendChild(pill(sp.school));
  if (sp.level) top.appendChild(pill(`Lv ${sp.level}`));
  if (sp.concentration) top.appendChild(pill('Conc.'));
  card.appendChild(top);

  if (sp.description) {
    card.appendChild(h('div', { class: 'vct4_card_text' }, sp.description));
  }

  // Spell details grid
  const grid = h('div', { class: 'vct4_spell_grid' });

  // Mana costs
  grid.appendChild(h('div', { class: 'vct4_spell_k' }, 'Mana Cost'));
  const manaCur = sp.currentMana ?? sp.defaultMana;
  const manaDefault = sp.defaultMana;
  const manaDisplay = manaCur !== manaDefault && manaDefault != null
    ? `${manaCur ?? '—'} (default: ${manaDefault})`
    : `${manaCur ?? '—'}`;
  grid.appendChild(h('div', { class: 'vct4_spell_v' }, manaDisplay));

  // Damage
  if (sp.defaultDamage || sp.currentDamage) {
    grid.appendChild(h('div', { class: 'vct4_spell_k' }, 'Damage'));
    const dmgCur = sp.currentDamage || sp.defaultDamage;
    const dmgDefault = sp.defaultDamage;
    const dmgDisplay = sp.currentDamage && sp.currentDamage !== dmgDefault
      ? `${dmgCur} (default: ${dmgDefault})`
      : `${dmgCur}`;
    grid.appendChild(h('div', { class: 'vct4_spell_v' }, dmgDisplay));
  }

  // Legacy effect fields
  if (sp.defaultEffect || sp.currentEffect) {
    grid.appendChild(h('div', { class: 'vct4_spell_k' }, 'Effect'));
    const effCur = sp.currentEffect || sp.defaultEffect;
    const effDefault = sp.defaultEffect;
    const effDisplay = sp.currentEffect && sp.currentEffect !== effDefault
      ? `${effCur} (default: ${effDefault})`
      : `${effCur}`;
    grid.appendChild(h('div', { class: 'vct4_spell_v' }, effDisplay));
  }

  // Additional details
  if (sp.castingTime) {
    grid.appendChild(h('div', { class: 'vct4_spell_k' }, 'Cast Time'));
    grid.appendChild(h('div', { class: 'vct4_spell_v' }, sp.castingTime));
  }
  if (sp.range) {
    grid.appendChild(h('div', { class: 'vct4_spell_k' }, 'Range'));
    grid.appendChild(h('div', { class: 'vct4_spell_v' }, sp.range));
  }
  if (sp.duration) {
    grid.appendChild(h('div', { class: 'vct4_spell_k' }, 'Duration'));
    grid.appendChild(h('div', { class: 'vct4_spell_v' }, sp.duration));
  }
  if (sp.cooldown) {
    grid.appendChild(h('div', { class: 'vct4_spell_k' }, 'Cooldown'));
    grid.appendChild(h('div', { class: 'vct4_spell_v' }, sp.cooldown));
  }

  card.appendChild(grid);
  return card;
}

function spellEditNumber(sp, field, st) {
  const input = h('input', { class: 'vct4_input', type: 'number', value: (sp[field] ?? ''), min: 0, step: 1 });
  input.addEventListener('change', async () => {
    sp[field] = input.value === '' ? null : Number(input.value);
    await commitState(st);
    updateInjection();
  });
  return input;
}

function spellEditText(sp, field, st) {
  const input = h('input', { class: 'vct4_input', type: 'text', value: (sp[field] ?? ''), spellcheck: 'false' });
  input.addEventListener('change', async () => {
    sp[field] = input.value.trim();
    await commitState(st);
    updateInjection();
  });
  return input;
}

function renderQuests(st) {
  return h('div', { class: 'vct4_tab_content' },
    h('div', { class: 'vct4_section' },
      h('div', { class: 'vct4_h2' }, 'Quests'),
      renderList(st.quests, (q) =>
        h('div', { class: 'vct4_card' },
          h('div', { class: 'vct4_card_title' }, q.name, q.status ? pill(q.status) : ''),
          q.description ? h('div', { class: 'vct4_card_text' }, q.description) : null,
          q.objectives?.length ? h('div', { class: 'vct4_card_text vct4_dim' }, `Objectives: ${q.objectives.join(' | ')}`) : null,
          q.notes ? h('div', { class: 'vct4_card_text vct4_dim' }, q.notes) : null,
        ),
        'No quests yet.'
      ),
    )
  );
}

function renderRelationships(st) {
  return h('div', { class: 'vct4_tab_content' },
    h('div', { class: 'vct4_section' },
      h('div', { class: 'vct4_h2' }, 'Bonds / Relationships'),
      renderList(st.relationships, (b) =>
        h('div', { class: 'vct4_card' },
          h('div', { class: 'vct4_card_title' }, b.name, b.standing ? pill(b.standing) : ''),
          b.notes ? h('div', { class: 'vct4_card_text' }, b.notes) : null,
          b.flags?.length ? h('div', { class: 'vct4_card_text vct4_dim' }, `Flags: ${b.flags.join(', ')}`) : null,
        ),
        'No bonds yet.'
      ),
    )
  );
}

function renderFactions(st) {
  return h('div', { class: 'vct4_tab_content' },
    h('div', { class: 'vct4_section' },
      h('div', { class: 'vct4_h2' }, 'Factions'),
      renderList(st.factions, (f) =>
        h('div', { class: 'vct4_card' },
          h('div', { class: 'vct4_card_title' }, f.name, f.standing ? pill(f.standing) : ''),
          f.notes ? h('div', { class: 'vct4_card_text' }, f.notes) : null,
        ),
        'No factions yet.'
      ),
    )
  );
}

function renderLocations(st) {
  const current = st.locations.current || '—';
  return h('div', { class: 'vct4_tab_content' },
    h('div', { class: 'vct4_section' },
      h('div', { class: 'vct4_h2' }, 'Current Location'),
      h('div', { class: 'vct4_big' }, current),
    ),
    h('div', { class: 'vct4_section' },
      h('div', { class: 'vct4_h2' }, 'Discovered Locations'),
      renderList(st.locations.discovered, (loc) =>
        h('div', { class: 'vct4_card' },
          h('div', { class: 'vct4_card_title' }, loc.name),
          loc.notes ? h('div', { class: 'vct4_card_text vct4_dim' }, loc.notes) : null,
        ),
        'No locations discovered yet.'
      ),
    )
  );
}

function renderBestiary(st) {
  return h('div', { class: 'vct4_tab_content' },
    h('div', { class: 'vct4_section' },
      h('div', { class: 'vct4_h2' }, 'Bestiary'),
      renderList(st.bestiary, (c) =>
        h('div', { class: 'vct4_card' },
          h('div', { class: 'vct4_card_title' }, c.name, c.threat ? pill(c.threat) : ''),
          c.notes ? h('div', { class: 'vct4_card_text' }, c.notes) : null,
          (c.seenCount != null) ? h('div', { class: 'vct4_card_text vct4_dim' }, `Seen: ${c.seenCount}`) : null,
        ),
        'No creatures recorded yet.'
      ),
    )
  );
}

function renderJournal(st) {
  return h('div', { class: 'vct4_tab_content' },
    h('div', { class: 'vct4_section' },
      h('div', { class: 'vct4_h2' }, 'Journal'),
      renderList(st.journal.slice().reverse(), (j) =>
        h('div', { class: 'vct4_card' },
          h('div', { class: 'vct4_card_title' }, new Date(j.ts).toLocaleString(), j.tags?.length ? pill(j.tags.join(',')) : ''),
          h('div', { class: 'vct4_card_text' }, j.text),
        ),
        'No journal entries yet.'
      ),
    )
  );
}

function renderDice(st) {
  const out = h('div', { class: 'vct4_tab_content' });
  const sec = h('div', { class: 'vct4_section' },
    h('div', { class: 'vct4_h2' }, 'Dice Roller'),
  );

  const input = h('input', { class: 'vct4_input', type: 'text', value: '1d20', spellcheck: 'false' });
  const btn = h('button', { class: 'vct4_btn', onclick: async () => {
    const expr = input.value.trim();
    const res = roll(expr);
    st.dice.last = `${expr} = ${res.total} (${res.detail})`;
    st.journal.push({ ts: Date.now(), text: `Rolled ${st.dice.last}`, tags: ['dice'] });
    await commitState(st);
    render();
    updateInjection();
  }}, 'Roll');
  const last = h('div', { class: 'vct4_big vct4_mono' }, st.dice.last || '—');

  sec.appendChild(h('div', { class: 'vct4_row' }, input, btn));
  sec.appendChild(h('div', { class: 'vct4_hint' }, 'Supports NdM+K, e.g. 2d6+3.'));
  sec.appendChild(last);
  out.appendChild(sec);
  return out;
}

// ──────────────────────────────────────────────────────────────────────────────
// Injection (Hidden SYSTEM prompt only)
// ──────────────────────────────────────────────────────────────────────────────
function updateInjection() {
  const s = getSettings();
  if (!s.enabled || !s.injectionEnabled) {
    try {
      setExtensionPrompt?.(EXT_NAME, '', extension_prompt_types.IN_PROMPT, 0, true, extension_prompt_roles.SYSTEM);
    } catch {}
    return;
  }

  const st = getChatState();
  const prompt = buildInjectedPrompt(st, s);

  try {
    setExtensionPrompt?.(
      EXT_NAME,
      prompt,
      extension_prompt_types.IN_PROMPT,
      0,
      true,
      extension_prompt_roles.SYSTEM
    );
  } catch (e) {
    console.error('[VCTv4] Injection failed', e);
  }
}

function buildInjectedPrompt(st, s) {
  const max = Math.max(10, Number(s.maxListItems || DEFAULT_SETTINGS.maxListItems));
  const compact = !!s.injectCompact;

  const lines = [];
  lines.push(`[VALDRIS TRACKER — SYSTEM MEMORY | DO NOT PRINT]`);
  lines.push(`You MUST treat the following state as authoritative game truth.`);
  lines.push(`If you change any tracked value, end your response with a small MECHANICS block (bullet list) so the tracker can parse updates.`);
  lines.push(`MECHANICS block format (examples):`);
  lines.push(`- [HP -10] - [MP -20] - [Gold +50]`);
  lines.push(`- [Item +\"Storm Crystal\" x1] / [Item -\"Rope\" x1]`);
  lines.push(`- [Quest +\"Name\" status=Active] / [Quest \"Name\" status=Completed]`);
  lines.push(`- [Status +\"Poisoned\"] / [Status -\"Poisoned\"]`);
  lines.push(`- [Location = \"Stormkeep Gate\"]`);
  lines.push(`- [Spell \"Lightning Bolt\" current_mp=8 current_effect=\"3d8 + Burn\"]`);
  lines.push(`Never fabricate changes: only output MECHANICS entries when a change actually occurred.`);

  // Character
  lines.push(``);
  lines.push(`== CHARACTER ==`);
  lines.push(`Name: ${st.character.name || '—'} | Class: ${st.character.class || '—'} | Race: ${st.character.race || '—'} | Level: ${st.character.level ?? '—'}`);
  if (st.locations.current) lines.push(`Location: ${st.locations.current}`);

  // Stats/resources
  lines.push(``);
  lines.push(`== STATS ==`);
  lines.push(`STR ${fmt(st.stats.STR)} | DEX ${fmt(st.stats.DEX)} | CON ${fmt(st.stats.CON)} | INT ${fmt(st.stats.INT)} | WIS ${fmt(st.stats.WIS)} | CHA ${fmt(st.stats.CHA)}`);
  lines.push(`HP ${fmtCurMax(st.resources.HP)} | MP ${fmtCurMax(st.resources.MP)} | SP ${fmtCurMax(st.resources.SP)} | XP ${st.resources.XP?.next ? `${st.resources.XP.cur ?? 0}/${st.resources.XP.next}` : (st.resources.XP?.cur ?? 0)}`);
  lines.push(`Gold ${st.resources.currencies.Gold ?? 0} | Silver ${st.resources.currencies.Silver ?? 0} | Copper ${st.resources.currencies.Copper ?? 0}`);
  lines.push(`Regen/min: HP ${fmt(st.resources.regenPerMinute.HP)} | MP ${fmt(st.resources.regenPerMinute.MP)} | SP ${fmt(st.resources.regenPerMinute.SP)}`);

  // Skills (enhanced with categories)
  lines.push(``);
  lines.push(`== SKILLS ==`);
  const activeSkills = (st.skills || []).filter(sk => !sk.isPassive);
  const passiveSkills = (st.skills || []).filter(sk => sk.isPassive);

  if (!st.skills?.length) {
    lines.push(`(none)`);
  } else {
    if (activeSkills.length) {
      lines.push(`Active Skills:`);
      for (const sk of activeSkills.slice(0, Math.min(max, 30))) {
        const details = [sk.cooldown && `CD:${sk.cooldown}`, sk.cost && `Cost:${sk.cost}`, sk.damage && `Dmg:${sk.damage}`].filter(Boolean).join(' ');
        lines.push(`- ${sk.name}${sk.rank ? ` [Rank ${sk.rank}]` : ''}: ${truncate(sk.description || sk.effect, 120)}${details ? ` | ${details}` : ''}`);
      }
    }
    if (passiveSkills.length) {
      lines.push(`Passive Skills:`);
      for (const sk of passiveSkills.slice(0, Math.min(max, 20))) {
        lines.push(`- ${sk.name}: ${truncate(sk.description || sk.effect, 140)}`);
      }
    }
  }

  // Proficiencies
  const prof = st.proficiencies || {};
  const hasProf = (prof.weapons?.length || prof.armor?.length || prof.tools?.length || prof.languages?.length);
  if (hasProf) {
    lines.push(``);
    lines.push(`== PROFICIENCIES ==`);
    if (prof.weapons?.length) lines.push(`Weapons: ${prof.weapons.map(p => p.name).join(', ')}`);
    if (prof.armor?.length) lines.push(`Armor: ${prof.armor.map(p => p.name).join(', ')}`);
    if (prof.tools?.length) lines.push(`Tools: ${prof.tools.map(p => p.name).join(', ')}`);
    if (prof.languages?.length) lines.push(`Languages: ${prof.languages.map(p => p.name).join(', ')}`);
  }

  // Spell Slots
  if (st.spellSlots) {
    const slotsWithMax = Object.entries(st.spellSlots).filter(([_, slot]) => slot.max > 0);
    if (slotsWithMax.length) {
      lines.push(``);
      lines.push(`== SPELL SLOTS ==`);
      lines.push(slotsWithMax.map(([lvl, slot]) => `Lv${lvl}: ${slot.cur}/${slot.max}`).join(' | '));
    }
  }

  // Spells (enhanced with damage, casting time, range, duration, concentration)
  lines.push(``);
  lines.push(`== SPELLS ==`);
  if (!st.spells.length) {
    lines.push(`(none)`);
  } else {
    const spells = st.spells.slice(0, max);
    for (const sp of spells) {
      if (compact) {
        const dmg = sp.currentDamage || sp.defaultDamage;
        const mana = sp.currentMana ?? sp.defaultMana;
        const extras = [sp.castingTime && `cast:${sp.castingTime}`, sp.range && `range:${sp.range}`, sp.duration && `dur:${sp.duration}`, sp.concentration && 'CONC'].filter(Boolean).join(' ');
        lines.push(`- ${sp.name}${sp.school ? ` [${sp.school}]` : ''}: MP=${fmt(mana)}${dmg ? ` Dmg=${dmg}` : ''} | ${truncate(sp.description, 100)}${extras ? ` | ${extras}` : ''}`);
      } else {
        lines.push(`- ${sp.name}${sp.school ? ` [${sp.school}]` : ''}${sp.concentration ? ' (Concentration)' : ''}`);
        lines.push(`  desc: ${sp.description || '—'}`);
        lines.push(`  mana: ${fmt(sp.currentMana ?? sp.defaultMana)} (default: ${fmt(sp.defaultMana)})`);
        if (sp.currentDamage || sp.defaultDamage) lines.push(`  damage: ${sp.currentDamage || sp.defaultDamage} (default: ${sp.defaultDamage || '—'})`);
        if (sp.defaultEffect || sp.currentEffect) lines.push(`  effect: ${sp.currentEffect || sp.defaultEffect}`);
        if (sp.castingTime) lines.push(`  cast_time: ${sp.castingTime}`);
        if (sp.range) lines.push(`  range: ${sp.range}`);
        if (sp.duration) lines.push(`  duration: ${sp.duration}`);
      }
    }
    if (st.spells.length > max) lines.push(`(+${st.spells.length - max} more spells not shown)`);
  }

  // Traits (enhanced with categories and source)
  lines.push(``);
  lines.push(`== TRAITS ==`);
  if (!st.traits.length) lines.push(`(none)`);
  else {
    const traitsByType = {};
    for (const t of st.traits) {
      const type = t.type || 'Other';
      if (!traitsByType[type]) traitsByType[type] = [];
      traitsByType[type].push(t);
    }
    for (const [type, traits] of Object.entries(traitsByType)) {
      lines.push(`${type}:`);
      for (const t of traits.slice(0, Math.min(max, 20))) {
        const source = t.source ? ` (${t.source})` : '';
        lines.push(`- ${t.name}${source}: ${truncate(t.effect || t.description, 160)}`);
      }
    }
    if (st.traits.length > 40) lines.push(`(+${st.traits.length - 40} more traits not shown)`);
  }

  lines.push(``);
  lines.push(`== TITLES ==`);
  if (!st.titles.length) lines.push(`(none)`);
  else {
    for (const t of st.titles.slice(0, Math.min(max, 25))) lines.push(`- ${t.name}: ${truncate(t.effect || t.description, 180)}`);
    if (st.titles.length > 25) lines.push(`(+${st.titles.length - 25} more titles not shown)`);
  }

  lines.push(``);
  lines.push(`== MODIFIERS ==`);
  if (!st.modifiers.length) lines.push(`(none)`);
  else {
    for (const m of st.modifiers.slice(0, Math.min(max, 25))) lines.push(`- ${m.name}: ${truncate(m.effects || m.description, 180)}`);
    if (st.modifiers.length > 25) lines.push(`(+${st.modifiers.length - 25} more modifiers not shown)`);
  }

  // Inventory / quests (top-level)
  lines.push(``);
  lines.push(`== INVENTORY ==`);
  if (!st.inventory.length) lines.push(`(empty)`);
  else {
    for (const it of st.inventory.slice(0, max)) lines.push(`- ${it.name} x${it.qty ?? 1}`);
    if (st.inventory.length > max) lines.push(`(+${st.inventory.length - max} more items not shown)`);
  }

  lines.push(``);
  lines.push(`== QUESTS ==`);
  if (!st.quests.length) lines.push(`(none)`);
  else {
    for (const q of st.quests.slice(0, max)) lines.push(`- ${q.name} [${q.status || 'Active'}]`);
  }

  lines.push(``);
  lines.push(`[END VALDRIS TRACKER]`);
  return lines.join('\n');
}

// ──────────────────────────────────────────────────────────────────────────────
// Seeding from sources
// ──────────────────────────────────────────────────────────────────────────────
async function seedFromSources(st, settings) {
  // Abilities file is the primary source of truth for Lia (stats/skills/spells/traits/titles)
  await seedFromAbilitiesFile(st, settings);
  // Attempt to seed from character card if possible (optional)
  await seedFromCharacterCard(st);
}

async function seedFromCharacterCard(st) {
  try {
    const ctx = getSTContext();
    const char = ctx?.characters?.[ctx?.characterId];
    if (!char) return;
    // Prefer name/class/race if present in card extensions, else keep Lia defaults.
    if (char.name && !st._meta.seededFromCard) {
      // Keep Lia Mor if the card is the narrator/system card. Only override if it looks like a sheet.
      const looksLikeSheet = /HP\s*\d+|MP\s*\d+|STR\s*\d+|Level\s*\d+/i.test(char.description ?? '') ||
        /RACE|CLASS|LEVEL|STATS/i.test(char.description ?? '');
      if (looksLikeSheet) {
        st.character.name = char.name;
      }
      st._meta.seededFromCard = true;
    }
  } catch {}
}

async function seedFromAbilitiesFile(st, settings) {
    let url = settings.abilitiesFile || DEFAULT_SETTINGS.abilitiesFile;
  // Ensure correct path for fetch (SillyTavern serves from web root)
  if (url && !/^https?:\/\//i.test(url)) {
    url = url.startsWith('/') ? url : `/${url}`;
  }
  let text = '';
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    text = await res.text();
  } catch (e) {
    console.warn('[VCTv4] Failed to fetch abilities file:', url, e);
    // Don't clear existing state; just keep defaults
    return;
  }

  // Parse sections
  const parsed = parseLiaAbilities(text);
  if (parsed._classHint) st.character.class = parsed._classHint;
  // Character identity
  if (parsed.name) st.character.name = parsed.name;
  if (parsed.level != null) st.character.level = parsed.level;

  // Stats/resources/regen
  if (parsed.stats) st.stats = { ...st.stats, ...parsed.stats };
  if (parsed.resources) st.resources = deepMerge(st.resources, parsed.resources);

  // Tabs content
  if (parsed.traits?.length) st.traits = parsed.traits;
  if (parsed.titles?.length) st.titles = parsed.titles;
  if (parsed.skills?.length) st.skills = parsed.skills;

  // Spells with default/current fields
  if (parsed.spells?.length) st.spells = parsed.spells;

  st._meta.seededFromAbilities = true;
}

// ──────────────────────────────────────────────────────────────────────────────
// Parser: lia-abilities.md  (robust for your provided format)
// ──────────────────────────────────────────────────────────────────────────────
function parseLiaAbilities(md) {
  const out = {
    name: null,
    level: null,
    _classHint: null,
    stats: {},
    resources: null,
    traits: [],
    titles: [],
    skills: [],
    spells: [],
  };

  // Heading like: "# LIA MOR — TEMPEST SOVEREIGN"
  const top = md.match(/^#\s+(.+?)\s*$/m);
  if (top) {
    const head = top[1].trim();
    const parts = head.split(/—|–|-/).map(x => x.trim()).filter(Boolean);
    if (parts.length >= 1) out.name = parts[0];
    if (parts.length >= 2) out._classHint = parts[1];
  }

  const lvl = md.match(/Level\s+(\d+)/i);
  if (lvl) out.level = Number(lvl[1]);

  // Parse STARTING STATISTICS markdown tables (your file uses tables)
  const statsBlock = sliceBetween(md, '# STARTING STATISTICS', '*Document Version') || sliceBetween(md, '# STARTING STATISTICS', null) || '';

  // CORE STATS table
  const coreBlock = sliceBetween(statsBlock || md, '## CORE STATS', '## RESOURCES') || '';
  for (const row of parseMarkdownTableRows(coreBlock)) {
    const stat = (row[0] || '').trim().toUpperCase();
    const total = row[row.length - 1];
    if (['STR','DEX','CON','INT','WIS','CHA'].includes(stat)) {
      const v = num(total);
      if (v != null) out.stats[stat] = v;
    }
  }

  // RESOURCES table
  const res = {
    HP: { cur: null, max: null },
    MP: { cur: null, max: null },
    SP: { cur: null, max: null },
    XP: { cur: 0, next: null },
    currencies: { Gold: 0, Silver: 0, Copper: 0 },
    regenPerMinute: { HP: null, MP: null, SP: null }
  };

  const resBlock = sliceBetween(statsBlock || md, '## RESOURCES', '## REGENERATION') || '';
  for (const row of parseMarkdownTableRows(resBlock)) {
    const key = (row[0] || '').trim().toUpperCase();
    const curmax = (row[row.length - 1] || '').trim();
    if (['HP','MP','SP'].includes(key)) {
      const cm = parseCurMax(curmax);
      if (cm) res[key] = cm;
    } else if (key === 'XP') {
      const xp = parseCurMax(curmax);
      if (xp) { res.XP.cur = xp.cur ?? 0; res.XP.next = xp.max ?? null; }
    }
  }

  // REGENERATION table
  const regenBlock = sliceBetween(statsBlock || md, '## REGENERATION', '---') || '';
  for (const row of parseMarkdownTableRows(regenBlock)) {
    const key = (row[0] || '').trim().toUpperCase();
    const after = (row[row.length - 1] || '').trim(); // e.g. "44/min"
    const v = num(after);
    if (key === 'HP') res.regenPerMinute.HP = v;
    if (key === 'MP') res.regenPerMinute.MP = v;
    if (key === 'SP') res.regenPerMinute.SP = v;
  }

  // Fallback: older bold formats
  for (const k of ['STR','DEX','CON','INT','WIS','CHA']) {
    if (out.stats[k] == null) {
      const m = md.match(new RegExp(`\\*\\*${k}:\\*\\*\\s*(\\d+)`, 'i'));
      if (m) out.stats[k] = Number(m[1]);
    }
  }

  const hp = md.match(/\*\*HP:\*\*\s*([0-9,]+)(?:\s*\/\s*([0-9,]+))?/i);
  const mp = md.match(/\*\*MP:\*\*\s*([0-9,]+)(?:\s*\/\s*([0-9,]+))?/i);
  const sp = md.match(/\*\*SP:\*\*\s*([0-9,]+)(?:\s*\/\s*([0-9,]+))?/i);
  if (hp && res.HP.cur == null) res.HP = { cur: num(hp[1]), max: num(hp[2] || hp[1]) };
  if (mp && res.MP.cur == null) res.MP = { cur: num(mp[1]), max: num(mp[2] || mp[1]) };
  if (sp && res.SP.cur == null) res.SP = { cur: num(sp[1]), max: num(sp[2] || sp[1]) };

  const hpRe = md.match(/\*\*HP Regen:\*\*\s*([0-9,]+)\/min/i);
  const mpRe = md.match(/\*\*MP Regen:\*\*\s*([0-9,]+)\/min/i);
  const spRe = md.match(/\*\*SP Regen:\*\*\s*([0-9,]+)\/min/i);
  if (hpRe && res.regenPerMinute.HP == null) res.regenPerMinute.HP = num(hpRe[1]);
  if (mpRe && res.regenPerMinute.MP == null) res.regenPerMinute.MP = num(mpRe[1]);
  if (spRe && res.regenPerMinute.SP == null) res.regenPerMinute.SP = num(spRe[1]);

  out.resources = res;

  // Traits / Skills / Spells / Titles
  out.traits = parseAbilityGroup(md, '# TRAITS', '# SPELLS', 'traits');
  out.skills = parseSkills(md);
  out.spells = parseSpells(md);
  out.titles = parseTitles(md);

  return out;
}

function parseAbilityGroup(md, startHeader, endHeader, kind) {
  const block = sliceBetween(md, startHeader, endHeader);
  if (!block) return [];
  const entries = splitH3(block);
  const out = [];
  for (const e of entries) {
    const name = cleanName(e.title);
    const type = matchField(e.body, 'Type');
    const description = matchField(e.body, 'Description');
    const effect = matchField(e.body, 'Effect');
    if (!name) continue;
    out.push({ name, type, description, effect });
  }
  return out;
}

function parseSkills(md) {
  const block = sliceBetween(md, '# SKILLS', '# SPELLS') || sliceBetween(md, '# SKILLS', '# TITLES');
  if (!block) return [];
  const entries = splitH3(block);
  const out = [];
  for (const e of entries) {
    const name = cleanName(e.title);
    if (!name) continue;
    const level = (() => {
      const m = e.body.match(/\*\*Level:\*\*\s*(\d+)/i);
      return m ? Number(m[1]) : null;
    })();
    const description = matchField(e.body, 'Description');
    const effect = matchField(e.body, 'Effect');
    out.push({ name, level, description, effect });
  }
  return out;
}

function parseSpells(md) {
  const block = sliceBetween(md, '# SPELLS', '# TITLES') || sliceBetween(md, '# SPELLS', '# STARTING STATISTICS');
  if (!block) return [];
  const entries = splitH3(block);
  const out = [];

  for (const e of entries) {
    const name = cleanName(e.title);
    if (!name) continue;

    const school = (() => {
      const m = e.body.match(/\*\*School:\*\*\s*([^|]+)\|/i);
      return m ? m[1].trim() : '';
    })();

    const lvl = (() => {
      const m = e.body.match(/\*\*Level:\*\*\s*(\d+)/i);
      return m ? Number(m[1]) : null;
    })();

    const description = matchField(e.body, 'Description');

    // Default/Current MP cost
    const mpLine = e.body.match(/\*\*Default MP Cost:\*\*\s*([^|]+)\|\s*\*\*Current MP Cost:\*\*\s*(.+)$/im);
    let defaultMana = null, currentMana = null;
    if (mpLine) {
      defaultMana = num(mpLine[1]);
      currentMana = num(mpLine[2]);
    } else {
      // Sometimes: "**Default MP Cost:** 50 | **Current MP Cost:** 25 ..."
      const m2 = e.body.match(/\*\*Default MP Cost:\*\*\s*([0-9,]+)[^\n]*\*\*Current MP Cost:\*\*\s*([0-9,]+)/i);
      if (m2) { defaultMana = num(m2[1]); currentMana = num(m2[2]); }
    }

    // Default/Current Damage or Effect (support either label)
    let defaultEffect = null, currentEffect = null;
    const dmg = e.body.match(/\*\*Default Damage:\*\*\s*([^|]+)\|\s*\*\*Current Damage:\*\*\s*(.+)$/im);
    const eff = e.body.match(/\*\*Default Effect:\*\*\s*([^|]+)\|\s*\*\*Current Effect:\*\*\s*(.+)$/im);
    if (dmg) { defaultEffect = dmg[1].trim(); currentEffect = dmg[2].trim(); }
    else if (eff) { defaultEffect = eff[1].trim(); currentEffect = eff[2].trim(); }
    else {
      // Try other common labels (healing/shield/etc.)
      const d2 = e.body.match(/\*\*Default (Damage|Healing|Shield|Effect):\*\*\s*([^|]+)\|\s*\*\*Current (Damage|Healing|Shield|Effect):\*\*\s*(.+)$/im);
      if (d2) { defaultEffect = d2[2].trim(); currentEffect = d2[4].trim(); }
    }

    // Cooldown/Range optional
    const cooldown = (() => {
      const m = e.body.match(/\*\*Cooldown:\*\*\s*([^\n]+)/i);
      return m ? m[1].trim() : '';
    })();
    const range = (() => {
      const m = e.body.match(/\*\*Range:\*\*\s*([^\n]+)/i);
      return m ? m[1].trim() : '';
    })();

    out.push({
      name,
      description,
      defaultMana,
      currentMana: currentMana ?? defaultMana,
      defaultEffect,
      currentEffect: currentEffect ?? defaultEffect,
      school,
      level: lvl,
      cooldown,
      range,
      tags: [],
    });
  }

  return out;
}

function parseTitles(md) {
  const block = sliceBetween(md, '# TITLES', '# STARTING STATISTICS') || sliceBetween(md, '# TITLES', null);
  if (!block) return [];
  const entries = splitH3(block);
  const out = [];
  for (const e of entries) {
    const name = cleanName(e.title);
    if (!name) continue;
    const rarity = matchField(e.body, 'Rarity');
    const description = matchField(e.body, 'Description');
    const effect = matchField(e.body, 'Effect');
    out.push({ name, rarity, description, effect });
  }
  return out;
}

// Helpers for markdown parsing
function parseMarkdownTableRows(block) {
  if (!block) return [];
  const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
  const rows = [];
  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    if (/^\|\s*[-:]+/.test(line)) continue; // separator
    const parts = line.split('|').slice(1, -1).map(x => x.trim());
    if (parts.some(p => /^stat$/i.test(p) || /^resource$/i.test(p))) continue; // header row
    rows.push(parts);
  }
  return rows;
}

function parseCurMax(s) {
  if (!s) return null;
  const m = String(s).match(/([0-9,]+)\s*\/\s*([0-9,]+)/);
  if (m) return { cur: num(m[1]), max: num(m[2]) };
  const one = num(s);
  if (one != null) return { cur: one, max: one };
  return null;
}

function sliceBetween(md, startHeader, endHeader) {
  const startIdx = md.indexOf(startHeader);
  if (startIdx === -1) return null;
  const rest = md.slice(startIdx + startHeader.length);
  if (!endHeader) return rest;
  const endIdx = rest.indexOf(endHeader);
  if (endIdx === -1) return rest;
  return rest.slice(0, endIdx);
}

function splitH3(block) {
  // Split on ### headings
  const parts = block.split(/\n###\s+/);
  const out = [];
  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i];
    const firstNl = chunk.indexOf('\n');
    const title = (firstNl === -1) ? chunk.trim() : chunk.slice(0, firstNl).trim();
    const body = (firstNl === -1) ? '' : chunk.slice(firstNl + 1).trim();
    out.push({ title, body });
  }
  return out;
}

function matchField(body, label) {
  const re = new RegExp(`\\*\\*${escapeRe(label)}:\\*\\*\\s*([\\s\\S]*?)(?=\\n\\*\\*\\w+[^\\n]*:\\*\\*|\\n###|\\n---|$)`, 'i');
  const m = body.match(re);
  return m ? cleanupMd(m[1]) : '';
}

function cleanupMd(s) {
  return (s || '')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\*\*/g, '')
    .trim();
}

function cleanName(s) {
  return (s || '').replace(/[⚡🔥🌪️❄️🌊🜁🜂🜃🜄✨🔮🗡️🛡️🧿🧬👑📜🎒⚔️🐉📔🎲]/g, '').trim();
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function num(x) {
  if (x == null) return null;
  const m = String(x).match(/-?\d[\d,]*/);
  if (!m) return null;
  return Number(m[0].replace(/,/g, ''));
}

// ──────────────────────────────────────────────────────────────────────────────
// Auto-tracking parser (reads assistant MECHANICS blocks / tags)
// ──────────────────────────────────────────────────────────────────────────────
const TAG_RE = /\[(.+?)\]/g;

function parseMechanicsTags(text) {
  const tags = [];
  const mechanics = extractMechanicsBlock(text);
  const src = mechanics || text;
  let m;
  while ((m = TAG_RE.exec(src)) !== null) {
    tags.push(m[1].trim());
  }
  return tags;
}

function extractMechanicsBlock(text) {
  // Look for "MECHANICS" header
  const m = text.match(/(?:^|\n)\s*MECHANICS\s*:?\s*\n([\s\S]*?)(?:\n{2,}|\n\s*[-=*]{3,}|\s*$)/i);
  return m ? m[1].trim() : '';
}

function applyTag(st, tag) {
  // HP/MP/SP deltas: "HP -10"
  let m;

  // Resource delta
  m = tag.match(/^(HP|MP|SP|XP)\s*([+-])\s*([0-9,]+)/i);
  if (m) {
    const key = m[1].toUpperCase();
    const sign = m[2] === '-' ? -1 : 1;
    const amt = num(m[3]) ?? 0;
    if (key === 'XP') {
      st.resources.XP.cur = (st.resources.XP.cur ?? 0) + sign * amt;
    } else {
      const r = st.resources[key];
      if (r.cur == null) r.cur = r.max ?? 0;
      r.cur = Math.max(0, r.cur + sign * amt);
    }
    return true;
  }

  // Currency delta "Gold +50"
  m = tag.match(/^(Gold|Silver|Copper)\s*([+-])\s*([0-9,]+)/i);
  if (m) {
    const k = capitalize(m[1]);
    const sign = m[2] === '-' ? -1 : 1;
    st.resources.currencies[k] = (st.resources.currencies[k] ?? 0) + sign * (num(m[3]) ?? 0);
    st.resources.currencies[k] = Math.max(0, st.resources.currencies[k]);
    return true;
  }

  // Location set: Location = "Stormkeep"
  m = tag.match(/^Location\s*=\s*"?(.+?)"?$/i);
  if (m) {
    const loc = m[1].trim();
    st.locations.current = loc;
    if (!st.locations.discovered.some(x => x.name.toLowerCase() === loc.toLowerCase())) {
      st.locations.discovered.push({ name: loc, notes: '' });
    }
    return true;
  }

  // Item add/remove: Item +"Name" x1
  m = tag.match(/^Item\s*([+-])\s*"?(.+?)"?\s*(?:x(\d+))?$/i);
  if (m) {
    const sign = m[1] === '-' ? -1 : 1;
    const name = m[2].trim();
    const qty = m[3] ? Number(m[3]) : 1;
    upsertQty(st.inventory, name, sign * qty);
    return true;
  }

  // Status add/remove -> Modifiers
  m = tag.match(/^Status\s*([+-])\s*"?(.+?)"?$/i);
  if (m) {
    const sign = m[1] === '-' ? -1 : 1;
    const name = m[2].trim();
    if (sign > 0) {
      if (!st.modifiers.some(x => x.name.toLowerCase() === name.toLowerCase())) st.modifiers.push({ name, description: '', expires: '', effects: '' });
    } else {
      st.modifiers = st.modifiers.filter(x => x.name.toLowerCase() !== name.toLowerCase());
    }
    return true;
  }

  // Quest add/update: Quest +"Name" status=Active
  m = tag.match(/^Quest\s*\+?\s*"?(.+?)"?\s*(?:status\s*=\s*([A-Za-z]+))?/i);
  if (m) {
    const name = m[1].trim();
    const status = m[2] ? m[2].trim() : 'Active';
    const q = st.quests.find(x => x.name.toLowerCase() === name.toLowerCase());
    if (q) q.status = status;
    else st.quests.push({ name, status, description: '', objectives: [], progress: '', notes: '' });
    return true;
  }
  m = tag.match(/^Quest\s*"?(.+?)"?\s*status\s*=\s*([A-Za-z]+)/i);
  if (m) {
    const name = m[1].trim();
    const status = m[2].trim();
    const q = st.quests.find(x => x.name.toLowerCase() === name.toLowerCase());
    if (q) q.status = status;
    else st.quests.push({ name, status, description: '', objectives: [], progress: '', notes: '' });
    return true;
  }

  // Spell update: Spell "Lightning Bolt" current_mp=8 current_effect="..."
  m = tag.match(/^Spell\s+"?(.+?)"?\s+(.+)$/i);
  if (m) {
    const spellName = m[1].trim();
    const rest = m[2].trim();
    const sp = st.spells.find(x => x.name.toLowerCase() === spellName.toLowerCase());
    if (!sp) return false;

    const mpM = rest.match(/current_mp\s*=\s*([0-9,]+)/i);
    if (mpM) sp.currentMana = num(mpM[1]);

    const effM = rest.match(/current_effect\s*=\s*"(.*)"/i);
    if (effM) sp.currentEffect = effM[1].trim();

    return true;
  }

  return false;
}

function upsertQty(arr, name, delta) {
  const idx = arr.findIndex(x => x.name.toLowerCase() === name.toLowerCase());
  if (idx === -1) {
    if (delta > 0) arr.push({ name, qty: delta, notes: '' });
    return;
  }
  arr[idx].qty = (arr[idx].qty ?? 0) + delta;
  if (arr[idx].qty <= 0) arr.splice(idx, 1);
}

// ──────────────────────────────────────────────────────────────────────────────
// Sync/Rebuild
// ──────────────────────────────────────────────────────────────────────────────
async function syncRebuild() {
  setStatus('Sync/Rebuild: clearing state...');
  const s = getSettings();

  const st = newEmptyState();
  await seedFromSources(st, s);

  // Replay chat assistant messages to rebuild changes
  const ctx = getSTContext();
  const chat = ctx?.chat ?? [];
  setStatus(`Sync/Rebuild: replaying ${chat.length} messages...`);

  for (let i = 0; i < chat.length; i++) {
    const msg = chat[i];
    if (!msg) continue;
    const isAssistant = msg.is_user === false && msg.is_system !== true;
    if (!isAssistant) continue;
    applyMessageToState(st, msg.mes || '');
    st._meta.lastProcessedMsgId = i + 1;
  }

  st._meta.lastSyncAt = Date.now();
  await commitState(st);
  render();
  updateInjection();
  setStatus('Sync/Rebuild complete.');
}

// ──────────────────────────────────────────────────────────────────────────────
// Message processing (incremental)
// ──────────────────────────────────────────────────────────────────────────────
function applyMessageToState(st, text) {
  const tags = parseMechanicsTags(text);
  let changed = false;
  for (const t of tags) {
    try { if (applyTag(st, t)) changed = true; } catch {}
  }
  // If there were no tags, still allow journal capture (optional)
  return changed;
}

async function processNewAssistantMessage(msgText) {
  const s = getSettings();
  if (!s.enabled || !s.autoTrackingEnabled) return;

  const st = getChatState();
  const changed = applyMessageToState(st, msgText);

  if (changed) {
    // Log it to journal for transparency
    st.journal.push({ ts: Date.now(), text: 'Auto-tracked changes from last assistant message.', tags: ['autotrack'] });
    await commitState(st);
    render();
    updateInjection();
    setStatus('Auto-updated.');
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Dice
// ──────────────────────────────────────────────────────────────────────────────
function roll(expr) {
  // NdM(+/-)K
  const m = expr.replace(/\s+/g, '').match(/^(\d+)d(\d+)([+-]\d+)?$/i);
  if (!m) return { total: 0, detail: 'Invalid' };
  const n = Number(m[1]), d = Number(m[2]), k = m[3] ? Number(m[3]) : 0;
  const rolls = [];
  for (let i = 0; i < n; i++) rolls.push(1 + Math.floor(Math.random() * d));
  const total = rolls.reduce((a,b)=>a+b,0) + k;
  const detail = `${rolls.join('+')}${k ? (k>0?`+${k}`:`${k}`) : ''}`;
  return { total, detail };
}

// ──────────────────────────────────────────────────────────────────────────────
// Utilities
// ──────────────────────────────────────────────────────────────────────────────
function fmt(x) { return (x === null || x === undefined || x === '') ? '—' : String(x); }
function fmtCurMax(r) {
  if (!r) return '—';
  if (r.cur == null && r.max == null) return '—';
  if (r.max == null) return String(r.cur);
  return `${r.cur ?? '—'} / ${r.max}`;
}
function truncate(s, n) {
  if (!s) return '—';
  const t = String(s);
  return t.length > n ? t.slice(0, n - 1).trim() + '…' : t;
}
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s; }
function deepMerge(a, b) {
  const out = structuredClone(a);
  for (const [k, v] of Object.entries(b || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = deepMerge(out[k] || {}, v);
    else out[k] = v;
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────────
// Lifecycle / Events
// ──────────────────────────────────────────────────────────────────────────────
async function ensureChatInitialized() {
  const s = getSettings();
  const st = getChatState();

  // Auto-populate on first load of a chat if not seeded
  if (!st._meta.seededFromAbilities) {
    setStatus('Initializing chat state...');
    await seedFromSources(st, s);
    await commitState(st);
  }

  render();
  updateInjection();
  setStatus('Ready.');
}

function registerEvents() {
  if (!eventSource || !event_types) {
    console.warn('[VCTv4] eventSource/event_types missing; cannot auto-update.');
    return;
  }

  // Chat changed => load per-chat state and inject
  eventSource.on(event_types.CHAT_CHANGED, async () => {
    setStatus('Chat changed: loading state...');
    await ensureChatInitialized();
  });

  // Assistant message received => parse once
  eventSource.on(event_types.MESSAGE_RECEIVED, async (data) => {
    try {
      const msg = data?.message ?? data?.mes ?? '';
      const ctx = getSTContext();
      const isAssistant = data?.is_user === false || (data?.name && data?.name !== ctx?.name1);
      // Better: if data has a message object
      if (typeof data?.message === 'object' && data.message?.is_user === false) {
        await processNewAssistantMessage(data.message.mes || '');
        return;
      }
      if (isAssistant) await processNewAssistantMessage(msg);
    } catch (e) {
      console.warn('[VCTv4] MESSAGE_RECEIVED handler failed', e);
    }
  });

  // Right before generation => ensure injection is up-to-date
  if (event_types.GENERATION_AFTER_COMMANDS) {
    eventSource.on(event_types.GENERATION_AFTER_COMMANDS, () => {
      updateInjection();
    });
  }
}

(async function main() {
  console.log('[VCTv4] loaded');
  try {
    mountUI();
    registerEvents();
    await ensureChatInitialized();
  } catch (e) {
    console.error('[VCTv4] init failed', e);
  }
})();