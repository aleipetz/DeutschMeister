(function () {
  "use strict";

  var STORAGE_KEY = "germanVocab.v1";
  var CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"];
  var LEARN_SESSION_SIZE = 10;
  var REVIEW_SESSION_SIZE = 30;

  // ---------------------------------------------------------------------
  // Content indexing (VOCAB_ENTRIES / THEMES / VERB_FAMILIES come from data.js)
  // ---------------------------------------------------------------------
  var entries = (typeof VOCAB_ENTRIES !== "undefined" ? VOCAB_ENTRIES : []);
  var themesList = (typeof THEMES !== "undefined" ? THEMES : []);
  var verbFamilies = (typeof VERB_FAMILIES !== "undefined" ? VERB_FAMILIES : { families: [] });

  var entriesById = {};
  entries.forEach(function (e) { entriesById[e.id] = e; });

  var themesById = {};
  themesList.forEach(function (t) { themesById[t.id] = t; });

  var entriesByLevel = {};
  CEFR_ORDER.forEach(function (lvl) { entriesByLevel[lvl] = []; });
  entries.forEach(function (e) {
    if (entriesByLevel[e.cefr]) entriesByLevel[e.cefr].push(e);
  });
  CEFR_ORDER.forEach(function (lvl) {
    entriesByLevel[lvl].sort(function (a, b) {
      return (a.priority - b.priority) || a.id.localeCompare(b.id);
    });
  });

  // ---------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------
  function todayKey(date) {
    var d = date || new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function defaultState() {
    return {
      progress: {},
      profile: {
        totalXP: 0,
        currentStreakDays: 0,
        longestStreakDays: 0,
        lastActiveDate: null,
        streakFreezesAvailable: 0,
        dailyGoalXP: 50,
        todayXP: 0,
        todayDate: todayKey(),
        goalMetToday: false,
        bestCombo: 0,
        totalQuizQuestions: 0,
        totalQuizCorrect: 0,
        hadPerfectQuiz10: false,
      },
      achievements: [],
      dailyActivity: {},
      settings: { levelOverride: "auto", speechRate: 0.95, onboarded: false },
    };
  }

  var state = loadState();

  function loadState() {
    var raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { /* private mode etc */ }
    if (!raw) return defaultState();
    try {
      var parsed = JSON.parse(raw);
      var base = defaultState();
      return {
        progress: parsed.progress || base.progress,
        profile: Object.assign(base.profile, parsed.profile || {}),
        achievements: parsed.achievements || base.achievements,
        dailyActivity: parsed.dailyActivity || base.dailyActivity,
        settings: Object.assign(base.settings, parsed.settings || {}),
      };
    } catch (e) {
      console.error("Failed to parse saved progress, starting fresh.", e);
      return defaultState();
    }
  }

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { console.error("Save failed", e); }
  }

  function checkDayRollover() {
    var key = todayKey();
    if (state.profile.todayDate !== key) {
      state.profile.todayDate = key;
      state.profile.todayXP = 0;
      state.profile.goalMetToday = false;
    }
  }

  function recordDailyActivity(patch) {
    var key = todayKey();
    var day = state.dailyActivity[key] || { xpEarned: 0, reviewsCompleted: 0, newWordsLearned: 0 };
    if (patch.xpEarned) day.xpEarned += patch.xpEarned;
    if (patch.reviewsCompleted) day.reviewsCompleted += patch.reviewsCompleted;
    if (patch.newWordsLearned) day.newWordsLearned += patch.newWordsLearned;
    state.dailyActivity[key] = day;
  }

  /** Awards XP, updates today/total XP, streak (on goal-met), returns {goalJustMet}. */
  function awardXP(amount) {
    checkDayRollover();
    state.profile.totalXP += amount;
    state.profile.todayXP += amount;

    var goalJustMet = false;
    if (!state.profile.goalMetToday && state.profile.todayXP >= state.profile.dailyGoalXP) {
      state.profile.goalMetToday = true;
      goalJustMet = true;
      state.profile = Object.assign(state.profile, Engine.recordGoalMet(state.profile, new Date()));
    }
    return { goalJustMet: goalJustMet };
  }

  // ---------------------------------------------------------------------
  // Current level + queues
  // ---------------------------------------------------------------------
  function masteredCountForLevel(lvl) {
    var count = 0;
    entriesByLevel[lvl].forEach(function (e) {
      var p = state.progress[e.id];
      if (p && Engine.masteryState(p) === Engine.MASTERY.MASTERED) count++;
    });
    return count;
  }

  function computeCurrentLevel() {
    if (state.settings.levelOverride && state.settings.levelOverride !== "auto") {
      return state.settings.levelOverride;
    }
    var fallback = null;
    for (var i = 0; i < CEFR_ORDER.length; i++) {
      var lvl = CEFR_ORDER[i];
      var total = entriesByLevel[lvl].length;
      if (total === 0) continue;
      fallback = lvl;
      var mastered = masteredCountForLevel(lvl);
      if (mastered < total) return lvl;
    }
    return fallback || "A1";
  }

  function newWordsQueue(level) {
    return entriesByLevel[level].filter(function (e) { return !state.progress[e.id]; }).slice(0, LEARN_SESSION_SIZE);
  }

  function dueQueue() {
    var now = new Date();
    var due = [];
    Object.keys(state.progress).forEach(function (id) {
      var p = state.progress[id];
      if (entriesById[id] && Engine.isDue(p, now)) due.push(p);
    });
    due.sort(function (a, b) { return new Date(a.nextReviewDate) - new Date(b.nextReviewDate); });
    return due.slice(0, REVIEW_SESSION_SIZE);
  }

  // ---------------------------------------------------------------------
  // Achievements catalog
  // ---------------------------------------------------------------------
  var ACHIEVEMENTS = [
    { id: "streak_7", emoji: "🔥", title: "Week Warrior", desc: "7-day streak", check: function (c) { return c.profile.longestStreakDays >= 7; } },
    { id: "streak_30", emoji: "🔥", title: "Monthly Master", desc: "30-day streak", check: function (c) { return c.profile.longestStreakDays >= 30; } },
    { id: "streak_100", emoji: "💯", title: "Centurion", desc: "100-day streak", check: function (c) { return c.profile.longestStreakDays >= 100; } },
    { id: "combo_10", emoji: "⚡", title: "Combo Breaker", desc: "10+ combo in one session", check: function (c) { return c.profile.bestCombo >= 10; } },
    { id: "mastered_10", emoji: "🌱", title: "First Sprouts", desc: "10 words mastered", check: function (c) { return c.masteredTotal >= 10; } },
    { id: "mastered_50", emoji: "🌿", title: "Growing Strong", desc: "50 words mastered", check: function (c) { return c.masteredTotal >= 50; } },
    { id: "mastered_150", emoji: "🌳", title: "Vocabulary Tree", desc: "150 words mastered", check: function (c) { return c.masteredTotal >= 150; } },
    { id: "mastered_300", emoji: "🏔️", title: "Word Mountain", desc: "300 words mastered", check: function (c) { return c.masteredTotal >= 300; } },
    { id: "verb_master", emoji: "🧩", title: "Verb Master", desc: "20 phrasal/composite verbs mastered", check: function (c) { return c.verbMastered >= 20; } },
    { id: "level_a1", emoji: "🥉", title: "A1 Complete", desc: "Mastered every A1 word", check: function (c) { return c.levelComplete.A1; } },
    { id: "level_a2", emoji: "🥈", title: "A2 Complete", desc: "Mastered every A2 word", check: function (c) { return c.levelComplete.A2; } },
    { id: "level_b1", emoji: "🥇", title: "B1 Complete", desc: "Mastered every B1 word", check: function (c) { return c.levelComplete.B1; } },
    { id: "quiz_25", emoji: "🧠", title: "Quiz Whiz", desc: "Answer 25 quiz questions", check: function (c) { return (c.profile.totalQuizQuestions || 0) >= 25; } },
    { id: "quiz_perfect", emoji: "🎯", title: "Perfectionist", desc: "100% on a 10+ question quiz", check: function (c) { return !!c.profile.hadPerfectQuiz10; } },
  ];

  function achievementContext() {
    var masteredTotal = 0, verbMastered = 0;
    var levelComplete = {};
    Object.keys(state.progress).forEach(function (id) {
      var p = state.progress[id];
      var entry = entriesById[id];
      if (!entry) return;
      if (Engine.masteryState(p) === Engine.MASTERY.MASTERED) {
        masteredTotal++;
        if (entry.pos === "phrasal_verb" || entry.pos === "composite_verb") verbMastered++;
      }
    });
    CEFR_ORDER.forEach(function (lvl) {
      var total = entriesByLevel[lvl].length;
      levelComplete[lvl] = total > 0 && masteredCountForLevel(lvl) === total;
    });
    return { profile: state.profile, masteredTotal: masteredTotal, verbMastered: verbMastered, levelComplete: levelComplete };
  }

  function evaluateAchievements(announce) {
    var ctx = achievementContext();
    var unlockedIds = state.achievements.map(function (a) { return a.id; });
    var newlyUnlocked = [];
    ACHIEVEMENTS.forEach(function (a) {
      if (unlockedIds.indexOf(a.id) !== -1) return;
      if (a.check(ctx)) {
        state.achievements.push({ id: a.id, dateUnlocked: new Date().toISOString() });
        newlyUnlocked.push(a);
      }
    });
    if (newlyUnlocked.length) saveState();
    if (announce && newlyUnlocked.length) {
      showCelebration("🏆", newlyUnlocked[0].title + " unlocked!", newlyUnlocked[0].desc);
    }
    return newlyUnlocked;
  }

  // ---------------------------------------------------------------------
  // DOM helpers
  // ---------------------------------------------------------------------
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function navigate(screen) {
    document.querySelectorAll(".screen").forEach(function (el) { el.classList.toggle("is-active", el.dataset.screen === screen); });
    document.querySelectorAll(".tab-btn").forEach(function (el) { el.classList.toggle("is-active", el.dataset.nav === screen); });
    if (screen === "home") renderHome();
    if (screen === "learn") startLearnSession();
    if (screen === "review") startReviewSession();
    if (screen === "dashboard") renderDashboard();
    if (screen === "quiz") renderQuizHub();
    if (screen === "achievements") renderAchievements();
    if (screen === "settings") renderSettings();
  }

  function showCelebration(emoji, title, subtitle) {
    $("celebration-emoji").textContent = emoji;
    $("celebration-title").textContent = title;
    $("celebration-subtitle").textContent = subtitle || "";
    $("celebration-overlay").hidden = false;
  }

  // ---------------------------------------------------------------------
  // Home
  // ---------------------------------------------------------------------
  function renderHome() {
    checkDayRollover();
    saveState();
    var level = computeCurrentLevel();
    var due = dueQueue();
    var masteredTotal = achievementContext().masteredTotal;

    $("streak-count").textContent = state.profile.currentStreakDays;
    $("today-xp").textContent = state.profile.todayXP;
    $("stat-due").textContent = due.length;
    $("stat-mastered").textContent = masteredTotal;
    $("stat-level-name").textContent = level;
    $("review-due-badge").textContent = due.length;

    var pct = Math.min(1, state.profile.todayXP / Math.max(1, state.profile.dailyGoalXP));
    var circumference = 2 * Math.PI * 52;
    $("xp-ring-fill").style.strokeDasharray = circumference;
    $("xp-ring-fill").style.strokeDashoffset = circumference * (1 - pct);

    var newAvailable = newWordsQueue(level).length;
    $("home-subtitle").textContent = newAvailable > 0
      ? newAvailable + " new word" + (newAvailable === 1 ? "" : "s") + " ready in " + level
      : "You're caught up on new words for " + level + " — nice work!";
    $("start-learn-btn").disabled = newAvailable === 0;
    $("start-learn-btn").style.opacity = newAvailable === 0 ? 0.5 : 1;
  }

  // ---------------------------------------------------------------------
  // Learn session
  // ---------------------------------------------------------------------
  var learnSession = null;

  function startLearnSession() {
    var level = computeCurrentLevel();
    var queue = newWordsQueue(level);
    learnSession = { queue: queue, index: 0, learned: 0, phase: "learning", level: level };
    $("learn-combo-display").hidden = true;
    renderLearnCard();
  }

  function renderLearnCard() {
    var container = $("learn-content");
    if (!learnSession || learnSession.index >= learnSession.queue.length) {
      if (learnSession && learnSession.phase === "learning") {
        if (learnSession.learned > 0) {
          recordDailyActivity({ newWordsLearned: learnSession.learned });
          saveState();
        }
        var learnedEntries = learnSession.queue.filter(function (e) { return !!state.progress[e.id]; });
        if (learnedEntries.length > 0) {
          learnSession.phase = "quiz";
          var quizQuestions = QuizEngine.buildSession(learnedEntries, entriesByLevel[learnSession.level], {});
          startQuizFlow({
            containerEl: container,
            progressEl: $("learn-progress"),
            comboDisplayEl: $("learn-combo-display"),
            comboCountEl: $("learn-combo-count"),
            questions: quizQuestions,
            onComplete: function (stats) {
              learnSession.phase = "done";
              learnSession.quizStats = stats;
              if (stats.total >= 10 && stats.correct === stats.total) state.profile.hadPerfectQuiz10 = true;
              saveState();
              evaluateAchievements(true);
              renderLearnCard();
            },
          });
          return;
        }
        learnSession.phase = "done";
      }
      var quizStats = learnSession && learnSession.quizStats;
      container.innerHTML =
        '<div class="session-summary"><div class="big-emoji">🎉</div>' +
        "<h2>Session complete!</h2><p class=\"muted\">" +
        (learnSession ? learnSession.learned : 0) + " new word(s) learned" +
        (quizStats ? " · quiz: " + quizStats.correct + "/" + quizStats.total + " correct (+" + quizStats.xp + " XP)" : "") +
        "</p>" +
        '<button class="btn btn-primary btn-large" data-nav="home">Back to Home</button></div>';
      bindNavButtons(container);
      $("learn-progress").textContent = learnSession ? learnSession.queue.length + " / " + learnSession.queue.length : "0 / 0";
      return;
    }

    var entry = learnSession.queue[learnSession.index];
    $("learn-progress").textContent = (learnSession.index + 1) + " / " + learnSession.queue.length;
    container.innerHTML = wordCardHTML(entry, { showAnswer: true });
    bindCardInteractions(container, entry);

    var speakBtn = container.querySelector(".speak-btn");
    if (speakBtn) speakBtn.addEventListener("click", function () { speakEntry(entry, speakBtn); });
    setTimeout(function () { speakEntry(entry, speakBtn); }, 300);

    var nextBtn = container.querySelector("#learn-next-btn");
    if (nextBtn) {
      nextBtn.addEventListener("click", function () {
        if (!state.progress[entry.id]) {
          state.progress[entry.id] = Engine.createProgress(entry.id, new Date());
          learnSession.learned++;
          saveState();
        }
        learnSession.index++;
        renderLearnCard();
      });
    }
  }

  // ---------------------------------------------------------------------
  // Review session
  // ---------------------------------------------------------------------
  var reviewSession = null;

  function startReviewSession() {
    var due = dueQueue();
    reviewSession = { queue: due, index: 0, combo: 0, correct: 0, xp: 0 };
    $("combo-display").hidden = true;
    renderReviewCard();
  }

  function renderReviewCard() {
    var container = $("review-content");
    if (!reviewSession || reviewSession.index >= reviewSession.queue.length) {
      if (reviewSession) {
        state.profile.bestCombo = Math.max(state.profile.bestCombo, reviewSession.combo);
        recordDailyActivity({ reviewsCompleted: reviewSession.queue.length });
        saveState();
        evaluateAchievements(true);
      }
      $("combo-display").hidden = true;
      var total = reviewSession ? reviewSession.queue.length : 0;
      var correct = reviewSession ? reviewSession.correct : 0;
      var xp = reviewSession ? reviewSession.xp : 0;
      container.innerHTML =
        '<div class="session-summary"><div class="big-emoji">✅</div>' +
        "<h2>Review complete!</h2><p class=\"muted\">" + correct + " / " + total + " correct · +" + xp + " XP</p>" +
        '<button class="btn btn-primary btn-large" data-nav="home">Back to Home</button></div>';
      bindNavButtons(container);
      $("review-progress").textContent = total + " / " + total;
      return;
    }

    var progress = reviewSession.queue[reviewSession.index];
    var entry = entriesById[progress.id];
    $("review-progress").textContent = (reviewSession.index + 1) + " / " + reviewSession.queue.length;

    container.innerHTML = wordCardHTML(entry, { showAnswer: false });
    bindCardInteractions(container, entry);
    var speakBtn = container.querySelector(".speak-btn");
    if (speakBtn) speakBtn.addEventListener("click", function () { speakEntry(entry, speakBtn); });

    var revealBtn = container.querySelector("#reveal-btn");
    if (revealBtn) {
      revealBtn.addEventListener("click", function () {
        container.innerHTML = wordCardHTML(entry, { showAnswer: true, grading: true });
        bindCardInteractions(container, entry);
        var sb = container.querySelector(".speak-btn");
        if (sb) sb.addEventListener("click", function () { speakEntry(entry, sb); });
        setTimeout(function () { speakEntry(entry, sb); }, 200);

        container.querySelector("#grade-wrong").addEventListener("click", function () { gradeReview(progress, entry, false); });
        container.querySelector("#grade-right").addEventListener("click", function () { gradeReview(progress, entry, true); });
      });
    }
  }

  function gradeReview(progressRecord, entry, wasCorrect) {
    var result = Engine.applyReview(progressRecord, wasCorrect, entry.priority, new Date());
    state.progress[entry.id] = result.progress;

    if (wasCorrect) {
      reviewSession.combo++;
      reviewSession.correct++;
    } else {
      reviewSession.combo = 0;
    }
    var multiplier = Engine.comboMultiplier(reviewSession.combo);
    var xpEarned = Math.round(result.xpEarned * multiplier);
    reviewSession.xp += xpEarned;

    var xpResult = awardXP(xpEarned);
    saveState();

    if (reviewSession.combo >= 3) {
      $("combo-display").hidden = false;
      $("combo-count").textContent = reviewSession.combo;
    } else {
      $("combo-display").hidden = true;
    }

    reviewSession.index++;

    if (xpResult.goalJustMet) {
      showCelebration("🎯", "Daily goal reached!", state.profile.currentStreakDays + "-day streak");
    }

    renderReviewCard();
  }

  // ---------------------------------------------------------------------
  // Quiz flow (shared by the post-Learn quiz and the standalone Quiz tab)
  // ---------------------------------------------------------------------
  var activeQuizFlow = null;

  function startQuizFlow(config) {
    activeQuizFlow = {
      questions: config.questions,
      index: 0,
      correct: 0,
      xp: 0,
      combo: 0,
      containerEl: config.containerEl,
      progressEl: config.progressEl,
      comboDisplayEl: config.comboDisplayEl,
      comboCountEl: config.comboCountEl,
      onComplete: config.onComplete,
    };
    if (activeQuizFlow.comboDisplayEl) activeQuizFlow.comboDisplayEl.hidden = true;
    renderQuizStep();
  }

  function renderQuizStep() {
    var flow = activeQuizFlow;
    var container = flow.containerEl;

    if (flow.index >= flow.questions.length) {
      if (flow.comboDisplayEl) flow.comboDisplayEl.hidden = true;
      flow.onComplete({ total: flow.questions.length, correct: flow.correct, xp: flow.xp });
      return;
    }

    var q = flow.questions[flow.index];
    if (flow.progressEl) flow.progressEl.textContent = (flow.index + 1) + " / " + flow.questions.length;
    container.innerHTML = quizQuestionHTML(q);

    if (q.type === "listening") {
      var listenBtn = container.querySelector(".speak-btn");
      if (listenBtn) listenBtn.addEventListener("click", function () { speakEntry({ lemma_de: q.audioText }, listenBtn); });
      setTimeout(function () { speakEntry({ lemma_de: q.audioText }, listenBtn); }, 300);
    }

    var optionBtns = container.querySelectorAll(".quiz-option-btn");
    optionBtns.forEach(function (btn) {
      btn.addEventListener("click", function () { handleQuizAnswer(q, parseInt(btn.dataset.index, 10), optionBtns, container); });
    });
  }

  function quizQuestionHTML(q) {
    var entry = q.entry;
    var theme = themeFor(entry);
    var colors = THEME_COLORS[entry.themes[0]] || ["#6d5ce8", "#efeaff", "#5645d1"];
    var styleVars = 'style="--theme-color:' + colors[0] + ";--theme-color-light:" + colors[1] + ";--theme-color-dark:" + colors[2] + '"';

    var promptHTML;
    if (q.type === "listening") {
      promptHTML = '<button class="speak-btn" aria-label="Play pronunciation">🔊</button>';
    } else if (q.type === "cloze") {
      promptHTML = '<div class="quiz-prompt is-sentence">' + esc(q.prompt) + "</div>";
    } else {
      promptHTML = '<div class="quiz-prompt">' + esc(q.prompt) + "</div>";
    }

    var optionsHTML = q.options.map(function (opt, idx) {
      return '<button class="quiz-option-btn" data-index="' + idx + '">' + esc(opt) + "</button>";
    }).join("");

    return '<div class="word-card" ' + styleVars + '>' +
      '<div class="word-card-theme">' + theme.icon + " " + esc(theme.label_en) + "</div>" +
      '<div class="quiz-prompt-label">' + esc(q.promptLabel) + "</div>" +
      promptHTML +
      '<div class="quiz-options">' + optionsHTML + "</div>" +
      "</div>";
  }

  function handleQuizAnswer(q, selectedIndex, optionBtns, container) {
    var flow = activeQuizFlow;
    var selected = q.options[selectedIndex];
    var wasCorrect = selected === q.correctAnswer;
    var entry = q.entry;

    optionBtns.forEach(function (btn) {
      var btnIndex = parseInt(btn.dataset.index, 10);
      btn.classList.add("is-disabled");
      if (q.options[btnIndex] === q.correctAnswer) btn.classList.add("is-correct");
      else if (btnIndex === selectedIndex) btn.classList.add("is-wrong");
    });

    var xpEarned = 0;
    var progressRecord = state.progress[entry.id];
    if (progressRecord) {
      var result = Engine.applyReview(progressRecord, wasCorrect, entry.priority, new Date());
      state.progress[entry.id] = result.progress;
      flow.combo = wasCorrect ? flow.combo + 1 : 0;
      xpEarned = Math.round(result.xpEarned * Engine.comboMultiplier(flow.combo));
      flow.xp += xpEarned;
    }
    if (wasCorrect) flow.correct++;

    state.profile.totalQuizQuestions = (state.profile.totalQuizQuestions || 0) + 1;
    if (wasCorrect) state.profile.totalQuizCorrect = (state.profile.totalQuizCorrect || 0) + 1;
    state.profile.bestCombo = Math.max(state.profile.bestCombo || 0, flow.combo);

    var xpResult = xpEarned > 0 ? awardXP(xpEarned) : { goalJustMet: false };
    saveState();

    if (flow.comboDisplayEl) {
      if (flow.combo >= 3) { flow.comboDisplayEl.hidden = false; flow.comboCountEl.textContent = flow.combo; }
      else flow.comboDisplayEl.hidden = true;
    }

    var feedbackHTML = '<div class="quiz-feedback ' + (wasCorrect ? "is-correct" : "is-wrong") + '">' +
      (wasCorrect ? "✅ Correct!" : "❌ Not quite — correct answer: " + esc(q.correctAnswer)) + "</div>";
    var explanationHTML = '<div class="quiz-explanation">' + esc(entry.example_de) + "<br>" + esc(entry.example_en) + "</div>";
    container.insertAdjacentHTML("beforeend", feedbackHTML + explanationHTML +
      '<div class="card-actions"><button class="btn btn-primary" id="quiz-next-btn">Next →</button></div>');

    container.querySelector("#quiz-next-btn").addEventListener("click", function () {
      activeQuizFlow.index++;
      renderQuizStep();
      if (xpResult.goalJustMet) showCelebration("🎯", "Daily goal reached!", state.profile.currentStreakDays + "-day streak");
    });
  }

  // ---------------------------------------------------------------------
  // Standalone Quiz tab — test everything you've learned so far
  // ---------------------------------------------------------------------
  function renderQuizHub() {
    var container = $("quiz-content");
    $("quiz-combo-display").hidden = true;
    var eligible = Object.keys(state.progress).filter(function (id) { return !!entriesById[id]; });
    var count = eligible.length;

    if (count === 0) {
      $("quiz-progress").textContent = "0 / 0";
      container.innerHTML = '<div class="empty-state"><span class="big-emoji">🧠</span>Learn some words first — then come back here to quiz yourself on everything you know.</div>';
      return;
    }

    var sessionSize = Math.min(20, count);
    $("quiz-progress").textContent = "";
    container.innerHTML =
      '<div class="word-card quiz-hub-card">' +
      '<div class="word-card-theme">🧠 Review Everything</div>' +
      '<p class="muted">Multiple-choice questions drawn from every word you\'ve learned so far.</p>' +
      '<div class="quiz-hub-count">' + count + "</div>" +
      '<p class="muted small">word' + (count === 1 ? "" : "s") + ' learned so far</p>' +
      '<div class="card-actions"><button class="btn btn-primary btn-large" id="start-standalone-quiz-btn">Start Quiz (' + sessionSize + " questions)</button></div>" +
      "</div>";

    container.querySelector("#start-standalone-quiz-btn").addEventListener("click", function () {
      var targetEntries = eligible.map(function (id) { return entriesById[id]; });
      var questions = QuizEngine.buildSession(targetEntries, entries, { limit: sessionSize });
      startQuizFlow({
        containerEl: container,
        progressEl: $("quiz-progress"),
        comboDisplayEl: $("quiz-combo-display"),
        comboCountEl: $("quiz-combo-count"),
        questions: questions,
        onComplete: function (stats) {
          if (stats.total >= 10 && stats.correct === stats.total) state.profile.hadPerfectQuiz10 = true;
          recordDailyActivity({ reviewsCompleted: stats.total });
          saveState();
          evaluateAchievements(true);
          renderQuizSummary(stats);
        },
      });
    });
  }

  function renderQuizSummary(stats) {
    var container = $("quiz-content");
    $("quiz-progress").textContent = stats.total + " / " + stats.total;
    container.innerHTML =
      '<div class="session-summary"><div class="big-emoji">🧠</div>' +
      "<h2>Quiz complete!</h2><p class=\"muted\">" + stats.correct + " / " + stats.total + " correct · +" + stats.xp + " XP</p>" +
      '<div class="cta-row"><button class="btn btn-primary btn-large" id="quiz-again-btn">Take another quiz</button>' +
      '<button class="btn btn-secondary btn-large" data-nav="home">Back to Home</button></div></div>';
    bindNavButtons(container);
    container.querySelector("#quiz-again-btn").addEventListener("click", renderQuizHub);
  }

  // ---------------------------------------------------------------------
  // Word card rendering (shared by Learn + Review)
  // ---------------------------------------------------------------------
  function themeFor(entry) {
    var id = entry.themes && entry.themes[0];
    return themesById[id] || { icon: "📘", label_en: "General" };
  }

  var THEME_COLORS = {
    food: ["#ff9f1c", "#fff3e0", "#b96b00"], home: ["#3b82f6", "#e8f1ff", "#1d4ed8"],
    daily_routine: ["#6d5ce8", "#efeaff", "#5645d1"], travel: ["#00b8a3", "#e2fbf7", "#0a7d6d"],
    people: ["#ec4899", "#fde7f3", "#be185d"], work: ["#334155", "#e2e8f0", "#1e293b"],
    emotions: ["#f5c518", "#fff9db", "#8a6d00"], nature: ["#22c55e", "#e8fbee", "#17924a"],
    body_health: ["#ef4444", "#fdeaea", "#b91c1c"], shopping: ["#ec4899", "#fde7f3", "#be185d"],
    communication: ["#3b82f6", "#e8f1ff", "#1d4ed8"], technology: ["#334155", "#e2e8f0", "#1e293b"],
    education: ["#6d5ce8", "#efeaff", "#5645d1"], time_numbers: ["#00b8a3", "#e2fbf7", "#0a7d6d"],
    grammar_glue: ["#94a3b8", "#f1f5f9", "#475569"],
    society: ["#0ea5e9", "#e0f2fe", "#075985"], abstract_ideas: ["#8b5cf6", "#f3e8ff", "#6d28d9"],
    argumentation: ["#f59e0b", "#fef3c7", "#92400e"],
  };

  function wordCardHTML(entry, opts) {
    var theme = themeFor(entry);
    var colors = THEME_COLORS[entry.themes[0]] || ["#6d5ce8", "#efeaff", "#5645d1"];
    var styleVars = 'style="--theme-color:' + colors[0] + ";--theme-color-light:" + colors[1] + ";--theme-color-dark:" + colors[2] + '"';

    var genderBadge = "";
    if (entry.pos === "noun" && entry.noun) {
      genderBadge = '<span class="gender-badge gender-' + entry.noun.gender + '">' + entry.noun.gender + "</span>";
    }
    var posLabel = { noun: "Noun", adjective: "Adjective", verb: "Verb", phrasal_verb: "Phrasal Verb", composite_verb: "Composite Verb", other: "Word" }[entry.pos] || "Word";

    var html = '<div class="word-card" ' + styleVars + '>';
    html += '<div class="word-card-theme">' + theme.icon + " " + esc(theme.label_en) + "</div>";
    html += '<div class="pos-badge">' + posLabel + "</div><br>";
    html += genderBadge + '<span class="word-lemma">' + esc(entry.lemma_de) + "</span>";
    if (entry.noun && entry.noun.plural_de) {
      html += '<div class="muted small">Plural: ' + esc(entry.noun.plural_de) + "</div>";
    }
    html += '<button class="speak-btn" aria-label="Play pronunciation">🔊</button>';

    if (opts.showAnswer) {
      html += '<div class="translation-list">' + esc(entry.translations_en.join(", ")) + "</div>";
      html += '<div class="example-block"><div class="example-de">' + esc(entry.example_de) + '</div><div class="example-en">' + esc(entry.example_en) + "</div></div>";

      if (entry.verb && entry.verb.particle_meaning_hint) {
        html += '<div class="particle-hint">🧩 <b>' + esc(entry.verb.particle) + "</b>: " + esc(entry.verb.particle_meaning_hint) + "</div>";
      }
      if (entry.verb) {
        html += '<div class="verb-forms"><b>Present:</b> ' + esc(entry.verb.present_3sg) + " &nbsp; <b>Perfekt:</b> " + esc(entry.verb.perfekt) + "</div>";
      }
      if (entry.adjective && (entry.adjective.comparative_irregular || entry.adjective.superlative_irregular)) {
        html += '<div class="verb-forms"><b>Comparative:</b> ' + esc(entry.adjective.comparative_irregular || "—") +
          " &nbsp; <b>Superlative:</b> " + esc(entry.adjective.superlative_irregular || "—") + "</div>";
      }
      if (entry.notes) {
        html += '<div class="muted small" style="margin-top:10px;">💡 ' + esc(entry.notes) + "</div>";
      }

      if (opts.grading) {
        html += '<div class="card-actions"><button class="btn btn-secondary" id="grade-wrong">😕 Didn\'t know</button>' +
          '<button class="btn btn-primary" id="grade-right">✅ Knew it</button></div>';
      } else {
        html += '<div class="card-actions"><button class="btn btn-primary" id="learn-next-btn">Got it → Next</button></div>';
      }
    } else {
      html += '<div class="reveal-hint">Try to recall the meaning, then reveal.</div>';
      html += '<div class="card-actions"><button class="btn btn-primary" id="reveal-btn">Show answer</button></div>';
    }
    html += "</div>";
    return html;
  }

  function bindCardInteractions() { /* reserved for future per-card wiring */ }

  function bindNavButtons(scope) {
    (scope || document).querySelectorAll("[data-nav]").forEach(function (btn) {
      btn.addEventListener("click", function () { navigate(btn.dataset.nav); });
    });
  }

  function speakEntry(entry, btnEl) {
    if (!entry) return;
    if (btnEl) btnEl.classList.add("is-speaking");
    Speech.speak(entry.lemma_de, {
      rate: state.settings.speechRate,
      onEnd: function () { if (btnEl) btnEl.classList.remove("is-speaking"); },
      onError: function () { if (btnEl) btnEl.classList.remove("is-speaking"); },
    });
  }

  // ---------------------------------------------------------------------
  // Dashboard
  // ---------------------------------------------------------------------
  var POS_VALUES = ["noun", "adjective", "verb", "phrasal_verb", "composite_verb", "other"];

  function populateDashboardFilters() {
    var levelSel = $("filter-level");
    if (!levelSel.dataset.populated) {
      levelSel.innerHTML = '<option value="all">All levels</option>' +
        CEFR_ORDER.map(function (l) { return '<option value="' + l + '">' + l + "</option>"; }).join("");
      levelSel.dataset.populated = "1";
      levelSel.addEventListener("change", renderDashboard);
    }
    var posSel = $("filter-pos");
    if (!posSel.dataset.populated) {
      posSel.innerHTML = '<option value="all">All word types</option>' +
        POS_VALUES.map(function (p) { return '<option value="' + p + '">' + p.replace("_", " ") + "</option>"; }).join("");
      posSel.dataset.populated = "1";
      posSel.addEventListener("change", renderDashboard);
    }
  }

  function renderDashboard() {
    populateDashboardFilters();
    var selectedLevel = $("filter-level").value || "all";
    var selectedPos = $("filter-pos").value || "all";
    var levels = selectedLevel === "all" ? CEFR_ORDER : [selectedLevel];

    var rowsHTML = "";
    levels.forEach(function (lvl) {
      var levelEntries = entriesByLevel[lvl].filter(function (e) { return selectedPos === "all" || e.pos === selectedPos; });
      var total = levelEntries.length;
      var counts = { mastered: 0, familiar: 0, learning: 0, newC: 0 };
      levelEntries.forEach(function (e) {
        var p = state.progress[e.id];
        if (!p) { counts.newC++; return; }
        var m = Engine.masteryState(p);
        if (m === Engine.MASTERY.MASTERED) counts.mastered++;
        else if (m === Engine.MASTERY.FAMILIAR) counts.familiar++;
        else counts.learning++;
      });
      var pct = function (n) { return total === 0 ? 0 : (n / total * 100); };
      var introduced = counts.mastered + counts.familiar + counts.learning;
      rowsHTML += '<div class="coverage-row"><div class="coverage-row-top"><span>' + lvl + '</span><span>' +
        counts.mastered + " mastered · " + introduced + " / " + total + " started</span></div>" +
        '<div class="coverage-track">' +
        '<div class="seg-mastered" style="width:' + pct(counts.mastered) + '%"></div>' +
        '<div class="seg-familiar" style="width:' + pct(counts.familiar) + '%"></div>' +
        '<div class="seg-learning" style="width:' + pct(counts.learning) + '%"></div>' +
        '<div class="seg-new" style="width:' + pct(counts.newC) + '%"></div>' +
        "</div></div>";
    });
    $("coverage-bars").innerHTML = rowsHTML + '<div class="coverage-legend">' +
      '<span><span class="legend-dot" style="background:var(--green)"></span>Mastered</span>' +
      '<span><span class="legend-dot" style="background:var(--teal)"></span>Familiar</span>' +
      '<span><span class="legend-dot" style="background:var(--orange)"></span>Learning</span>' +
      '<span><span class="legend-dot" style="background:var(--border)"></span>Not started</span></div>';

    renderHeatmap();
    renderVerbFamilies();
  }

  function renderHeatmap() {
    var cells = "";
    var now = new Date();
    for (var i = 83; i >= 0; i--) {
      var d = new Date(now.getTime());
      d.setDate(d.getDate() - i);
      var key = todayKey(d);
      var day = state.dailyActivity[key];
      var cls = "heat-cell";
      if (day) {
        if (day.xpEarned >= 100) cls += " heat-4";
        else if (day.xpEarned >= 50) cls += " heat-3";
        else if (day.xpEarned >= 20) cls += " heat-2";
        else if (day.xpEarned > 0) cls += " heat-1";
      }
      cells += '<div class="' + cls + '" title="' + key + (day ? " · " + day.xpEarned + " XP" : "") + '"></div>';
    }
    $("streak-heatmap").innerHTML = cells;
  }

  function renderVerbFamilies() {
    var families = (verbFamilies.families || []).filter(function (f) { return f.members.length > 1; });
    if (families.length === 0) {
      $("verb-families").innerHTML = '<div class="empty-state"><span class="big-emoji">🧩</span>No verb families yet — add more phrasal/composite verbs sharing a base verb.</div>';
      return;
    }
    var html = families.map(function (f) {
      var baseEntry = entriesById[f.base_verb];
      var baseLabel = baseEntry ? baseEntry.lemma_de : f.base_verb.replace("_verb", "");
      var members = f.members.map(function (m) {
        return '<div class="family-member"><span>' + esc(m.lemma_de) + '</span><span class="family-particle">' +
          esc(m.particle || "") + (m.particle_meaning_hint ? " — " + esc(m.particle_meaning_hint) : "") + "</span></div>";
      }).join("");
      return '<div class="family-card"><div class="family-base">' + esc(baseLabel) + "</div>" + members + "</div>";
    }).join("");
    $("verb-families").innerHTML = html;
  }

  // ---------------------------------------------------------------------
  // Achievements screen
  // ---------------------------------------------------------------------
  function renderAchievements() {
    evaluateAchievements(false);
    var unlockedIds = state.achievements.map(function (a) { return a.id; });
    var html = ACHIEVEMENTS.map(function (a) {
      var unlocked = unlockedIds.indexOf(a.id) !== -1;
      return '<div class="badge-tile' + (unlocked ? " is-unlocked" : "") + '" title="' + esc(a.desc) + '">' +
        '<span class="badge-emoji">' + a.emoji + "</span><div class=\"badge-title\">" + esc(a.title) + "</div></div>";
    }).join("");
    $("achievements-grid").innerHTML = html;
  }

  // ---------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------
  function renderSettings() {
    $("daily-goal-input").value = state.profile.dailyGoalXP;
    var levelSel = $("level-override");
    if (!levelSel.dataset.populated) {
      levelSel.innerHTML = '<option value="auto">Auto (recommended)</option>' +
        CEFR_ORDER.map(function (l) { return '<option value="' + l + '">' + l + "</option>"; }).join("");
      levelSel.dataset.populated = "1";
    }
    levelSel.value = state.settings.levelOverride;
    $("speech-rate").value = state.settings.speechRate;
    updateVoiceStatus();
  }

  function updateVoiceStatus() {
    var el = $("voice-status");
    if (!Speech.isSupported()) { el.textContent = "Speech synthesis isn't supported in this browser."; return; }
    if (!Speech.isReady()) {
      el.textContent = "Checking for a German voice…";
      setTimeout(updateVoiceStatus, 300);
      return;
    }
    el.textContent = Speech.hasGermanVoice()
      ? "A German voice is available on this device. ✅"
      : "No German voice found — check your OS/browser language & voice settings for the best experience.";
  }

  // ---------------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------------
  function init() {
    checkDayRollover();
    saveState();

    document.querySelectorAll("[data-nav]").forEach(function (btn) {
      btn.addEventListener("click", function () { navigate(btn.dataset.nav); });
    });

    $("start-review-btn").addEventListener("click", function () { navigate("review"); });
    $("start-learn-btn").addEventListener("click", function () { navigate("learn"); });
    $("settings-btn").addEventListener("click", function () { navigate("settings"); });
    $("celebration-close").addEventListener("click", function () { $("celebration-overlay").hidden = true; });

    $("daily-goal-input").addEventListener("change", function (e) {
      var v = parseInt(e.target.value, 10);
      if (!isNaN(v) && v > 0) { state.profile.dailyGoalXP = v; saveState(); }
    });
    $("level-override").addEventListener("change", function (e) {
      state.settings.levelOverride = e.target.value; saveState();
    });
    $("speech-rate").addEventListener("change", function (e) {
      state.settings.speechRate = parseFloat(e.target.value); saveState();
    });
    $("test-voice-btn").addEventListener("click", function () {
      Speech.speak("Das ist ein Test. Ich lerne Deutsch.", { rate: state.settings.speechRate });
    });

    $("export-btn").addEventListener("click", function () {
      var blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "german-vocab-progress-" + todayKey() + ".json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
    $("import-btn").addEventListener("click", function () { $("import-file").click(); });
    $("import-file").addEventListener("change", function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var parsed = JSON.parse(reader.result);
          if (!parsed || typeof parsed !== "object" || !parsed.progress || !parsed.profile) {
            throw new Error("File doesn't look like a valid progress export.");
          }
          if (confirm("This will replace your current progress with the imported file. Continue?")) {
            state = parsed;
            saveState();
            navigate("home");
            alert("Progress imported.");
          }
        } catch (err) {
          alert("Couldn't import that file: " + err.message);
        }
        $("import-file").value = "";
      };
      reader.readAsText(file);
    });
    $("reset-btn").addEventListener("click", function () {
      if (confirm("This permanently deletes all your progress, XP, and achievements. Are you sure?")) {
        state = defaultState();
        saveState();
        navigate("home");
      }
    });

    navigate("home");
    maybeShowOnboarding();
  }

  function maybeShowOnboarding() {
    if (state.settings.onboarded) return;
    var grid = $("onboarding-level-grid");
    grid.innerHTML = CEFR_ORDER.map(function (l) { return '<button class="level-pick-btn" data-level="' + l + '">' + l + "</button>"; }).join("");
    grid.querySelectorAll(".level-pick-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.settings.levelOverride = btn.dataset.level;
        state.settings.onboarded = true;
        saveState();
        $("onboarding-overlay").hidden = true;
        navigate("home");
      });
    });
    $("onboarding-overlay").hidden = false;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
