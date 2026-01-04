const STORAGE_KEY = "valdris_world_sim_v1";

const MINUTES_PER_DAY = 24 * 60;

const createSeed = () => Math.floor(Math.random() * 1_000_000_000);

const ensureNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const sanitizeState = (state) => {
  const safeState = state && typeof state === "object" ? state : {};
  const seed = ensureNumber(safeState.seed, createSeed());
  const worldMinutes = Math.max(0, Math.floor(ensureNumber(safeState.worldMinutes, 0)));

  return { seed, worldMinutes };
};

const getChatMetadataContainer = () => {
  try {
    if (window?.SillyTavern?.chatMetadata) {
      return window.SillyTavern.chatMetadata;
    }
  } catch (error) {
    // Ignore access errors.
  }

  try {
    if (window?.sillyTavern?.chatMetadata) {
      return window.sillyTavern.chatMetadata;
    }
  } catch (error) {
    // Ignore access errors.
  }

  try {
    const context = window?.SillyTavern?.getContext?.() ?? window?.getContext?.();
    if (context?.chatMetadata) {
      return context.chatMetadata;
    }
  } catch (error) {
    // Ignore access errors.
  }

  return null;
};

const loadFromLocalStorage = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return sanitizeState(JSON.parse(raw));
  } catch (error) {
    return null;
  }
};

const saveToLocalStorage = (state) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    return false;
  }
};

const loadState = () => {
  const metadata = getChatMetadataContainer();
  if (metadata && metadata[STORAGE_KEY]) {
    return sanitizeState(metadata[STORAGE_KEY]);
  }

  const localState = loadFromLocalStorage();
  if (localState) {
    return localState;
  }

  const freshState = sanitizeState({ seed: createSeed(), worldMinutes: 0 });
  if (metadata) {
    try {
      metadata[STORAGE_KEY] = freshState;
      return freshState;
    } catch (error) {
      // Fall back to localStorage below.
    }
  }

  saveToLocalStorage(freshState);
  return freshState;
};

const saveState = (state) => {
  const safeState = sanitizeState(state);
  const metadata = getChatMetadataContainer();

  if (metadata) {
    try {
      metadata[STORAGE_KEY] = safeState;
      return true;
    } catch (error) {
      // Ignore and fall back to localStorage.
    }
  }

  return saveToLocalStorage(safeState);
};

export { MINUTES_PER_DAY, STORAGE_KEY, loadState, saveState, sanitizeState };
