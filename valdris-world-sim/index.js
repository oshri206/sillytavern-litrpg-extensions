(() => {
  const logPrefix = "[VWorldSim]";
  console.log(`${logPrefix} Valdris World Sim loaded`);

  const panel = document.createElement("div");
  panel.className = "vworldsim-panel";
  panel.textContent = "Valdris World Sim loaded";

  document.body.appendChild(panel);

  const init = async () => {
    const [{ createKernel }, { registerCommands }] = await Promise.all([
      import("./core/kernel.js"),
      import("./core/commands.js"),
    ]);

    const kernel = createKernel();

    const updatePanel = () => {
      const { worldMinutes } = kernel.getState();
      const clock = kernel.formatClock(worldMinutes);
      panel.textContent = `Valdris World Sim loaded • ${clock}`;
    };

    const advanceTime = (minutes) => {
      const nextState = kernel.advanceTime(minutes);
      updatePanel();
      return nextState;
    };

    window.VWorldSim = {
      getState: kernel.getState,
      advanceTime,
    };

    updatePanel();
    registerCommands({
      ...kernel,
      advanceTime,
    });
  };

  init().catch((error) => {
    console.warn(`${logPrefix} initialization failed`, error);
  });
})();
