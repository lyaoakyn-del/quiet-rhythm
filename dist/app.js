(() => {
  const DEFAULTS = { mode: "square", seconds: 4, rounds: 4, sound: false };
  const SETTINGS_KEY = "quiet-square.settings.v1";
  const MODES = {
    square: {
      title: "Ровный квадрат",
      labels: ["Вдох", "Пауза", "Выдох", "Пауза"],
      phases: (seconds) => [
        { side: 0, seconds, cue: "Вдох", caption: "мягко и без усилия", announcement: "Вдохни мягко и спокойно." },
        { side: 1, seconds, cue: "Пауза", caption: "останься в своём ритме", announcement: "Мягкая пауза." },
        { side: 2, seconds, cue: "Выдох", caption: "отпусти воздух спокойно", announcement: "Медленно выдохни." },
        { side: 3, seconds, cue: "Пауза", caption: "мягкая пауза", announcement: "Мягкая пауза." }
      ]
    },
    "long-exhale": {
      title: "Длинный выдох",
      labels: ["Вдох", "", "Выдох", ""],
      phases: () => [
        { side: 0, seconds: 4, cue: "Вдох", caption: "спокойный вдох", announcement: "Спокойно вдохни." },
        { side: 2, seconds: 6, cue: "Выдох", caption: "чуть длиннее вдоха", announcement: "Плавно выдыхай чуть дольше, чем вдыхала." }
      ]
    },
    "cyclic-sigh": {
      title: "Циклический вздох",
      labels: ["Вдох", "Довдох", "Выдох", ""],
      phases: () => [
        { side: 0, seconds: 3, cue: "Вдох", caption: "мягко через нос", announcement: "Мягко вдохни через нос." },
        { side: 1, seconds: 1, cue: "Короткий довдох", caption: "не набирай воздух силой", announcement: "Добавь короткий, лёгкий довдох. Не старайся вдохнуть до предела." },
        { side: 2, seconds: 6, cue: "Длинный выдох", caption: "медленно и свободно", announcement: "Медленно и свободно выдохни." }
      ]
    }
  };
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
    roundLabel: $("round-label"), roundsHint: $("rounds-hint"), practiceTitle: $("practice-title"),
    durationSetting: $("duration-setting"), durationLabel: $("duration-label"), durationHint: $("duration-hint"),
    start: $("start-button"), startLabel: $("start-label"), reset: $("reset-button"),
    sound: $("sound-button"), soundLabel: $("sound-label"), marker: $("breath-marker"), halo: $("marker-halo"),
    install: $("install-button")
  };

  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"); } catch { saved = {}; }
  const state = {
    mode: Object.hasOwn(MODES, saved.mode) ? saved.mode : DEFAULTS.mode,
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

  function getPhases() {
    return MODES[state.mode].phases(state.seconds);
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ mode: state.mode, seconds: state.seconds, rounds: state.rounds, sound: state.sound }));
    } catch { /* Private browsing may disable storage. */ }
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
    const isSquare = state.mode === "square";
    const locked = state.running || state.paused || state.complete;
    ui.practiceTitle.textContent = MODES[state.mode].title;
    ui.durationSetting.hidden = !isSquare;
    ui.secondsValue.textContent = String(state.seconds);
    ui.roundsValue.textContent = String(state.rounds);
    ui.roundLabel.textContent = russianCount(state.rounds, "круг", "круга", "кругов");
    ui.roundsHint.textContent = state.mode === "square" ? "один круг — четыре стороны" : state.mode === "long-exhale" ? "один круг — вдох и выдох" : "один круг — три мягких шага";
    $("seconds-minus").disabled = state.seconds <= 2 || locked;
    $("seconds-plus").disabled = state.seconds >= 10 || locked;
    $("rounds-minus").disabled = state.rounds <= 1 || locked;
    $("rounds-plus").disabled = state.rounds >= 12 || locked;
    ui.progressCaption.textContent = `${state.rounds} ${russianCount(state.rounds, "спокойный круг", "спокойных круга", "спокойных кругов")}`;
    ui.roundCounter.textContent = state.complete ? "ГОТОВО" : `КРУГ ${Math.min(state.completedRounds + 1, state.rounds)} / ${state.rounds}`;
    document.querySelectorAll(".mode-option").forEach((button) => {
      const selected = button.dataset.mode === state.mode;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
      button.disabled = state.running;
    });
    renderDots();
    ui.sound.setAttribute("aria-pressed", String(state.sound));
    ui.soundLabel.textContent = state.sound ? "Звук включён" : "Звук выключен";
    $("seconds-minus").setAttribute("aria-label", `Уменьшить длительность${state.seconds <= 2 ? ", минимум 2 секунды" : ""}`);
    $("seconds-plus").setAttribute("aria-label", `Увеличить длительность${state.seconds >= 10 ? ", максимум 10 секунд" : ""}`);
  }

  function renderPhase(phaseIndex, announce = false) {
    state.phase = phaseIndex;
    const phases = getPhases();
    const info = phases[phaseIndex];
    const sideLabels = MODES[state.mode].labels;
    ui.stage.dataset.phase = state.running ? "running" : state.paused ? "paused" : state.complete ? "complete" : "ready";
    ui.cue.textContent = state.complete ? "Готово" : state.paused ? "Пауза" : state.running ? info.cue : "Готово";
    ui.caption.textContent = state.complete ? "можно возвращаться к делам" : state.paused ? "когда будешь готова" : state.running ? info.caption : "настрой свой ритм";

    document.querySelectorAll(".square-side").forEach((side) => {
      const sideNumber = Number(side.dataset.side);
      const used = phases.some((phase) => phase.side === sideNumber);
      side.classList.toggle("is-unused", !used);
      side.classList.toggle("is-active", state.running && sideNumber === info.side);
    });
    document.querySelectorAll(".side-label").forEach((label) => {
      const sideNumber = Number(label.dataset.labelSide);
      const text = sideLabels[sideNumber] || "";
      label.hidden = !text;
      label.textContent = text;
      label.classList.toggle("is-active", state.running && sideNumber === info.side);
    });
    if (announce) ui.announcer.textContent = info.announcement;
    if (!state.running) setMarker(positions[info.side](0));
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
      renderSettings();
      return;
    }

    if (state.complete) resetSession();
    state.running = true;
    state.paused = false;
    const current = getPhases()[state.phase];
    const isNewPhase = state.remainingMs === 0;
    state.endsAt = Date.now() + (state.remainingMs || current.seconds * 1000);
    renderPhase(state.phase, isNewPhase);
    setButtonMode();
    tick();
  }

  function advancePhase() {
    const phases = getPhases();
    if (state.phase === phases.length - 1) {
      state.completedRounds += 1;
      if (state.completedRounds >= state.rounds) {
        state.running = false;
        state.paused = false;
        state.complete = true;
        state.remainingMs = 0;
        ui.stage.dataset.phase = "complete";
        ui.cue.textContent = "Готово";
        ui.countdown.textContent = "✳";
        ui.caption.textContent = "можно возвращаться к делам";
        ui.announcer.textContent = "Практика завершена. Возвращайся к обычному, свободному дыханию.";
        document.querySelectorAll(".square-side").forEach((side) => side.classList.remove("is-active"));
        document.querySelectorAll(".side-label").forEach((label) => label.classList.remove("is-active"));
        renderSettings();
        setButtonMode();
        return;
      }
      state.completedRounds = Math.min(state.completedRounds, state.rounds);
      renderSettings();
      renderPhase(0, true);
    } else {
      renderPhase(state.phase + 1, true);
    }
    playChime();
  }

  function tick() {
    if (!state.running) return;
    const now = Date.now();
    while (state.running && now >= state.endsAt) {
      const previousEnd = state.endsAt;
      advancePhase();
      if (state.running) state.endsAt = previousEnd + getPhases()[state.phase].seconds * 1000;
    }
    if (!state.running) return;
    const current = getPhases()[state.phase];
    const remaining = Math.max(0, state.endsAt - now);
    state.remainingMs = remaining;
    ui.countdown.textContent = String(Math.max(1, Math.ceil(remaining / 1000)));
    const elapsed = 1 - remaining / (current.seconds * 1000);
    setMarker(positions[current.side](Math.min(1, Math.max(0, elapsed))));
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
    ui.countdown.textContent = String(getPhases()[0].seconds);
    ui.announcer.textContent = "Выбери режим и нажми «Начать».";
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
    if (key === "seconds" && state.mode !== "square") return;
    const bounds = key === "seconds" ? [2, 10] : [1, 12];
    state[key] = Math.min(bounds[1], Math.max(bounds[0], state[key] + delta));
    ui.countdown.textContent = String(getPhases()[0].seconds);
    saveSettings();
    renderPhase(0);
    setButtonMode();
  }

  function selectMode(mode) {
    if (!Object.hasOwn(MODES, mode) || state.mode === mode || state.running) return;
    state.mode = mode;
    saveSettings();
    resetSession();
  }

  document.querySelectorAll(".mode-option").forEach((button) => {
    button.addEventListener("click", () => selectMode(button.dataset.mode));
  });
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
  ui.countdown.textContent = String(getPhases()[0].seconds);
  setButtonMode();
})();
