// Screens and wiring. Mirrors iOS Features/: four tabs (Home, Quiz, Progress, Badges), Learn and
// Review as full-screen sessions, Settings as a sheet, a level picker on first launch.
// Every rule lives in domain.js / sessions.js; this file only renders and routes taps.

import {
  ACHIEVEMENTS, addDays, CEFR_LEVELS, dayKey, decodeImport, encodeState, makeIndex, POS_LABELS, primaryTranslation,
} from './domain.js';
import { AppModel, makeStore } from './model.js';
import {
  finishReviewEverythingQuiz, LearnSession, makeReviewEverythingQuiz, ReviewSession,
} from './sessions.js';
import { SpeechService } from './speech.js';

const $view = document.getElementById('view');
const $tabbar = document.getElementById('tabbar');
const $modal = document.getElementById('modal-root');
const $celebration = document.getElementById('celebration-root');

const ui = {
  tab: 'home',
  session: null, // { kind: 'learn' | 'review', controller }
  quiz: { runner: null, summary: null },
  settingsOpen: false,
  progress: { level: '', pos: '', familiesShown: 20 },
  toast: null,
  lastSpokenKey: null,
  lastCardKey: null,
  nextCardKey: null,
  importFromOnboarding: false,
  reloadWhenIdle: false,
};

let model;
let speech;

// MARK: - Helpers

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const h = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const ICON_PATHS = {
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  quiz: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  progress: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  badges: '<circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  speaker: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>',
  back: '<polyline points="15 18 9 12 15 6"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]}</svg>`;

/// Per-theme accent colours: [main, light soft, light text] (iOS ThemePalette).
const THEME_COLORS = {
  food: ['#FF9F1C', '#FFF3E0', '#B96B00'], home: ['#3B82F6', '#E8F1FF', '#1D4ED8'],
  daily_routine: ['#6D5CE8', '#EFEAFF', '#5645D1'], travel: ['#00B8A3', '#E2FBF7', '#0A7D6D'],
  people: ['#EC4899', '#FDE7F3', '#BE185D'], work: ['#334155', '#E2E8F0', '#1E293B'],
  emotions: ['#F5C518', '#FFF9DB', '#8A6D00'], nature: ['#22C55E', '#E8FBEE', '#17924A'],
  body_health: ['#EF4444', '#FDEAEA', '#B91C1C'], shopping: ['#EC4899', '#FDE7F3', '#BE185D'],
  communication: ['#3B82F6', '#E8F1FF', '#1D4ED8'], technology: ['#334155', '#E2E8F0', '#1E293B'],
  education: ['#6D5CE8', '#EFEAFF', '#5645D1'], time_numbers: ['#00B8A3', '#E2FBF7', '#0A7D6D'],
  grammar_glue: ['#94A3B8', '#F1F5F9', '#475569'], society: ['#0EA5E9', '#E0F2FE', '#075985'],
  abstract_ideas: ['#8B5CF6', '#F3E8FF', '#6D28D9'], argumentation: ['#F59E0B', '#FEF3C7', '#92400E'],
};
const FALLBACK_THEME_COLORS = ['#6D5CE8', '#EFEAFF', '#5645D1'];

function themeStyle(entry) {
  const [main, soft, text] = THEME_COLORS[entry.themes?.[0]] ?? FALLBACK_THEME_COLORS;
  return `--theme-main:${main}`
    + `;--theme-soft:light-dark(${soft}, color-mix(in srgb, ${main} 30%, transparent))`
    + `;--theme-text:light-dark(${text}, ${soft})`;
}

function themeChip(entry) {
  const theme = model.index.themeFor(entry);
  return `<span class="chip theme-chip" style="background:var(--theme-soft);color:var(--theme-text)">${h(theme.icon)} ${h(theme.label_en)}</span>`;
}

const speakButton = (text) =>
  `<button class="speak-btn" data-action="speak" data-text="${h(text)}" aria-label="Play pronunciation">${icon('speaker')}</button>`;

const isStandalone = () => window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;

function readFlag(key) {
  try { return localStorage.getItem(key) === '1'; } catch { return false; }
}
function writeFlag(key) {
  try { localStorage.setItem(key, '1'); } catch { /* private mode */ }
}

function showToast(text) {
  ui.toast = text;
  render();
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { ui.toast = null; render(); }, 2600);
}

// MARK: - Rendering

