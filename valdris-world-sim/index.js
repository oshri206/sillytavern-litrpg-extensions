(() => {
  const logPrefix = "[VWorldSim]";
  console.log(`${logPrefix} Valdris World Sim loaded`);

  const panel = document.createElement("div");
  panel.className = "vworldsim-panel";
  panel.textContent = "Valdris World Sim loaded";

  document.body.appendChild(panel);
})();
