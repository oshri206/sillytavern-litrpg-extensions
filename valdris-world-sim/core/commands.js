import { formatTimeLabel } from "./kernel.js";

const parseAdvanceArgument = (input) => {
  const raw = String(input || "").trim();
  if (!raw) {
    return { ok: false, error: "Usage: /advance 6h | 120m | 2d" };
  }

  const match = raw.match(/^(\d+)\s*([dhm])?$/i);
  if (!match) {
    return { ok: false, error: "Usage: /advance 6h | 120m | 2d" };
  }

  const amount = Number(match[1]);
  const unit = (match[2] || "m").toLowerCase();

  if (!Number.isFinite(amount)) {
    return { ok: false, error: "Usage: /advance 6h | 120m | 2d" };
  }

  const multiplier = unit === "d" ? 1440 : unit === "h" ? 60 : 1;
  return { ok: true, minutes: amount * multiplier };
};

const normalizeArgs = (primary, secondary) => {
  if (typeof primary === "string") {
    return primary;
  }
  if (primary && typeof primary === "object" && "args" in primary) {
    return String(primary.args ?? "");
  }
  if (typeof secondary === "string") {
    return secondary;
  }
  return "";
};

const buildTimeMessage = (kernel) => {
  const state = kernel.getState();
  return formatTimeLabel(state.worldMinutes);
};

const registerWith = (registrar, name, handler, description) => {
  if (typeof registrar !== "function") {
    return false;
  }
  try {
    registrar(name, handler, description);
    return true;
  } catch (error) {
    return false;
  }
};

const registerCommands = (kernel) => {
  const timeHandler = () => buildTimeMessage(kernel);
  const advanceHandler = (args, raw) => {
    const input = normalizeArgs(args, raw);
    const parsed = parseAdvanceArgument(input);
    if (!parsed.ok) {
      return parsed.error;
    }
    kernel.advanceTime(parsed.minutes);
    return buildTimeMessage(kernel);
  };

  const registrars = [
    window?.registerSlashCommand,
    window?.SlashCommandParser?.registerCommand,
    window?.SlashCommandParser?.addCommand,
    window?.sillyTavern?.registerSlashCommand,
    window?.SillyTavern?.registerSlashCommand,
    window?.sillyTavern?.slashCommandParser?.registerCommand,
    window?.SillyTavern?.slashCommandParser?.registerCommand,
  ];

  const registeredTime = registrars.some((registrar) =>
    registerWith(registrar, "time", timeHandler, "Show world time")
  );
  const registeredAdvance = registrars.some((registrar) =>
    registerWith(registrar, "advance", advanceHandler, "Advance world time")
  );

  if (!registeredTime || !registeredAdvance) {
    console.warn("[VWorldSim] Slash command registration not available.");
  }
};

export { registerCommands };