let batching = 0;
let dirty = false;

function render() {
  if (batching) { dirty = true; return; }
  dirty = false;
  if (!model) return;

  const onboarding = !model.state.settings.onboarded;
  document.body.classList.toggle('immersive', onboarding || Boolean(ui.session));

  if (onboarding) $view.innerHTML = renderOnboarding();
  else if (ui.session?.kind === 'learn') $view.innerHTML = renderLearn(ui.session.controller);
  else if (ui.session?.kind === 'review') $view.innerHTML = renderReview(ui.session.controller);
  else $view.innerHTML = renderTab();

  $tabbar.innerHTML = renderTabbar();
  // Re-rendering the open sheet keeps its scroll position and doesn't replay the slide-up.
  const wasOpen = Boolean($modal.firstChild);
  const sheetScroll = $modal.querySelector('.sheet-body')?.scrollTop ?? 0;
  $modal.innerHTML = ui.settingsOpen && !onboarding ? renderSettings(!wasOpen) : '';
  const sheetBody = $modal.querySelector('.sheet-body');
  if (sheetBody && wasOpen) sheetBody.scrollTop = sheetScroll;
  $celebration.innerHTML = renderCelebration() + (ui.toast ? `<div class="toast" role="status">${h(ui.toast)}</div>` : '');
  document.body.classList.toggle('speaking', speech.isSpeaking);
  ui.lastCardKey = ui.nextCardKey;
  ui.nextCardKey = null;
  autoSpeak();
}

/// Class that plays the card's entrance animation, only when a different card appears
/// (every render replaces the HTML, so without this it would replay on each tap).
function cardEnter(key) {
  ui.nextCardKey = key;
  return key === ui.lastCardKey ? '' : ' enter';
}

/// Speaks a new Learn card or listening question once, as soon as it appears. Runs inside the tap
/// handler that showed it, which iOS requires before a page may play speech.
function autoSpeak() {
  let key = null;
  let text = null;
  const learn = ui.session?.kind === 'learn' ? ui.session.controller : null;
  const runner = activeRunner();
  if (learn?.current) {
    key = `learn:${learn.current.id}`;
    text = learn.current.lemma_de;
  } else if (runner?.current?.kind === 'listening' && !runner.answer) {
    key = `quiz:${runner.current.id}`;
    text = runner.current.audioText;
  }
  if (key && key !== ui.lastSpokenKey) model.speak(text);
  ui.lastSpokenKey = key;
}

function renderTabbar() {
  const tabs = [['home', 'Home'], ['quiz', 'Quiz'], ['progress', 'Progress'], ['badges', 'Badges']];
  return tabs.map(([id, label]) =>
    `<button class="tab" data-action="tab" data-tab="${id}" ${ui.tab === id ? 'aria-current="page"' : ''}>${icon(id)}<span>${label}</span></button>`,
  ).join('');
}

function renderTab() {
  switch (ui.tab) {
    case 'quiz': return renderQuizTab();
    case 'progress': return renderProgress();
    case 'badges': return renderBadges();
    default: return renderHome();
  }
}

// MARK: Home

function greeting() {
  const hour = model.now.getHours();
  if (hour >= 5 && hour < 11) return 'Guten Morgen!';
  if (hour >= 11 && hour < 18) return 'Guten Tag!';
  return 'Guten Abend!';
}

function progressRing(progress, value, caption) {
  const r = 43;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.min(Math.max(progress, 0), 1));
  return `<div class="ring" role="img" aria-label="${h(value)} ${h(caption)}">
    <svg viewBox="0 0 96 96"><circle class="track" cx="48" cy="48" r="${r}"/>
    <circle class="fill" cx="48" cy="48" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${offset}"/></svg>
    <div class="label"><span class="value">${h(value)}</span><span class="caption">${h(caption)}</span></div></div>`;
}

