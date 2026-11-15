(() => {
  const DEFAULTS = { seconds: 4, rounds: 4, sound: false };
  const SETTINGS_KEY = "quiet-square.settings.v1";
  const phases = [
    { name: "Вдохни", cue: "Вдох", caption: "мягко и без усилия", announcement: "Вдохни мягко и спокойно." },
    { name: "Пауза", cue: "Пауза", caption: "останься в своём ритме", announcement: "Пауза. Оставайся в своём ритме." },
    { name: "Выдохни", cue: "Выдох", caption: "отпусти воздух спокойно", announcement: "Медленно выдохни." },
    { name: "Пауза", cue: "Пауза", caption: "мягкая пауза", announcement: "Мягкая пауза." }
  ];
  const positions = [
    (p) => ({ x: 56 + 128 * p, y: 56 }),
    (p) => ({ x: 184, y: 56 + 128 * p }),
    (p) => ({ x: 184 - 128 * p, y: 184 }),
    (p) => ({ x: 56, y: 184 - 128 * p })
  ];

  const $ = (id) => document.getElementById(id);
  const ui = {
    stage: $("breath-stage"), cue: $("phase-cue"), countdown: $("countdown"), caption: $("center-caption"),
    announcer: $("phase-announcer"), roundCounter: $("round-counter"), progressDots: $("progress-dots"),
    progressCaption: $("progress-caption"), secondsValue: $("seconds-value"), roundsValue: $("rounds-value"),
    roundLabel: $("round-label"), start: $("start-button"), startLabel: $("start-label"), reset: $("reset-button"),
    sound: $("sound-button"), soundLabel: $("sound-label"), marker: $("breath-marker"), halo: $("marker-halo"),
    install: $("install-button")
  };

  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"); } catch { saved = {}; }
  const state = {
    seconds: validNumber(saved.seconds, 2, 10, DEFAULTS.seconds),
    rounds: validNumber(saved.rounds, 1, 12, DEFAULTS.rounds),
    sound: Boolean(saved.sound),
    running: false,
    paused: false,
    complete: false,
    phase: 0,
    completedRounds: 0,
    endsAt: 0,
    remainingMs: 0,
    frame: 0,
    audio: null
  };

  function validNumber(value, min, max, fallback) {
    return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
  }

  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ seconds: state.seconds, rounds: state.rounds, sound: state.sound })); } catch { /* Private browsing may disable storage. */ }
  }

  function russianCount(number, one, few, many) {
    const n = Math.abs(number) % 100;
    const last = n % 10;
    if (n > 10 && n < 20) return many;
    if (last > 1 && last < 5) return few;
    if (last === 1) return one;
    return many;
  }

  function renderDots() {
    ui.progressDots.replaceChildren();
    for (let i = 0; i < state.rounds; i++) {
      const dot = document.createElement("span");
      dot.className = `progress-dot${i < state.completedRounds ? " is-done" : ""}`;
      ui.progressDots.append(dot);
    }
  }

  function renderSettings() {
    ui.secondsValue.textContent = String(state.seconds);
    ui.roundsValue.textContent = String(state.rounds);
    ui.roundLabel.textContent = russianCount(state.rounds, "круг", "круга", "кругов");
    $("seconds-minus").disabled = state.seconds <= 2 || state.running;
    $("seconds-plus").disabled = state.seconds >= 10 || state.running;
    $("rounds-minus").disabled = state.rounds <= 1 || state.running;
    $("rounds-plus").disabled = state.rounds >= 12 || state.running;
    ui.progressCaption.textContent = `${state.rounds} ${russianCount(state.rounds, "спокойный круг", "спокойных круга", "спокойных кругов")}`;
    ui.roundCounter.textContent = state.complete ? "ГОТОВО" : `КРУГ ${Math.min(state.completedRounds + 1, state.rounds)} / ${state.rounds}`;
    renderDots();
    ui.sound.setAttribute("aria-pressed", String(state.sound));
    ui.soundLabel.textContent = state.sound ? "Звук включён" : "Звук выключен";
    $("seconds-minus").setAttribute("aria-label", `Уменьшить длительность${state.seconds <= 2 ? ", минимум 2 секунды" : ""}`);
    $("seconds-plus").setAttribute("aria-label", `Увеличить длительность${state.seconds >= 10 ? ", максимум 10 секунд" : ""}`);
  }

  function renderPhase(phase, announce = false) {
    state.phase = phase;
    const info = phases[phase];
    ui.stage.dataset.phase = state.running ? "running" : state.paused ? "paused" : state.complete ? "complete" : "ready";
    ui.cue.textContent = state.complete ? "Готово" : state.paused ? "Пауза" : state.running ? info.cue : "Готово";
    ui.caption.textContent = state.complete ? "можно возвращаться к делам" : state.paused ? "когда будешь готова" : state.running ? info.caption : "настрой свой ритм";
    document.querySelectorAll(".square-side").forEach((side) => side.classList.toggle("is-active", state.running && Number(side.dataset.side) === phase));
    document.querySelectorAll(".side-label").forEach((label) => label.classList.toggle("is-active", state.running && Number(label.dataset.labelPhase) === phase));
    if (announce) ui.announcer.textContent = info.announcement;
    if (!state.running) setMarker(positions[phase](0));
    renderSettings();
  }

  function setMarker(position) {
    for (const element of [ui.marker, ui.halo]) {
      element.setAttribute("cx", String(position.x));
      element.setAttribute("cy", String(position.y));
    }
  }

  function setButtonMode() {
    if (state.complete) {
      ui.startLabel.textContent = "Ещё круг";
      ui.start.querySelector(".play-icon").textContent = "↻";
      ui.reset.disabled = false;
    } else if (state.running) {
      ui.startLabel.textContent = "Пауза";
      ui.start.querySelector(".play-icon").textContent = "Ⅱ";
      ui.reset.disabled = false;
    } else if (state.paused) {
      ui.startLabel.textContent = "Продолжить";
      ui.start.querySelector(".play-icon").textContent = "▶";
      ui.reset.disabled = false;
    } else {
      ui.startLabel.textContent = "Начать";
      ui.start.querySelector(".play-icon").textContent = "▶";
      ui.reset.disabled = true;
    }
  }

  function startOrPause() {
    if (state.running) {
      state.remainingMs = Math.max(0, state.endsAt - Date.now());
      state.running = false;
      state.paused = true;
      cancelAnimationFrame(state.frame);
      ui.stage.dataset.phase = "paused";
      ui.cue.textContent = "Пауза";
      ui.caption.textContent = "когда будешь готова";
      ui.announcer.textContent = "Таймер приостановлен.";
      document.querySelectorAll(".square-side").forEach((side) => side.classList.remove("is-active"));
      document.querySelectorAll(".side-label").forEach((label) => label.classList.remove("is-active"));
      setButtonMode();
      return;
    }

    if (state.complete) resetSession();
    state.running = true;
    state.paused = false;
    const isNewPhase = state.remainingMs === 0;
    state.endsAt = Date.now() + (state.remainingMs || state.seconds * 1000);
    renderPhase(state.phase, isNewPhase);
    setButtonMode();
    tick();
  }

  function advancePhase() {
    const previous = state.phase;
    if (previous === 3) {
      state.completedRounds += 1;
      renderSettings();
      if (state.completedRounds >= state.rounds) {
        state.running = false;
        state.paused = false;
        state.complete = true;
        state.remainingMs = 0;
        ui.stage.dataset.phase = "complete";
        ui.cue.textContent = "Готово";
        ui.countdown.textContent = "✳";
        ui.caption.textContent = "можно возвращаться к делам";
        ui.announcer.textContent = "Практика завершена. Сделай ещё один мягкий вдох, когда будешь готова.";
        document.querySelectorAll(".square-side").forEach((side) => side.classList.remove("is-active"));
        document.querySelectorAll(".side-label").forEach((label) => label.classList.remove("is-active"));
        renderSettings();
        setButtonMode();
        return;
      }
    }
    const next = (previous + 1) % phases.length;
    renderPhase(next, true);
    playChime();
  }

  function tick() {
    if (!state.running) return;
    const now = Date.now();
    while (state.running && now >= state.endsAt) {
      const previousEnd = state.endsAt;
      advancePhase();
      if (state.running) state.endsAt = previousEnd + state.seconds * 1000;
    }
    if (!state.running) return;
    const remaining = Math.max(0, state.endsAt - now);
    state.remainingMs = remaining;
    ui.countdown.textContent = String(Math.max(1, Math.ceil(remaining / 1000)));
    const elapsed = 1 - remaining / (state.seconds * 1000);
    setMarker(positions[state.phase](Math.min(1, Math.max(0, elapsed))));
    state.frame = requestAnimationFrame(tick);
  }

  function resetSession() {
    cancelAnimationFrame(state.frame);
    state.running = false;
    state.paused = false;
    state.complete = false;
    state.phase = 0;
    state.completedRounds = 0;
    state.remainingMs = 0;
    ui.countdown.textContent = String(state.seconds);
    ui.announcer.textContent = "Настрой темп и нажми «Начать».";
    renderPhase(0);
    setButtonMode();
  }

  function playChime() {
    if (!state.sound) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      state.audio ||= new AudioContext();
      if (state.audio.state === "suspended") state.audio.resume();
      const oscillator = state.audio.createOscillator();
      const gain = state.audio.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(state.phase % 2 === 0 ? 587.33 : 493.88, state.audio.currentTime);
      gain.gain.setValueAtTime(.0001, state.audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(.08, state.audio.currentTime + .03);
      gain.gain.exponentialRampToValueAtTime(.0001, state.audio.currentTime + .42);
      oscillator.connect(gain).connect(state.audio.destination);
      oscillator.start();
      oscillator.stop(state.audio.currentTime + .45);
    } catch { /* Audio is optional and starts only after the user enables it. */ }
  }

  function changeSetting(key, delta) {
    if (state.running || state.paused || state.complete) return;
    const bounds = key === "seconds" ? [2, 10] : [1, 12];
    state[key] = Math.min(bounds[1], Math.max(bounds[0], state[key] + delta));
    ui.countdown.textContent = String(state.seconds);
    saveSettings();
    renderPhase(state.phase);
    setButtonMode();
  }

  $("seconds-minus").addEventListener("click", () => changeSetting("seconds", -1));
  $("seconds-plus").addEventListener("click", () => changeSetting("seconds", 1));
  $("rounds-minus").addEventListener("click", () => changeSetting("rounds", -1));
  $("rounds-plus").addEventListener("click", () => changeSetting("rounds", 1));
  ui.start.addEventListener("click", startOrPause);
  ui.reset.addEventListener("click", resetSession);
  ui.sound.addEventListener("click", () => {
    state.sound = !state.sound;
    saveSettings();
    renderSettings();
    if (state.sound) playChime();
  });
  document.addEventListener("keydown", (event) => {
    if (event.code !== "Space" || event.repeat || ["BUTTON", "INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
    event.preventDefault();
    startOrPause();
  });

  let installPrompt = null;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    ui.install.hidden = false;
  });
  ui.install.addEventListener("click", async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    ui.install.hidden = true;
  });
  window.addEventListener("appinstalled", () => { ui.install.hidden = true; installPrompt = null; });

  renderSettings();
  renderPhase(0);
  ui.countdown.textContent = String(state.seconds);
  setButtonMode();
})();
