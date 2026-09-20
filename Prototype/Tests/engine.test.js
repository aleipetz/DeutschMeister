/*
 * Plain Node test for App/engine.js — no test framework, no npm install.
 * Run with: node Tests/engine.test.js
 */
var assert = require("assert");
var path = require("path");
var Engine = require(path.join(__dirname, "..", "App", "engine.js"));

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

test("createProgress starts at box 0, mastery=new", function () {
  var p = Engine.createProgress("word1", new Date("2026-01-01T00:00:00Z"));
  assert.strictEqual(p.boxLevel, 0);
  assert.strictEqual(Engine.masteryState(p), Engine.MASTERY.NEW);
});

test("correct review advances box and schedules next review by interval", function () {
  var now = new Date("2026-01-01T00:00:00Z");
  var p = Engine.createProgress("word1", now);
  var result = Engine.applyReview(p, true, 3, now);
  assert.strictEqual(result.progress.boxLevel, 1);
  var expectedNext = new Date(now.getTime());
  expectedNext.setDate(expectedNext.getDate() + Engine.BOX_INTERVALS_DAYS[1]);
  assert.strictEqual(
    new Date(result.progress.nextReviewDate).toDateString(),
    expectedNext.toDateString()
  );
});

test("incorrect review resets box to 0 and correctStreak to 0", function () {
  var now = new Date("2026-01-01T00:00:00Z");
  var p = Engine.createProgress("word1", now);
  p.boxLevel = 4;
  p.correctStreak = 5;
  p.totalReviews = 5;
  var result = Engine.applyReview(p, false, 2, now);
  assert.strictEqual(result.progress.boxLevel, 0);
  assert.strictEqual(result.progress.correctStreak, 0);
  assert.strictEqual(result.xpEarned, 0);
});

test("box level caps at MAX_BOX on repeated correct answers", function () {
  var now = new Date("2026-01-01T00:00:00Z");
  var p = Engine.createProgress("word1", now);
  for (var i = 0; i < 20; i++) {
    var r = Engine.applyReview(p, true, 1, now);
    p = r.progress;
  }
  assert.strictEqual(p.boxLevel, Engine.MAX_BOX);
});

test("mastery state transitions learning -> familiar -> mastered as box rises", function () {
  var now = new Date("2026-01-01T00:00:00Z");
  var p = Engine.createProgress("word1", now);
  var r1 = Engine.applyReview(p, true, 1, now); // box 1 -> learning
  assert.strictEqual(Engine.masteryState(r1.progress), Engine.MASTERY.LEARNING);

  var p3 = r1.progress;
  for (var i = 0; i < 2; i++) p3 = Engine.applyReview(p3, true, 1, now).progress; // box 3 -> familiar
  assert.strictEqual(Engine.masteryState(p3), Engine.MASTERY.FAMILIAR);

  var p5 = p3;
  for (var j = 0; j < 2; j++) p5 = Engine.applyReview(p5, true, 1, now).progress; // box 5 -> mastered
  assert.strictEqual(Engine.masteryState(p5), Engine.MASTERY.MASTERED);
  assert.ok(p5.dateMastered, "dateMastered should be set once mastered");
});

test("dateMastered clears if the word regresses below mastered", function () {
  var now = new Date("2026-01-01T00:00:00Z");
  var p = Engine.createProgress("word1", now);
  for (var i = 0; i < 5; i++) p = Engine.applyReview(p, true, 1, now).progress;
  assert.ok(p.dateMastered);
  var regressed = Engine.applyReview(p, false, 1, now).progress;
  assert.strictEqual(regressed.dateMastered, null);
});

test("leech detection flags after >8 reviews with <50% accuracy", function () {
  var now = new Date("2026-01-01T00:00:00Z");
  var p = Engine.createProgress("word1", now);
  var results = [true, false, false, true, false, false, true, false, false];
  results.forEach(function (correct) {
    p = Engine.applyReview(p, correct, 1, now).progress;
  });
  assert.strictEqual(p.totalReviews, 9);
  assert.ok(p.isLeech);
});