function renderHome() {
  const { profile } = model.state;
  const level = model.currentLevel;
  const due = model.dueCount;
  const fresh = model.newWordCount;
  const subtitle = fresh > 0
    ? `${plural(fresh, 'new word')} ready in ${level}`
    : `You're caught up on new words for ${level}. Nice work!`;

  let banners = '';
  if (model.saveError) {
    banners += `<div class="banner warn"><div class="text"><b>Progress couldn't be saved.</b> ${h(model.saveError)}. Export a backup from Settings.</div></div>`;
  }
  if (!isStandalone() && !readFlag('dm.installHintDismissed')) {
    banners += `<div class="banner"><div class="text"><b>Install the app:</b> in Safari tap <b>Share</b> → <b>Add to Home Screen</b>. It then opens full-screen and works offline. Progress in the installed app is kept separately from this Safari tab.</div>
      <button class="close" data-action="dismiss-install" aria-label="Dismiss">×</button></div>`;
  }

  return `
    <div class="topbar">
      <h1>🦉 Deutsch Meister</h1>
      <div class="right">
        <span class="chip" aria-label="${profile.currentStreakDays} day streak">🔥 ${profile.currentStreakDays}</span>
        <button class="icon-btn" data-action="open-settings" aria-label="Settings">${icon('gear')}</button>
      </div>
    </div>
    <div class="stack">
      ${banners}
      <div class="card hero">
        ${progressRing(profile.todayXP / Math.max(1, profile.dailyGoalXP), profile.todayXP, 'XP today')}
        <div>
          <h2>${greeting()}</h2>
          <div class="muted">${h(subtitle)}</div>
          <div class="goal">Goal: ${profile.dailyGoalXP} XP</div>
        </div>
      </div>
      <div class="stat-row">
        <div class="card stat"><div class="value">${due}</div><div class="label">Due for review</div></div>
        <div class="card stat"><div class="value">${model.masteredTotal}</div><div class="label">Words mastered</div></div>
        <div class="card stat"><div class="value">${level}</div><div class="label">Current level</div></div>
      </div>
      <button class="pill large" data-action="start-review" ${due === 0 ? 'disabled' : ''}>🎯 Review <span class="count">${due}</span></button>
      <button class="pill large secondary" data-action="start-learn" ${fresh === 0 ? 'disabled' : ''}>✨ Learn new words</button>
      ${due === 0 && model.startedCount > 0 ? '<div class="muted small center">Nothing is due for review right now.</div>' : ''}
    </div>`;
}

// MARK: Word card (Learn and Review)

function renderWordCard(entry, showAnswer, key) {
  const gender = entry.noun?.gender;
  let answer = '<div class="recall-hint">Try to recall the meaning, then reveal.</div>';
  if (showAnswer) {
    answer = `<div class="translation">${h(entry.translations_en.join(', '))}</div>
      <div class="soft-panel example"><div class="de">${h(entry.example_de)}</div><div class="en">${h(entry.example_en)}</div></div>`;
    const verb = entry.verb;
    if (verb) {
      if (verb.particle && verb.particle_meaning_hint) {
        answer += `<div class="particle">🧩 <b>${h(verb.particle)}</b>: ${h(verb.particle_meaning_hint)}</div>`;
      }
      answer += `<div class="detail"><b>Present:</b> ${h(verb.present_3sg)} &nbsp; <b>Perfekt:</b> ${h(verb.perfekt)}</div>`;
    }
    const adj = entry.adjective;
    if (adj && (adj.comparative_irregular || adj.superlative_irregular)) {
      answer += `<div class="detail"><b>Comparative:</b> ${h(adj.comparative_irregular ?? '—')} &nbsp; <b>Superlative:</b> ${h(adj.superlative_irregular ?? '—')}</div>`;
    }
    if (entry.notes) answer += `<div class="detail">💡 ${h(entry.notes)}</div>`;
  }
  return `<div class="word-card${cardEnter(key)}" style="${themeStyle(entry)}">
    ${themeChip(entry)}
    <span class="badge">${h(POS_LABELS[entry.pos] ?? 'Word')}</span>
    <div class="lemma-row">${gender ? `<span class="badge gender gender-${gender}">${gender}</span>` : ''}<span class="lemma" lang="de">${h(entry.lemma_de)}</span></div>
    ${entry.noun?.plural_de ? `<div class="muted small">Plural: ${h(entry.noun.plural_de)}</div>` : ''}
    ${speakButton(entry.lemma_de)}
    ${answer}
  </div>`;
}

function sessionHeader(progress, combo = 0, closeAction = 'close-session') {
  return `<div class="session-header">
    <div>${closeAction ? `<button class="text-btn" data-action="${closeAction}">${icon('back')} ${closeAction === 'quiz-quit' ? 'Quit' : 'Home'}</button>` : ''}</div>
    <div>${combo >= 3 ? `<span class="chip combo" aria-label="${combo} in a row">🔥 ${combo} combo</span>` : ''}</div>
    <div class="progress">${progress}</div>
  </div>`;
}

