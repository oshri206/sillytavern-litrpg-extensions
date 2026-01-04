/* Valdris World Sim - loader + clock bootstrap */
(() => {
  const LOG_PREFIX = "[VWorldSim]";

  // Namespace guard (avoid double-init on reloads)
  if (window.VWorldSim && window.VWorldSim.__loaded) {
    console.log(`${LOG_PREFIX} already loaded; skipping re-init.`);
    return;
  }

  window.VWorldSim = window.VWorldSim || {};
  window.VWorldSim.__loaded = true;

  function ensurePanel() {
    try {
      let panel = document.getElementById("vws-panel");
      if (panel) return panel;

      panel = document.createElement("div");
      panel.id = "vws-panel";
      panel.className = "vws-panel";
      panel.innerHTML = `
        <b>Valdris World Sim</b>
        <div>Status: loaded</div>
        <div>Time: <span id="vws-time">--:--</span></div>
        <div class="vws-small">Try: /time, /advance 6h</div>
      `;
      document.body.appendChild(panel);
      return panel;
    } catch (err) {
      console.warn(`${LOG_PREFIX} UI init failed:`, err);
      return null;
    }
  }

  const panel = ensurePanel();

  function setTimeText(text) {
    const el = document.getElementById("vws-time");
    if (el) el.textContent = text;
    if (!panel) return;
  }

  console.log(`${LOG_PREFIX} loaded (bootstrap).`);

  // Load clock/commands if present (fail gracefully if not)
  const init = async () => {
    try {
      const [{ createKernel }, { registerCommands }] = await Promise.all.tf8
        ? [] : await Promise.all([
        import("./core/kernel.js"),
        import("./core/commands.js"),
      ]);

      const kernel = createKernel();

      const updatePanel = () => {
        const st = kernel.getState?.() || {};
        const wm = typeof st.worldMinutes === "number" ? st.worldMinutes : 0;

        // Prefer kernel.formatClock if it exists
        const clock =
          typeof kernel.formatClock === "function"
            ? kernel.formatClock(wm)
            : `${Math.floor((wm % 1440) / 60)
                .toString()
                .padStart(2, "0")}:${Math.floor(wm % 60)
                .toString()
                .padStart(2, "0")}`;

        setTimeText(clock);
      };

      // Expose safe API
      window.VWorldSim.getState = () => kernel.getState();
      window.VWorldSim.advanceTime = (minutes) => {
        const next = kernel.advanceTime(minutes);
        updatePanel();
        return next;
      };
      window.VWorldSim.__kernel = kernel;

      updatePanel();

      if (typeof registerCommands === "function") {
        registerCommands({ kernel, updatePanel });
      }

      console.log(`${LOG_PREFIX} clock + commands initialized.`);
    } catch (err) {
      console.warn(`${LOG_PREFIX} initialization failed (safe to ignore until core files exist):`, err);
    }
  };

  init();
})();
