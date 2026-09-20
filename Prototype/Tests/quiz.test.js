/*
 * Plain Node test for App/quiz.js — no test framework, no npm install.
 * Run with: node Tests/quiz.test.js
 */
var assert = require("assert");
var path = require("path");
var QuizEngine = require(path.join(__dirname, "..", "App", "quiz.js"));

var passed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log("ok - " + name);
  } catch (e) {
    console.error("FAIL - " + name);
    console.error("  " + e.message);
    process.exitCode = 1;
  }
}

function makePool() {
  return [
    { id: "haus_noun", pos: "noun", lemma_de: "Haus", translations_en: ["house", "home"], example_de: "Das Haus ist groß.", cloze_word: "Haus", noun: { gender: "das" } },
    { id: "frau_noun", pos: "noun", lemma_de: "Frau", translations_en: ["woman"], example_de: "Die Frau lacht.", cloze_word: "Frau", noun: { gender: "die" } },
    { id: "mann_noun", pos: "noun", lemma_de: "Mann", translations_en: ["man"], example_de: "Der Mann geht.", cloze_word: "Mann", noun: { gender: "der" } },
    { id: "kind_noun", pos: "noun", lemma_de: "Kind", translations_en: ["child"], example_de: "Das Kind spielt.", cloze_word: "Kind", noun: { gender: "das" } },
    { id: "gut_adjective", pos: "adjective", lemma_de: "gut", translations_en: ["good"], example_de: "Das ist gut.", cloze_word: "gut" },
    { id: "aufstehen_verb", pos: "phrasal_verb", lemma_de: "aufstehen", translations_en: ["to get up"], example_de: "Ich stehe auf.", cloze_word: "auf", verb: { particle: "auf" } },
  ];
}

test("eligibleTypes includes gender only for nouns with gender", function () {
  var pool = makePool();
  var nounTypes = QuizEngine.eligibleTypes(pool[0]);
  var adjTypes = QuizEngine.eligibleTypes(pool.find(function (e) { return e.pos === "adjective"; }));
  assert.ok(nounTypes.indexOf("gender") !== -1);
  assert.ok(adjTypes.indexOf("gender") === -1);
});

test("eligibleTypes includes cloze only when cloze_word present", function () {
  var withCloze = QuizEngine.eligibleTypes({ pos: "noun", cloze_word: "x", noun: { gender: "der" } });
  var withoutCloze = QuizEngine.eligibleTypes({ pos: "noun", noun: { gender: "der" } });
  assert.ok(withCloze.indexOf("cloze") !== -1);
  assert.ok(withoutCloze.indexOf("cloze") === -1);
});

test("gender question has exactly der/die/das as options and correct answer matches entry", function () {
  var pool = makePool();
  var entry = pool[0]; // Haus, das
  var q = QuizEngine.buildQuestion(entry, pool, { type: "gender", rng: function () { return 0; } });
  assert.strictEqual(q.type, "gender");
  assert.strictEqual(q.correctAnswer, "das");
  assert.deepStrictEqual(q.options.slice().sort(), ["das", "der", "die"]);
});

test("meaning_de_to_en question prompt is the German lemma, correct answer is first translation", function () {
  var pool = makePool();
  var entry = pool[0];
  var q = QuizEngine.buildQuestion(entry, pool, { type: "meaning_de_to_en" });
  assert.strictEqual(q.prompt, "Haus");
  assert.strictEqual(q.correctAnswer, "house");
  assert.strictEqual(q.options.length, 4);
  assert.ok(q.options.indexOf("house") !== -1);
});

test("meaning_en_to_de question prompt is English, correct answer is the lemma", function () {
  var pool = makePool();
  var entry = pool[1]; // Frau
  var q = QuizEngine.buildQuestion(entry, pool, { type: "meaning_en_to_de" });
  assert.strictEqual(q.prompt, "woman");
  assert.strictEqual(q.correctAnswer, "Frau");
  assert.ok(q.options.indexOf("Frau") !== -1);
});

test("cloze question blanks out the cloze_word and offers it as the correct option", function () {
  var pool = makePool();
  var entry = pool.find(function (e) { return e.id === "aufstehen_verb"; });
  var q = QuizEngine.buildQuestion(entry, pool, { type: "cloze" });
  assert.ok(q.prompt.indexOf("_____") !== -1);
  assert.ok(q.prompt.indexOf("auf") === -1 || q.prompt.indexOf("_____") !== -1);
  assert.strictEqual(q.correctAnswer, "auf");
  assert.ok(q.options.indexOf("auf") !== -1);
});

test("listening question has no visible prompt text but carries audioText", function () {
  var pool = makePool();
  var entry = pool[0];
  var q = QuizEngine.buildQuestion(entry, pool, { type: "listening" });
  assert.strictEqual(q.prompt, null);
  assert.strictEqual(q.audioText, "Haus");
  assert.strictEqual(q.correctAnswer, "Haus");
});

test("distractors never include the correct answer's value or the entry itself", function () {
  var pool = makePool();
  var entry = pool[0];
  var distractors = QuizEngine.pickDistractors(entry, pool, 3, function (e) { return e.lemma_de; });
  assert.ok(distractors.indexOf("Haus") === -1);
  assert.strictEqual(distractors.length, 3);
});

test("pickDistractors pads with repeats rather than returning fewer than requested when pool is tiny", function () {
  var tinyPool = [
    { id: "a", pos: "noun", lemma_de: "A" },
    { id: "b", pos: "noun", lemma_de: "B" },
  ];
  var target = { id: "target", pos: "noun", lemma_de: "Target" };
  var distractors = QuizEngine.pickDistractors(target, tinyPool, 3, function (e) { return e.lemma_de; });
  assert.strictEqual(distractors.length, 3);
});

test("buildSession returns one question per target entry, capped by limit", function () {
  var pool = makePool();
  var session = QuizEngine.buildSession(pool, pool, { limit: 3, rng: function () { return 0.1; } });
  assert.strictEqual(session.length, 3);
  session.forEach(function (q) {
    assert.ok(QuizEngine.TYPES.indexOf(q.type) !== -1);
    assert.ok(q.options.length >= 2);
  });
});

test("buildSession is deterministic given a fixed rng", function () {
  var pool = makePool();
  function fixedRng() { return 0.42; }
  var s1 = QuizEngine.buildSession(pool, pool, { rng: fixedRng });
  var s2 = QuizEngine.buildSession(pool, pool, { rng: fixedRng });
  assert.deepStrictEqual(s1.map(function (q) { return q.entry.id + ":" + q.type; }), s2.map(function (q) { return q.entry.id + ":" + q.type; }));
});

console.log("\n" + passed + " test(s) passed.");
if (process.exitCode) {
  console.error("Some tests FAILED.");
} else {
  console.log("All tests passed.");
}