function summary(emoji, title, subtitle, buttons) {
  return `<div class="summary"><div class="emoji">${emoji}</div><h2>${h(title)}</h2><div class="muted">${h(subtitle)}</div>
    <div class="buttons">${buttons}</div></div>`;
}

const backHome = '<button class="pill large" data-action="close-session">Back to Home</button>';

// MARK: Learn

function renderLearn(session) {
  if (session.phase === 'cards' && session.current) {
    return `${sessionHeader(`${session.index + 1} / ${session.queue.length}`)}
      <div class="session-body">${renderWordCard(session.current, true, `learn:${session.current.id}`)}</div>
      <div class="session-footer"><button class="pill large" data-action="learn-next">Got it → Next</button></div>`;
  }
  if (session.phase === 'quiz' && session.quiz) return renderQuizFlow(session.quiz, 'close-session');

  let text = `${plural(session.learned, 'new word')} learned`;
  if (session.quizStats) {
    const s = session.quizStats;
    text += ` · quiz: ${s.correct}/${s.total} correct (+${s.xp} XP)`;
  }
  return summary('🎉', 'Session complete!', text, backHome);
}

// MARK: Review

function renderReview(session) {
  const entry = session.current;
  if (!entry) {
    const empty = session.queue.length === 0;
    return summary('✅', empty ? 'Nothing to review' : 'Review complete!',
      empty ? 'Come back when words are due.' : `${session.correct} / ${session.queue.length} correct · +${session.xp} XP`, backHome);
  }
  const footer = session.isRevealed
    ? `<div class="btn-row"><button class="pill secondary" data-action="review-grade" data-correct="0">😕 Didn't know</button>
       <button class="pill" data-action="review-grade" data-correct="1">✅ Knew it</button></div>`
    : '<button class="pill large" data-action="review-reveal">Show answer</button>';
  return `${sessionHeader(`${session.index + 1} / ${session.queue.length}`, session.combo.current)}
    <div class="session-body">${renderWordCard(entry, session.isRevealed, `review:${entry.id}:${session.isRevealed}`)}</div>
    <div class="session-footer">${footer}</div>`;
}

// MARK: Quiz

function activeRunner() {
  if (ui.session?.kind === 'learn') return ui.session.controller.phase === 'quiz' ? ui.session.controller.quiz : null;
  if (!ui.session && ui.tab === 'quiz' && !ui.quiz.summary) return ui.quiz.runner;
  return null;
}

function renderQuizFlow(runner, closeAction) {
  const q = runner.current;
  const header = sessionHeader(`${Math.min(runner.index + 1, runner.questions.length)} / ${runner.questions.length}`, runner.combo.current, closeAction);
  if (!q) return header;
  const answer = runner.answer;
  const optionClass = (i) => {
    if (!answer) return '';
    if (q.options[i] === q.correctAnswer) return 'correct';
    return i === answer.selectedIndex ? 'wrong' : 'dimmed';
  };
  const prompt = q.kind === 'listening'
    ? speakButton(q.audioText)
    : `<div class="question-prompt ${q.kind === 'cloze' ? 'cloze' : ''}" ${q.kind === 'meaning_en_to_de' ? '' : 'lang="de"'}>${h(q.prompt)}</div>`;
  const feedback = answer
    ? `<div class="feedback ${answer.wasCorrect ? 'ok' : 'bad'}">${answer.wasCorrect ? '✅ Correct!' : `❌ Not quite — correct answer: ${h(q.correctAnswer)}`}</div>
       <div class="soft-panel feedback-example"><div class="de" lang="de">${h(q.entry.example_de)}</div><div class="en">${h(q.entry.example_en)}</div></div>`
    : '';
  const isLast = runner.index === runner.questions.length - 1;
  return `${header}
    <div class="session-body"><div class="word-card${cardEnter(`quiz:${q.id}`)}" style="${themeStyle(q.entry)}">
      ${themeChip(q.entry)}
      <div class="question-label">${h(q.promptLabel)}</div>
      ${prompt}
      <div class="options">${q.options.map((o, i) =>
        `<button class="option ${optionClass(i)}" data-action="quiz-choose" data-index="${i}" ${answer ? 'disabled' : ''}>${h(o)}</button>`).join('')}</div>
      ${feedback}
    </div></div>
    ${answer ? `<div class="session-footer"><button class="pill large" data-action="quiz-next">${isLast ? 'Finish' : 'Next →'}</button></div>` : ''}`;
}

