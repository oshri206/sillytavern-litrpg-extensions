import { MINUTES_PER_DAY, loadState, saveState, sanitizeState } from "./storage.js";

const pad2 = (value) => String(value).padStart(2, "0");

const getTimeParts = (worldMinutes) => {
  const safeMinutes = Math.max(0, Math.floor(Number(worldMinutes) || 0));
  const day = Math.floor(safeMinutes / MINUTES_PER_DAY) + 1;
  const minutesIntoDay = safeMinutes % MINUTES_PER_DAY;
  const hours = Math.floor(minutesIntoDay / 60);
  const minutes = minutesIntoDay % 60;

  return { day, hours, minutes };
};

const formatClock = (worldMinutes) => {
  const { hours, minutes } = getTimeParts(worldMinutes);
  return `${pad2(hours)}:${pad2(minutes)}`;
};

const formatTimeLabel = (worldMinutes) => {
  const { day, hours, minutes } = getTimeParts(worldMinutes);
  return `Day ${day}, ${pad2(hours)}:${pad2(minutes)}`;
};

const createKernel = () => {
  let state = loadState();

  const setState = (nextState) => {
    state = sanitizeState(nextState);
    saveState(state);
    return state;
  };

  const getState = () => ({ ...state });

  const advanceTime = (minutes) => {
    const delta = Math.floor(Number(minutes) || 0);
    const nextMinutes = Math.max(0, state.worldMinutes + delta);
    return setState({ ...state, worldMinutes: nextMinutes });
  };

  return {
    getState,
    advanceTime,
    formatClock,
    formatTimeLabel,
    getTimeParts,
  };
};

export { createKernel, formatClock, formatTimeLabel };
