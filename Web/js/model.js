// The single source of truth the screens read from. Owns the learner's state, saves it after
// every change and hands out the content index. Ported from iOS Features/AppModel.swift and
// Data/ProgressStore.swift. Rules live in domain.js.

import {
  decodeState, encodeState, evaluateAchievements, makePlanner, newState, rollOverDayIfNeeded,
} from './domain.js';

export const STORAGE_KEY = 'deutschMeister.v1';

/// localStorage-backed store. A save that can't be parsed is moved aside, never overwritten.
export function makeStore(storage, key = STORAGE_KEY) {
  return {
    load() {
      let text = null;
      try { text = storage.getItem(key); } catch { return newState(); }
      if (text == null) return newState();
      try {
        return decodeState(JSON.parse(text));
      } catch {
        try { storage.setItem(`${key}.corrupt-${Date.now()}`, text); storage.removeItem(key); } catch { /* full */ }
        return newState();
      }
    },
    save(state) {
      storage.setItem(key, encodeState(state));
    },
  };
}

export function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    keys: () => [...m.keys()],
  };
}

export class AppModel {
  constructor({ index, store, speech = null, clock = () => new Date() }) {
    this.index = index;
    this.planner = makePlanner(index);
    this.store = store;
    this.speech = speech;
    this.clock = clock;
    this.state = store.load();
    rollOverDayIfNeeded(this.state, this.now);
    this.celebration = null;
    this.saveError = null;
    this.listeners = new Set();
  }

  get now() { return this.clock(); }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) fn(); }

  // Derived numbers
  get currentLevel() { return this.planner.currentLevel(this.state); }
  get dueCount() { return this.planner.dueQueue(this.state, this.now).length; }
  get newWordCount() { return this.planner.newWords(this.currentLevel, this.state).length; }
  get masteredTotal() { return this.planner.achievementContext(this.state).masteredTotal; }
  get startedCount() { return Object.keys(this.state.progress).filter((id) => this.index.entriesByID.has(id)).length; }

  /// Applies a change and saves. Returns whatever `change` returns.
  update(change) {
    const result = change(this.state);
    this.save();
    this.emit();
    return result;
  }

  save() {
    try {
      this.store.save(this.state);
      this.saveError = null;
    } catch (e) {
      this.saveError = e?.message ?? String(e);
    }
  }

  /// Call when the app comes to the foreground so a new calendar day resets today's counters.
  refreshDay() {
    const before = this.state.profile.todayDate;
    rollOverDayIfNeeded(this.state, this.now);
    if (this.state.profile.todayDate !== before) { this.save(); this.emit(); }
  }

  /// Unlocks any newly earned badges. With `announce`, shows a popup for the first one.
  evaluateAchievements(announce) {
    const unlocked = evaluateAchievements(this.state, this.planner, this.now);
    if (!unlocked.length) return;
    this.save();
    if (announce) this.celebrate('🏆', `${unlocked[0].title} unlocked!`, unlocked[0].detail);
    else this.emit();
  }

  celebrate(emoji, title, subtitle) {
    this.celebration = { emoji, title, subtitle };
    this.emit();
  }

  dismissCelebration() {
    this.celebration = null;
    this.emit();
  }

  celebrateGoal() {
    this.celebrate('🎯', 'Daily goal reached!', `${this.state.profile.currentStreakDays}-day streak`);
  }

  replaceState(next) {
    this.state = next;
    rollOverDayIfNeeded(this.state, this.now);
    this.save();
    this.emit();
  }

  resetProgress() {
    this.replaceState(newState());
  }

  speak(text) {
    this.speech?.speak(text, this.state.settings.speechRate);
  }
}