function eligibleQuizCount() {
  return Object.keys(model.state.progress).filter((id) => model.index.entriesByID.has(id)).length;
}

function renderQuizTab() {
  const top = '<div class="topbar"><h1 class="center">Quiz</h1></div>';
  if (ui.quiz.summary) {
    const s = ui.quiz.summary;
    return top + summary('🧠', 'Quiz complete!', `${s.correct} / ${s.total} correct · +${s.xp} XP`,
      `<button class="pill large" data-action="quiz-again">Take another quiz</button>
       <button class="pill large secondary" data-action="quiz-done">Done</button>`);
  }
  if (ui.quiz.runner) return renderQuizFlow(ui.quiz.runner, 'quiz-quit');

  const count = eligibleQuizCount();
  if (count === 0) {
    return `${top}<div class="empty"><div class="emoji">🧠</div>Learn some words first, then come back here to quiz yourself on everything you know.</div>`;
  }
  return `${top}<div class="card quiz-hub stack" style="gap:8px">
    <div style="font-weight:700">🧠 Review Everything</div>
    <div class="muted">Multiple-choice questions drawn from every word you've started.</div>
    <div class="big">${count}</div>
    <div class="muted small">${count === 1 ? 'word' : 'words'} started so far</div>
    <button class="pill large" style="margin-top:12px" data-action="quiz-start">Start Quiz (${Math.min(20, count)} questions)</button>
  </div>`;
}

// MARK: Progress

function renderProgress() {
  const { level, pos, familiesShown } = ui.progress;
  const levels = level ? [level] : CEFR_LEVELS;
  const options = (items, selected) => items.map(([v, label]) => `<option value="${v}" ${v === selected ? 'selected' : ''}>${label}</option>`).join('');

  const rows = levels.map((l) => {
    const c = model.planner.coverage(l, pos || null, model.state);
    const pct = (n) => (100 * n) / Math.max(1, c.total);
    return `<div class="card r12 coverage" role="img" aria-label="${l}: ${c.mastered} mastered, ${c.started} of ${c.total} started">
      <div class="head"><span class="lvl">${l}</span><span class="nums">${c.mastered} mastered · ${c.started} / ${c.total} started</span></div>
      <div class="bar"><span style="width:${pct(c.mastered)}%;background:var(--green)"></span><span style="width:${pct(c.familiar)}%;background:var(--teal)"></span><span style="width:${pct(c.learning)}%;background:var(--orange)"></span></div>
    </div>`;
  }).join('');

  const days = [];
  for (let offset = 83; offset >= 0; offset--) {
    const key = dayKey(addDays(model.now, -offset));
    const xp = model.state.dailyActivity[key]?.xpEarned ?? 0;
    const cls = xp >= 100 ? 'h4' : xp >= 50 ? 'h3' : xp >= 20 ? 'h2' : xp >= 1 ? 'h1' : '';
    days.push(`<span class="${cls}" title="${key}: ${xp} XP"></span>`);
  }

  const tricky = Object.values(model.state.progress)
    .filter((p) => p.isLeech && model.index.entriesByID.has(p.id))
    .map((p) => ({ p, e: model.index.entriesByID.get(p.id) }))
    .sort((a, b) => a.e.lemma_de.localeCompare(b.e.lemma_de, 'de'));
  const trickyHTML = tricky.length ? `<h2 class="section-title">🐢 Tricky words</h2>
    <div class="muted small">Words you've reviewed many times and still miss more than half the time.</div>
    ${tricky.map(({ p, e }) => `<div class="card r12 flat row-item"><b lang="de">${h(e.lemma_de)}</b>
      <span class="grow muted">${h(primaryTranslation(e))}</span><span class="bad">${p.totalCorrect}/${p.totalReviews}</span></div>`).join('')}` : '';

  const families = model.index.verbFamilies.filter((f) => f.members.length > 1);
  const familyHTML = families.slice(0, familiesShown).map((f) => {
    const base = model.index.entriesByID.get(f.baseVerbID)?.lemma_de ?? f.baseVerbID.replace(/_verb$/, '');
    return `<div class="card r12 family"><h3 lang="de">${h(base)}</h3>${f.members.map((m) =>
      `<div class="member"><span lang="de">${h(m.lemma_de)}</span><span class="hint">${h([m.particle, m.particle_meaning_hint].filter(Boolean).join(' — '))}</span></div>`).join('')}</div>`;
  }).join('');
  const more = families.length > familiesShown
    ? `<button class="pill secondary show-more" data-action="families-more">Show more (${families.length - familiesShown})</button>` : '';

  return `<div class="topbar"><h1 class="center">Your Coverage</h1></div>
    <div class="stack">
      <div class="filters">
        <select class="select" data-change="filter-level" aria-label="Level">${options([['', 'All levels'], ...CEFR_LEVELS.map((l) => [l, l])], level)}</select>
        <select class="select" data-change="filter-pos" aria-label="Word type">${options([['', 'All word types'], ...Object.entries(POS_LABELS)], pos)}</select>
      </div>
      ${rows}
      <div class="legend"><span><i style="background:var(--green)"></i>Mastered</span><span><i style="background:var(--teal)"></i>Familiar</span>
        <span><i style="background:var(--orange)"></i>Learning</span><span><i style="background:var(--border)"></i>Not started</span></div>
      <h2 class="section-title">🔥 Activity</h2>
      <div class="card r12 flat heatmap" aria-label="XP per day, last 12 weeks">${days.join('')}</div>
      ${trickyHTML}
      <h2 class="section-title">🧩 Verb Families</h2>
      <div class="muted small">Separable &amp; composite verbs grouped by their base verb, so you see the pattern instead of memorising each one alone.</div>
      ${familyHTML || '<div class="empty"><div class="emoji">🧩</div>No verb families yet.</div>'}
      ${more}
    </div>`;
}

