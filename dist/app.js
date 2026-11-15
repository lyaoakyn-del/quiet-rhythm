(() => {
  const DEFAULTS = { mode: "square", seconds: 4, rounds: 4, sound: false };
  const SETTINGS_KEY = "quiet-square.settings.v1";
  const SESSIONS_KEY = "quiet-square.sessions.v1";
  const THEME_KEY = "quiet-square.theme.v1";
  const MOODS = { 1: "тяжело", 2: "грустно", 3: "ровно", 4: "хорошо", 5: "отлично" };
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
    sparkTrail: $("spark-trail"), install: $("install-button"),
    themeToggle: $("theme-toggle"), themeIcon: $("theme-icon"), statsToggle: $("stats-toggle"), statsPanel: $("statistics-panel"),
    closeStats: $("close-statistics"), statsTabs: [...document.querySelectorAll("[data-stats-view]")],
    periodLabel: $("period-label"), periodPrev: $("period-prev"), periodNext: $("period-next"),
    statsSummary: $("statistics-summary"), statsInsight: $("statistics-insight"), modeMood: $("mode-mood-statistics"), statsContent: $("statistics-content"),
    clearStats: $("clear-statistics"), moodOverlay: $("mood-overlay"), moodTitle: $("mood-title"), moodKicker: $("mood-kicker"),
    moodCopy: $("mood-copy"), moodSkip: $("mood-skip"), moodOptions: [...document.querySelectorAll("[data-mood]")]
  };

  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"); } catch { saved = {}; }
  let sessions = [];
  try {
    const storedSessions = JSON.parse(localStorage.getItem(SESSIONS_KEY) || "[]");
    if (Array.isArray(storedSessions)) sessions = storedSessions.filter((session) => session && Number.isFinite(session.startedAt) && MODES[session.mode]);
  } catch { sessions = []; }
  let theme = "light";
  try { theme = localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light"; } catch { /* Theme setting is optional. */ }
  let statsView = "days";
  let selectedMonth = localMonthKey(new Date());
  let selectedYear = new Date().getFullYear();
  let moodStage = "";
  let sparkParticles = [];
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
    audio: null,
    practiceStarted: false,
    sessionStartedAt: 0,
    moodBefore: null,
    currentRecordId: null
  };

  function validNumber(value, min, max, fallback) {
    return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
  }

  function localDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function localMonthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  function formatDuration(seconds) {
    const whole = Math.max(0, Math.round(seconds || 0));
    if (whole < 60) return `${whole} ${russianCount(whole, "секунда", "секунды", "секунд")}`;
    const minutes = Math.floor(whole / 60);
    const remainder = whole % 60;
    return `${minutes} ${russianCount(minutes, "минута", "минуты", "минут")}${remainder ? ` ${remainder} с` : ""}`;
  }

  function formatDurationCompact(seconds) {
    const whole = Math.max(0, Math.round(seconds || 0));
    const minutes = Math.floor(whole / 60);
    const hours = Math.floor(minutes / 60);
    if (hours) return `${hours} ч ${minutes % 60} м`;
    if (minutes) return `${minutes} м`;
    return `${whole} с`;
  }

  function formatMoodPair(before, after) {
    if (before == null && after == null) return "без оценки настроения";
    const left = before == null ? "—" : `${before}/5`;
    const right = after == null ? "—" : `${after}/5`;
    return `настроение ${left} → ${right}`;
  }

  function saveSessions() {
    try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions)); } catch { /* Keep the session available even if storage is full. */ }
  }

  function setTheme(nextTheme, persist = true) {
    theme = nextTheme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    ui.themeIcon.textContent = theme === "dark" ? "☀" : "☾";
    ui.themeToggle.setAttribute("aria-label", theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему");
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.content = theme === "dark" ? "#0b100e" : "#f7f7f2";
    if (persist) {
      try { localStorage.setItem(THEME_KEY, theme); } catch { /* Theme setting is optional. */ }
    }
  }

  function createSparkParticles() {
    const ns = "http://www.w3.org/2000/svg";
    sparkParticles = Array.from({ length: 18 }, (_, index) => {
      const particle = document.createElementNS(ns, "circle");
      particle.classList.add("spark-particle");
      particle.setAttribute("r", String([1.2, 1.7, 2.2, 1.4][index % 4]));
      particle.style.animationDelay = `${-(index % 6) * 0.07}s`;
      particle.style.opacity = "0";
      ui.sparkTrail.append(particle);
      return particle;
    });
  }

  function updateSparkTrail(side, progress) {
    if (!sparkParticles.length) return;
    const count = sparkParticles.length;
    sparkParticles.forEach((particle, index) => {
      const lag = ((index + 1) / count) * .42;
      const pointProgress = progress - lag;
      if (pointProgress <= 0) {
        particle.style.opacity = "0";
        return;
      }
      const point = positions[side](Math.min(1, pointProgress));
      const spread = ((index * 7) % 9 - 4) * .72;
      if (side === 0 || side === 2) point.y += spread;
      else point.x += spread;
      particle.setAttribute("cx", String(point.x));
      particle.setAttribute("cy", String(point.y));
      particle.style.opacity = String((1 - index / count) * .86);
    });
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

  function formatMoodAverage(value) {
    return value == null ? "—" : value.toFixed(1);
  }

  function renderStatistics() {
    const now = new Date();
    const currentMonth = localMonthKey(now);
    const monthDate = parseMonthKey(selectedMonth);
    const inPeriod = sessions.filter((session) => {
      const date = new Date(session.startedAt);
      return statsView === "days" ? localMonthKey(date) === selectedMonth : date.getFullYear() === selectedYear;
    });
    const paired = inPeriod.filter((session) => session.moodBefore != null && session.moodAfter != null);
    const avgBefore = paired.length ? paired.reduce((sum, session) => sum + session.moodBefore, 0) / paired.length : null;
    const avgAfter = paired.length ? paired.reduce((sum, session) => sum + session.moodAfter, 0) / paired.length : null;
    const secondsTotal = inPeriod.reduce((sum, session) => sum + (session.durationSeconds || 0), 0);

    ui.statsTabs.forEach((tab) => {
      const selected = tab.dataset.statsView === statsView;
      tab.classList.toggle("is-selected", selected);
      tab.setAttribute("aria-pressed", String(selected));
    });
    if (statsView === "days") {
      ui.periodLabel.textContent = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(monthDate);
      ui.periodPrev.setAttribute("aria-label", "Предыдущий месяц");
      ui.periodNext.setAttribute("aria-label", "Следующий месяц");
      ui.periodNext.disabled = selectedMonth >= currentMonth;
      ui.statsContent.innerHTML = renderDailyGroups(inPeriod);
    } else {
      ui.periodLabel.textContent = String(selectedYear);
      ui.periodPrev.setAttribute("aria-label", "Предыдущий год");
      ui.periodNext.setAttribute("aria-label", "Следующий год");
      ui.periodNext.disabled = selectedYear >= now.getFullYear();
      ui.statsContent.innerHTML = renderMonths(selectedYear);
    }

    ui.statsSummary.innerHTML = `
      <div class="summary-card"><span class="summary-label">Завершённых практик</span><strong class="summary-value">${inPeriod.length}</strong></div>
      <div class="summary-card"><span class="summary-label">Время дыхания</span><strong class="summary-value">${inPeriod.length ? formatDurationCompact(secondsTotal) : "—"}</strong></div>
      <div class="summary-card"><span class="summary-label">Среднее настроение до → после</span><strong class="summary-value">${formatMoodAverage(avgBefore)} <small>→</small> ${formatMoodAverage(avgAfter)}</strong></div>`;
    ui.modeMood.innerHTML = Object.keys(MODES).map((mode) => {
      const modeItems = inPeriod.filter((session) => session.mode === mode);
      const modePairs = modeItems.filter((session) => session.moodBefore != null && session.moodAfter != null);
      const before = modePairs.length ? modePairs.reduce((sum, session) => sum + session.moodBefore, 0) / modePairs.length : null;
      const after = modePairs.length ? modePairs.reduce((sum, session) => sum + session.moodAfter, 0) / modePairs.length : null;
      const moodLabel = modePairs.length ? `${formatMoodAverage(before)} → ${formatMoodAverage(after)}` : "пока нет парных оценок";
      const practiceLabel = `${modeItems.length} ${russianCount(modeItems.length, "практика", "практики", "практик")} · оценок до/после: ${modePairs.length}`;
      return `<div class="mode-mood-card"><strong>${MODES[mode].title}</strong><span>${moodLabel}</span><small>${practiceLabel}</small></div>`;
    }).join("");

    if (!inPeriod.length) {
      ui.statsInsight.textContent = statsView === "days" ? "В этом месяце пока нет завершённых практик." : "За этот год пока нет завершённых практик.";
    } else {
      const counts = Object.keys(MODES).map((mode) => ({ mode, count: inPeriod.filter((item) => item.mode === mode).length })).sort((a, b) => b.count - a.count);
      const top = counts[0];
      const moodNote = paired.length ? ` · парных оценок: ${paired.length}` : " · парных оценок настроения пока нет";
      ui.statsInsight.textContent = `Чаще всего: ${MODES[top.mode].title.toLowerCase()} — ${top.count} ${russianCount(top.count, "раз", "раза", "раз")}${moodNote}.`;
    }
  }

  function parseMonthKey(key) {
    const [year, month] = key.split("-").map(Number);
    return new Date(year, month - 1, 1, 12);
  }

  function renderDailyGroups(periodSessions) {
    if (!periodSessions.length) return '<div class="stats-empty">Заверши практику, и здесь появятся дата, режим и длительность.</div>';
    const grouped = new Map();
    periodSessions.forEach((session) => {
      const key = localDateKey(new Date(session.startedAt));
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(session);
    });
    return [...grouped.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([dateKey, items]) => {
      const date = new Date(`${dateKey}T12:00:00`);
      const dateTitle = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }).format(date);
      const totalSeconds = items.reduce((sum, session) => sum + (session.durationSeconds || 0), 0);
      const summary = `${items.length} ${russianCount(items.length, "практика", "практики", "практик")} · ${formatDuration(totalSeconds)}`;
      const rows = items.sort((a, b) => b.startedAt - a.startedAt).map((session) => {
        const time = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date(session.startedAt));
        const rounds = session.rounds || 1;
        const roundText = `${rounds} ${russianCount(rounds, "круг", "круга", "кругов")}`;
        return `<div class="session-row">
          <time class="session-time" datetime="${new Date(session.startedAt).toISOString()}">${time}</time>
          <div class="session-main"><strong>${MODES[session.mode]?.title || "Дыхательная практика"}</strong><span>${roundText} · ${formatDuration(session.durationSeconds)}</span></div>
          <span class="session-mood">${formatMoodPair(session.moodBefore, session.moodAfter)}</span>
        </div>`;
      }).join("");
      return `<section class="day-group"><div class="day-heading"><strong>${dateTitle}</strong><span>${summary}</span></div><div class="session-list">${rows}</div></section>`;
    }).join("");
  }

  function renderMonths(year) {
    const monthNames = Array.from({ length: 12 }, (_, index) => new Intl.DateTimeFormat("ru-RU", { month: "long" }).format(new Date(year, index, 1, 12)));
    const visibleMonths = year === new Date().getFullYear() ? new Date().getMonth() + 1 : 12;
    return `<div class="month-list">${monthNames.slice(0, visibleMonths).map((name, index) => {
      const key = `${year}-${String(index + 1).padStart(2, "0")}`;
      const items = sessions.filter((session) => localMonthKey(new Date(session.startedAt)) === key);
      const seconds = items.reduce((sum, session) => sum + (session.durationSeconds || 0), 0);
      const count = `${items.length} ${russianCount(items.length, "практика", "практики", "практик")}`;
      const modes = Object.keys(MODES).filter((mode) => items.some((session) => session.mode === mode)).map((mode) => {
        const total = items.filter((session) => session.mode === mode).length;
        return `${MODES[mode].title.toLowerCase()} ${total}`;
      }).join(" · ") || "практик пока нет";
      return `<button class="month-row" type="button" data-month="${key}" aria-label="Открыть ${name} ${year}: ${count}"><strong>${name}</strong><span class="month-count">${items.length}</span><small>${count} · ${formatDuration(seconds)} · ${modes}</small></button>`;
    }).join("")}</div>`;
  }

  function openStatistics() {
    ui.statsPanel.hidden = false;
    ui.statsToggle.setAttribute("aria-expanded", "true");
    ui.statsToggle.setAttribute("aria-label", "Закрыть статистику");
    renderStatistics();
    ui.statsPanel.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }

  function closeStatistics() {
    ui.statsPanel.hidden = true;
    ui.statsToggle.setAttribute("aria-expanded", "false");
    ui.statsToggle.setAttribute("aria-label", "Открыть статистику");
    ui.statsToggle.focus();
  }

  function moveStatisticsPeriod(delta) {
    if (statsView === "days") {
      const [year, month] = selectedMonth.split("-").map(Number);
      const next = new Date(year, month - 1 + delta, 1, 12);
      if (localMonthKey(next) <= localMonthKey(new Date())) selectedMonth = localMonthKey(next);
    } else {
      selectedYear = Math.min(new Date().getFullYear(), selectedYear + delta);
    }
    renderStatistics();
  }

  function showMoodPrompt(stage) {
    moodStage = stage;
    ui.moodKicker.textContent = stage === "before" ? "до практики" : "после практики";
    ui.moodTitle.textContent = stage === "before" ? "Как ты себя чувствуешь?" : "Как ты себя чувствуешь сейчас?";
    ui.moodCopy.textContent = stage === "before"
      ? "Отметка поможет сравнить настроение до и после. Можно пропустить."
      : "Отметь настроение после дыхания — или пропусти, если не хочется.";
    ui.moodSkip.textContent = stage === "before" ? "Пропустить и начать" : "Сохранить без оценки";
    ui.moodOverlay.hidden = false;
    requestAnimationFrame(() => ui.moodOptions[2]?.focus());
  }

  function hideMoodPrompt() {
    ui.moodOverlay.hidden = true;
    moodStage = "";
  }

  function chooseMood(value) {
    const rating = Number(value);
    const stage = moodStage;
    hideMoodPrompt();
    if (stage === "before") {
      state.moodBefore = rating;
      startTimer();
      return;
    }
    if (stage === "after") {
      const record = sessions.find((session) => session.id === state.currentRecordId);
      if (record) {
        record.moodAfter = rating;
        saveSessions();
      }
      if (!ui.statsPanel.hidden) renderStatistics();
      ui.start.focus();
    }
  }

  function skipMoodPrompt() {
    const stage = moodStage;
    hideMoodPrompt();
    if (stage === "before") {
      state.moodBefore = null;
      startTimer();
      return;
    }
    if (stage === "after") {
      if (!ui.statsPanel.hidden) renderStatistics();
      ui.start.focus();
    }
  }

  function recordCompletedSession() {
    const durationSeconds = getPhases().reduce((sum, phase) => sum + phase.seconds, 0) * state.rounds;
    const record = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      startedAt: state.sessionStartedAt || Date.now(),
      completedAt: Date.now(),
      mode: state.mode,
      rounds: state.rounds,
      durationSeconds,
      moodBefore: state.moodBefore,
      moodAfter: null
    };
    sessions.push(record);
    state.currentRecordId = record.id;
    saveSessions();
    if (!ui.statsPanel.hidden) renderStatistics();
    showMoodPrompt("after");
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
    if (!state.running) {
      setMarker(positions[info.side](0));
      updateSparkTrail(info.side, 0);
    }
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
      updateSparkTrail(getPhases()[state.phase].side, 0);
      setButtonMode();
      renderSettings();
      return;
    }

    if (state.complete) resetSession();
    if (!state.paused && !state.practiceStarted) {
      showMoodPrompt("before");
      return;
    }
    startTimer();
  }

  function startTimer() {
    if (!state.practiceStarted) {
      state.practiceStarted = true;
      state.sessionStartedAt = Date.now();
    }
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
        updateSparkTrail(getPhases()[state.phase].side, 0);
        renderSettings();
        setButtonMode();
        recordCompletedSession();
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
    updateSparkTrail(current.side, Math.min(1, Math.max(0, elapsed)));
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
    state.practiceStarted = false;
    state.sessionStartedAt = 0;
    state.moodBefore = null;
    state.currentRecordId = null;
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
  ui.themeToggle.addEventListener("click", () => setTheme(theme === "dark" ? "light" : "dark"));
  ui.statsToggle.addEventListener("click", () => ui.statsPanel.hidden ? openStatistics() : closeStatistics());
  ui.closeStats.addEventListener("click", closeStatistics);
  ui.statsTabs.forEach((tab) => tab.addEventListener("click", () => {
    statsView = tab.dataset.statsView;
    if (statsView === "months") selectedYear = Number(selectedMonth.slice(0, 4));
    else {
      const monthPart = selectedMonth.slice(5);
      selectedMonth = `${selectedYear}-${monthPart}`;
      if (selectedMonth > localMonthKey(new Date())) selectedMonth = localMonthKey(new Date());
    }
    renderStatistics();
  }));
  ui.periodPrev.addEventListener("click", () => moveStatisticsPeriod(-1));
  ui.periodNext.addEventListener("click", () => moveStatisticsPeriod(1));
  ui.statsContent.addEventListener("click", (event) => {
    const monthButton = event.target.closest("[data-month]");
    if (!monthButton) return;
    selectedMonth = monthButton.dataset.month;
    selectedYear = Number(selectedMonth.slice(0, 4));
    statsView = "days";
    renderStatistics();
  });
  ui.clearStats.addEventListener("click", () => {
    if (!sessions.length || !window.confirm("Удалить всю историю практик и настроения из этого браузера?")) return;
    sessions = [];
    saveSessions();
    renderStatistics();
  });
  ui.moodOptions.forEach((button) => button.addEventListener("click", () => chooseMood(button.dataset.mood)));
  ui.moodSkip.addEventListener("click", skipMoodPrompt);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !ui.moodOverlay.hidden) {
      skipMoodPrompt();
      return;
    }
    if (!ui.moodOverlay.hidden || event.code !== "Space" || event.repeat || ["BUTTON", "INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
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

  setTheme(theme, false);
  createSparkParticles();
  renderSettings();
  renderPhase(0);
  ui.countdown.textContent = String(getPhases()[0].seconds);
  setButtonMode();
})();
