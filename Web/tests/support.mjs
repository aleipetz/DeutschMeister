// Shared fixtures. Mirrors iOS/DeutschMeisterTests/TestSupport.swift.
// Day maths runs in UTC so results never depend on the machine's time zone.
process.env.TZ = 'UTC';

import { makeIndex } from '../js/domain.js';
import { AppModel, makeStore, memoryStorage } from '../js/model.js';

export const date = (iso) => new Date(iso);

export function makeEntry(id, {
  pos = 'noun', level = 'A1', lemma = id, english = ['thing'], example, cloze, gender, priority = 1, verb,
} = {}) {
  return {
    id, cefr: level, pos, lemma_de: lemma, translations_en: english,
    example_de: example ?? `Das ist ${lemma}.`, example_en: 'That is a thing.',
    cloze_word: cloze ?? lemma, themes: ['home'], priority,
    ...(gender ? { noun: { gender } } : {}),
    ...(verb ? { verb } : {}),
  };
}

export const makeTestIndex = (entries) =>
  makeIndex({ schemaVersion: 1, themes: [{ id: 'home', label_en: 'Home', icon: '🏠' }], entries });

/// The six-entry pool the prototype's quiz tests used.
export function quizPool() {
  return [
    makeEntry('haus_noun', { lemma: 'Haus', english: ['house', 'home'], example: 'Das Haus ist groß.', gender: 'das' }),
    makeEntry('frau_noun', { lemma: 'Frau', english: ['woman'], example: 'Die Frau lacht.', gender: 'die' }),
    makeEntry('mann_noun', { lemma: 'Mann', english: ['man'], example: 'Der Mann geht.', gender: 'der' }),
    makeEntry('kind_noun', { lemma: 'Kind', english: ['child'], example: 'Das Kind spielt.', gender: 'das' }),
    makeEntry('gross_adj', { pos: 'adjective', lemma: 'groß', english: ['big'], example: 'Das Haus ist groß.' }),
    makeEntry('aufstehen_verb', {
      pos: 'composite_verb', lemma: 'aufstehen', english: ['to get up'], example: 'Ich stehe um sieben auf.', cloze: 'auf',
    }),
  ];
}

/// A model on in-memory storage with a controllable clock.
export function makeModel(entries, { now = date('2026-03-10T09:00:00Z'), storage = memoryStorage() } = {}) {
  const clock = { now };
  const model = new AppModel({ index: makeTestIndex(entries), store: makeStore(storage), clock: () => clock.now });
  return { model, clock, storage };
}

export const levelEntries = (level, n, prefix = level.toLowerCase()) =>
  Array.from({ length: n }, (_, i) => makeEntry(`${prefix}_${String(i).padStart(2, '0')}`, { level, lemma: `Wort${prefix}${i}`, english: [`word ${prefix} ${i}`] }));