// MARK: Badges

function renderBadges() {
  const unlocked = new Set(model.state.achievements.map((a) => a.id));
  return `<div class="topbar"><h1 class="center">🏆 Achievements</h1></div>
    <div class="stack">
      <div class="muted small">${unlocked.size} of ${ACHIEVEMENTS.length} unlocked</div>
      <div class="badge-grid">${ACHIEVEMENTS.map((b) => `
        <div class="card badge-card ${unlocked.has(b.id) ? '' : 'locked'}" aria-label="${h(b.title)}, ${unlocked.has(b.id) ? 'unlocked' : 'locked'}">
          <div class="emoji">${b.emoji}</div><div class="title">${h(b.title)}</div><div class="detail">${h(b.detail)}</div>
        </div>`).join('')}</div>
    </div>`;
}

// MARK: Settings

function renderSettings(animate) {
  const { profile, settings } = model.state;
  const levelOptions = [['auto', 'Auto (recommended)'], ...CEFR_LEVELS.map((l) => [l, l])]
    .map(([v, label]) => `<option value="${v}" ${settings.levelOverride === v ? 'selected' : ''}>${label}</option>`).join('');
  const voiceNote = !speech.isAvailable
    ? 'Speech isn\'t supported in this browser.'
    : speech.hasGermanVoice
      ? 'A German voice is available on this device. ✅'
      : 'No German voice found. Download one in Settings → Accessibility → Spoken Content → Voices.';
  return `<div class="sheet-backdrop${animate ? ' enter' : ''}" data-action="close-settings"></div>
  <div class="sheet${animate ? ' enter' : ''}" role="dialog" aria-modal="true" aria-label="Settings">
    <div class="sheet-header"><span></span><span>⚙️ Settings</span><button class="text-btn" data-action="close-settings">Done</button></div>
    <div class="sheet-body">
      <div class="form-section"><div class="label">Daily XP goal</div>
        <div class="form-group"><div class="form-row"><span style="font-variant-numeric:tabular-nums">${profile.dailyGoalXP} XP a day</span>
          <span class="stepper"><button data-action="goal-step" data-step="-10" aria-label="Decrease goal" ${profile.dailyGoalXP <= 10 ? 'disabled' : ''}>−</button><button data-action="goal-step" data-step="10" aria-label="Increase goal" ${profile.dailyGoalXP >= 500 ? 'disabled' : ''}>+</button></span></div></div>
      </div>
      <div class="form-section"><div class="label">Learning level</div>
        <div class="form-group"><label class="form-row"><span>Level</span><select data-change="level-override">${levelOptions}</select></label></div>
        <div class="footer">New words come from this level. Auto follows your progress.</div>
      </div>
      <div class="form-section"><div class="label">Speech rate</div>
        <div class="form-group">
          <div class="form-row"><span aria-hidden="true">🐢</span><input type="range" min="0.5" max="1.3" step="0.05" value="${settings.speechRate}" data-change="speech-rate" aria-label="Speech rate"><span aria-hidden="true">🐇</span></div>
          <button class="form-row" data-action="test-voice">🔊 Test voice</button>
        </div>
        <div class="footer">${h(voiceNote)}</div>
      </div>
      <div class="form-section"><div class="label">Backup your progress</div>
        <div class="form-group">
          <button class="form-row" data-action="export">⬇️ Export progress</button>
          <button class="form-row" data-action="import">⬆️ Import progress</button>
        </div>
        <div class="footer">Exports a JSON file you can keep in Files or iCloud Drive. Imports exports from the iOS app and the old web prototype too.</div>
      </div>
      <div class="form-section"><div class="label">Danger zone</div>
        <div class="form-group"><button class="form-row destructive" data-action="reset">🗑️ Reset all progress</button></div>
      </div>
      <div class="version">${model.index.entries.length.toLocaleString('en')} words · works offline</div>
    </div>
  </div>`;
}

