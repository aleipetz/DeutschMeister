/*
 * Pure-logic quiz generator: multiple-choice questions built from vocab
 * entries. No DOM, no localStorage access — inputs/outputs only, so this
 * file can be tested standalone with plain `node Tests/quiz.test.js`.
 * Exposed as `window.QuizEngine` in the browser build; exported via
 * module.exports when run under Node for tests.
 */
(function (root) {
  "use strict";

  var TYPES = ["meaning_de_to_en", "meaning_en_to_de", "gender", "cloze", "listening"];

  function shuffle(list, rng) {
    var r = rng || Math.random;
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(r() * (i + 1));
      var tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  /** Which question types make sense for a given entry. */
  function eligibleTypes(entry) {
    var types = ["meaning_de_to_en", "meaning_en_to_de", "listening"];
    if (entry.pos === "noun" && entry.noun && entry.noun.gender) types.push("gender");
    if (entry.cloze_word) types.push("cloze");
    return types;
  }

  /**
   * Picks up to `count` distractor values (strings) for a multiple-choice
   * question, preferring entries of the same part of speech, excluding the
   * entry itself and any value equal to the correct answer, and de-duping
   * by value. Pads from the wider pool (any POS, allowing value repeats
   * only as an absolute last resort) if the pool is small.
   */
  function pickDistractors(entry, pool, count, valueFn, rng) {
    var correctValue = valueFn(entry);
    var candidates = pool.filter(function (e) {
      return e.id !== entry.id && valueFn(e) && valueFn(e) !== correctValue;
    });
    var samePos = shuffle(candidates.filter(function (e) { return e.pos === entry.pos; }), rng);
    var otherPos = shuffle(candidates.filter(function (e) { return e.pos !== entry.pos; }), rng);
    var ordered = samePos.concat(otherPos);

    var seen = {};
    var result = [];
    for (var i = 0; i < ordered.length && result.length < count; i++) {
      var v = valueFn(ordered[i]);
      if (!seen[v]) {
        seen[v] = true;
        result.push(v);
      }
    }
    // Last resort: pool too small for `count` distinct values — allow repeats
    // rather than shipping a question with fewer than requested options.
    for (var j = 0; result.length < count && ordered.length > 0; j++) {
      result.push(valueFn(ordered[j % ordered.length]));
    }
    return result;
  }

  function buildQuestion(entry, pool, opts) {
    opts = opts || {};
    var rng = opts.rng || Math.random;
    var types = eligibleTypes(entry);
    var type = opts.type && types.indexOf(opts.type) !== -1 ? opts.type : types[Math.floor(rng() * types.length)];

    if (type === "gender") {
      return {
        type: type, entry: entry, prompt: entry.lemma_de,
        promptLabel: "Which article?",
        options: shuffle(["der", "die", "das"], rng),
        correctAnswer: entry.noun.gender,
      };
    }

    if (type === "meaning_de_to_en") {
      var correctEn = entry.translations_en[0];
      var distractorsEn = pickDistractors(entry, pool, 3, function (e) { return e.translations_en[0]; }, rng);
      return {
        type: type, entry: entry, prompt: entry.lemma_de,
        promptLabel: "What does this mean?",
        options: shuffle([correctEn].concat(distractorsEn), rng),
        correctAnswer: correctEn,
      };
    }

    if (type === "meaning_en_to_de") {
      var correctDe = entry.lemma_de;
      var distractorsDe = pickDistractors(entry, pool, 3, function (e) { return e.lemma_de; }, rng);
      return {
        type: type, entry: entry, prompt: entry.translations_en[0],
        promptLabel: "Which German word means this?",
        options: shuffle([correctDe].concat(distractorsDe), rng),
        correctAnswer: correctDe,
      };
    }

    if (type === "cloze") {
      var blanked = entry.example_de.replace(entry.cloze_word, "_____");
      var distractorsCloze = pickDistractors(entry, pool, 3, function (e) { return e.cloze_word; }, rng);
      return {
        type: type, entry: entry, prompt: blanked,
        promptLabel: "Fill in the blank",
        options: shuffle([entry.cloze_word].concat(distractorsCloze), rng),
        correctAnswer: entry.cloze_word,
        exampleEn: entry.example_en,
      };
    }

    if (type === "listening") {
      var correctL = entry.lemma_de;
      var distractorsL = pickDistractors(entry, pool, 3, function (e) { return e.lemma_de; }, rng);
      return {
        type: type, entry: entry, prompt: null,
        promptLabel: "Listen and choose the word you heard",
        options: shuffle([correctL].concat(distractorsL), rng),
        correctAnswer: correctL,
        audioText: entry.lemma_de,
      };
    }

    return null;
  }

  /**
   * Builds a quiz session: one question per entry in `targetEntries`
   * (optionally shuffled/limited), pulling distractors from `pool`.
   */
  function buildSession(targetEntries, pool, opts) {
    opts = opts || {};
    var rng = opts.rng || Math.random;
    var list = opts.shuffleEntries === false ? targetEntries.slice() : shuffle(targetEntries, rng);
    if (opts.limit) list = list.slice(0, opts.limit);
    return list.map(function (entry) { return buildQuestion(entry, pool, { rng: rng }); }).filter(Boolean);
  }

  var QuizEngine = {
    TYPES: TYPES,
    eligibleTypes: eligibleTypes,
    pickDistractors: pickDistractors,
    buildQuestion: buildQuestion,
    buildSession: buildSession,
    shuffle: shuffle,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = QuizEngine;
  } else {
    root.QuizEngine = QuizEngine;
  }
})(typeof window !== "undefined" ? window : globalThis);