test("XP: base 5 + priority, +10 first-time-correct bonus, 0 on wrong", function () {
  var now = new Date("2026-01-01T00:00:00Z");
  var p = Engine.createProgress("word1", now);
  var first = Engine.applyReview(p, true, 3, now);
  assert.strictEqual(first.xpEarned, 5 + 3 + 10);

  var second = Engine.applyReview(first.progress, true, 3, now);
  assert.strictEqual(second.xpEarned, 5 + 3);

  var wrong = Engine.applyReview(second.progress, false, 3, now);
  assert.strictEqual(wrong.xpEarned, 0);
});

test("isDue reflects nextReviewDate vs now", function () {
  var now = new Date("2026-01-01T00:00:00Z");
  var p = Engine.createProgress("word1", now);
  var reviewed = Engine.applyReview(p, true, 1, now).progress; // due in 1 day
  assert.strictEqual(Engine.isDue(reviewed, now), false);
  var oneDayLater = new Date(now.getTime());
  oneDayLater.setDate(oneDayLater.getDate() + 1);
  assert.strictEqual(Engine.isDue(reviewed, oneDayLater), true);
});

test("comboMultiplier thresholds", function () {
  assert.strictEqual(Engine.comboMultiplier(0), 1);
  assert.strictEqual(Engine.comboMultiplier(4), 1);
  assert.strictEqual(Engine.comboMultiplier(5), 1.5);
  assert.strictEqual(Engine.comboMultiplier(9), 1.5);
  assert.strictEqual(Engine.comboMultiplier(10), 2);
  assert.strictEqual(Engine.comboMultiplier(100), 2);
});

test("recordGoalMet: first day sets streak to 1", function () {
  var profile = { currentStreakDays: 0, longestStreakDays: 0, lastActiveDate: null, streakFreezesAvailable: 0 };
  var updated = Engine.recordGoalMet(profile, new Date("2026-01-01T12:00:00Z"));
  assert.strictEqual(updated.currentStreakDays, 1);
});

test("recordGoalMet: consecutive day increments streak", function () {
  var profile = { currentStreakDays: 1, longestStreakDays: 1, lastActiveDate: "2026-01-01T12:00:00.000Z", streakFreezesAvailable: 0 };
  var updated = Engine.recordGoalMet(profile, new Date("2026-01-02T09:00:00Z"));
  assert.strictEqual(updated.currentStreakDays, 2);
});

test("recordGoalMet: same day does not double-increment", function () {
  var profile = { currentStreakDays: 1, longestStreakDays: 1, lastActiveDate: "2026-01-01T09:00:00.000Z", streakFreezesAvailable: 0 };
  var updated = Engine.recordGoalMet(profile, new Date("2026-01-01T20:00:00Z"));
  assert.strictEqual(updated.currentStreakDays, 1);
});

test("recordGoalMet: 7-day streak grants a freeze (capped at 3)", function () {
  var profile = { currentStreakDays: 6, longestStreakDays: 6, lastActiveDate: "2026-01-06T09:00:00.000Z", streakFreezesAvailable: 0 };
  var updated = Engine.recordGoalMet(profile, new Date("2026-01-07T09:00:00Z"));
  assert.strictEqual(updated.currentStreakDays, 7);
  assert.strictEqual(updated.streakFreezesAvailable, 1);
});

test("recordGoalMet: gap of 2+ days with a freeze available consumes it and preserves streak", function () {
  var profile = { currentStreakDays: 7, longestStreakDays: 7, lastActiveDate: "2026-01-07T09:00:00.000Z", streakFreezesAvailable: 1 };
  var updated = Engine.recordGoalMet(profile, new Date("2026-01-09T09:00:00Z")); // missed the 8th
  assert.strictEqual(updated.streakFreezesAvailable, 0);
  assert.strictEqual(updated.currentStreakDays, 8);
});

test("recordGoalMet: gap of 2+ days with no freeze resets streak to 1", function () {
  var profile = { currentStreakDays: 7, longestStreakDays: 7, lastActiveDate: "2026-01-07T09:00:00.000Z", streakFreezesAvailable: 0 };
  var updated = Engine.recordGoalMet(profile, new Date("2026-01-09T09:00:00Z"));
  assert.strictEqual(updated.currentStreakDays, 1);
});

console.log("\n" + passed + " test(s) passed.");
if (process.exitCode) {
  console.error("Some tests FAILED.");
} else {
  console.log("All tests passed.");
}