// MARK: Onboarding and celebration

function renderOnboarding() {
  return `<div class="onboarding">
    <div class="owl">🦉</div>
    <h2>What's your German level?</h2>
    <div class="muted">We'll pull new words from here. You can change this anytime in Settings.</div>
    <div class="level-grid">${CEFR_LEVELS.map((l) => `<button data-action="onboard-level" data-level="${l}">${l}</button>`).join('')}</div>
    <button class="text-btn accent" style="margin-top:16px" data-action="onboard-import">I have a backup to import</button>
  </div>`;
}

function renderCelebration() {
  const c = model.celebration;
  if (!c) return '';
  return `<div class="celebration" data-action="dismiss-celebration" role="dialog" aria-modal="true">
    <div class="box"><div class="emoji">${c.emoji}</div><h3>${h(c.title)}</h3><p>${h(c.subtitle)}</p>
    <button class="pill" data-action="dismiss-celebration">Nice!</button></div></div>`;
}

// MARK: - Actions

function quizFinished(runner) {
  if (ui.session?.kind === 'learn' && ui.session.controller.quiz === runner) {
    ui.session.controller.quizFinished();
  } else if (ui.quiz.runner === runner) {
    ui.quiz.summary = finishReviewEverythingQuiz(model, runner);
  }
}

function startTabQuiz() {
  ui.quiz = { runner: makeReviewEverythingQuiz(model), summary: null };
}

function closeSession() {
  ui.session = null;
  speech.stop();
  if (ui.reloadWhenIdle) location.reload();
}

const actions = {
  tab: (el) => {
    ui.tab = el.dataset.tab;
    window.scrollTo(0, 0);
    if (ui.tab === 'badges') model.evaluateAchievements(false);
  },
  'open-settings': () => { ui.settingsOpen = true; },
  'close-settings': () => { ui.settingsOpen = false; },
  'start-learn': () => { ui.session = { kind: 'learn', controller: new LearnSession(model) }; window.scrollTo(0, 0); },
  'start-review': () => { ui.session = { kind: 'review', controller: new ReviewSession(model) }; window.scrollTo(0, 0); },
  'close-session': closeSession,
  'learn-next': () => { ui.session?.controller.confirmCurrent(); window.scrollTo(0, 0); },
  'review-reveal': () => ui.session?.controller.reveal(),
  'review-grade': (el) => { ui.session?.controller.grade(el.dataset.correct === '1'); window.scrollTo(0, 0); },
  'quiz-choose': (el) => activeRunner()?.choose(Number(el.dataset.index)),
  'quiz-next': () => {
    const runner = activeRunner();
    if (runner && runner.advance()) quizFinished(runner);
    window.scrollTo(0, 0);
  },
  'quiz-start': startTabQuiz,
  'quiz-again': startTabQuiz,
  'quiz-quit': () => { ui.quiz = { runner: null, summary: null }; },
  'quiz-done': () => { ui.quiz = { runner: null, summary: null }; },
  speak: (el) => model.speak(el.dataset.text),
  'test-voice': () => model.speak('Das ist ein Test. Ich lerne Deutsch.'),
  'goal-step': (el) => model.update((s) => {
    s.profile.dailyGoalXP = Math.min(500, Math.max(10, s.profile.dailyGoalXP + Number(el.dataset.step)));
  }),
  'onboard-level': (el) => model.update((s) => {
    s.settings.levelOverride = el.dataset.level;
    s.settings.onboarded = true;
  }),
  'onboard-import': () => { ui.importFromOnboarding = true; pickImportFile(); },
  export: exportProgress,
  import: () => { ui.importFromOnboarding = false; pickImportFile(); },
  reset: () => {
    if (confirm('This permanently deletes all your progress, XP and achievements.')) {
      model.resetProgress();
      ui.settingsOpen = false;
    }
  },
  'dismiss-celebration': () => model.dismissCelebration(),
  'dismiss-install': () => writeFlag('dm.installHintDismissed'),
  'families-more': () => { ui.progress.familiesShown += 20; },
};

const changes = {
  'filter-level': (el) => { ui.progress.level = el.value; },
  'filter-pos': (el) => { ui.progress.pos = el.value; },
  'level-override': (el) => model.update((s) => { s.settings.levelOverride = el.value; }),
  'speech-rate': (el) => model.update((s) => { s.settings.speechRate = Number(el.value); }),
};

function runBatched(fn) {
  batching += 1;
  try { fn(); } finally {
    batching -= 1;
    if (!batching) render();
  }
}

document.addEventListener('click', (event) => {
  const el = event.target.closest('[data-action]');
  if (!el || el.disabled) return;
  // The celebration backdrop and its box share one action; ignore taps on the box itself.
  if (el.classList.contains('celebration') && event.target.closest('.box')) return;
  const action = actions[el.dataset.action];
  if (action) runBatched(() => action(el));
});

document.addEventListener('change', (event) => {
  const el = event.target.closest('[data-change]');
  const change = el && changes[el.dataset.change];
  if (change) runBatched(() => change(el));
});

// MARK: - Backup

/// One hidden file input, kept in the document (iOS Safari is unreliable with detached ones).
const importInput = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json', hidden: true });
document.body.append(importInput);
importInput.addEventListener('change', async () => {
  const file = importInput.files?.[0];
  importInput.value = '';
  if (file) await importFile(file);
});

function pickImportFile() {
  importInput.click();
}

async function importFile(file) {
  let next;
  try {
    next = decodeImport(await file.text());
  } catch (e) {
    alert(e.message);
    return;
  }
  const hasProgress = Object.keys(model.state.progress).length > 0;
  if (hasProgress && !confirm('Replace your current progress with the imported file?')) return;
  if (ui.importFromOnboarding) next.settings.onboarded = true;
  next.settings.onboarded ||= model.state.settings.onboarded;
  runBatched(() => {
    model.replaceState(next);
    ui.settingsOpen = false;
    showToast(`Progress imported: ${plural(Object.keys(next.progress).length, 'word')}.`);
  });
}

async function exportProgress() {
  const name = `german-vocab-progress-${dayKey(model.now)}.json`;
  const blob = new Blob([encodeState(model.state)], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Deutsch Meister progress' });
      return;
    } catch (e) {
      if (e?.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// MARK: - Boot

async function boot() {
  let bundle;
  try {
    const response = await fetch('vocab-bundle.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    bundle = await response.json();
  } catch (e) {
    $view.innerHTML = `<div class="empty"><div class="emoji">⚠️</div>Couldn't load the vocabulary (${h(e.message)}). Check your connection and reopen the app.</div>`;
    return;
  }

  let storage;
  try { storage = window.localStorage; storage.getItem('probe'); } catch { storage = null; }
  speech = new SpeechService();
  model = new AppModel({
    index: makeIndex(bundle),
    store: storage ? makeStore(storage) : makeStore({ getItem: () => null, setItem: () => {}, removeItem: () => {} }),
    speech,
  });
  model.onChange(render);
  speech.onChange(() => document.body.classList.toggle('speaking', speech.isSpeaking));

  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') model.refreshDay(); });
  navigator.storage?.persist?.().catch(() => {});
  render();
  registerServiceWorker();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return; // first install, nothing to refresh
    if (ui.session || ui.quiz.runner) ui.reloadWhenIdle = true;
    else location.reload();
  });
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

boot();
