/*
 * run-tests.js — Node test runner for the logic + data of
 * "Guess the Word: Animal Mystery".  Run with:  node tests/run-tests.js
 * No external test framework required.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var levelsData = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'levels.json'), 'utf8'));
var questionsData = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'questions.json'), 'utf8'));

var Letters = require(path.join(ROOT, 'js', 'letters.js'));
var Levels = require(path.join(ROOT, 'js', 'levels.js'));
var StorageMod = require(path.join(ROOT, 'js', 'storage.js'));
var GameMod = require(path.join(ROOT, 'js', 'game.js'));
var AnimalGame = GameMod.AnimalGame;

var passed = 0, failed = 0, failures = [];
function test(section, name, fn) {
  try {
    fn();
    passed += 1;
    console.log('  PASS  ' + name);
  } catch (e) {
    failed += 1;
    failures.push(section + ' / ' + name + ' :: ' + e.message);
    console.log('  FAIL  ' + name + '  ::  ' + e.message);
  }
}
function ok(cond, label) { if (!cond) throw new Error(label || 'expected truthy'); }
function eq(actual, expected, label) {
  if (actual !== expected) throw new Error((label || '') + ' expected ' + JSON.stringify(expected) + ' but got ' + JSON.stringify(actual));
}
function deepEq(a, b, label) {
  var ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja !== jb) throw new Error((label || '') + ' expected ' + jb + ' but got ' + ja);
}
function questionById(id) {
  for (var i = 0; i < questionsData.questions.length; i++) {
    if (questionsData.questions[i].id === id) return questionsData.questions[i];
  }
  throw new Error('no question ' + id);
}
function newGame(store, now) {
  return new AnimalGame({ levels: levelsData, questions: questionsData, store: store, now: now });
}
// Fill every slot with a guaranteed-wrong full word: the answer with its first two
// (distinct) letters swapped — same letter multiset, so always placeable from the bank.
function swapFill(game) {
  var a = game._answer.split('');
  var seq = [a[1], a[0]].concat(a.slice(2));
  seq.forEach(function (ch) { ok(game.selectLetter(ch), 'swapFill selectLetter ' + ch); });
}
function solveCurrent(game) {
  var events = [];
  var off = game.on('correct', function (p) { events.push(p); });
  game._answer.split('').forEach(function (ch) { ok(game.selectLetter(ch), 'solveCurrent selectLetter ' + ch); });
  off();
  if (events.length !== 1) throw new Error('expected exactly 1 correct event, got ' + events.length);
  return events[0];
}
function completeLevelQuick(game, levelId, t) {
  game.startLevel(levelId);
  var rewards = [];
  for (var i = 0; i < 4; i++) {
    t.value += 1000; game.tick(t.value);
    rewards.push(solveCurrent(game).reward);
    game.advanceAfterSuccess();
  }
  return rewards;
}

console.log('=== DATA: questions.json / levels.json ===');

test('DATA', 'validateGameData passes with zero errors', function () {
  var v = Levels.validateGameData(levelsData, questionsData);
  ok(v.ok, 'validation errors: ' + v.errors.join(' | '));
});

test('DATA', 'matchesSpec: 10 levels x 4 answers in exact spec order', function () {
  var m = Levels.matchesSpec(levelsData, questionsData);
  ok(m.ok, 'spec mismatch: ' + m.reason);
});

test('DATA', 'exactly 10 levels, each with exactly 4 questionIds', function () {
  eq(levelsData.levels.length, 10, 'level count');
  levelsData.levels.forEach(function (l) { eq(l.questionIds.length, 4, l.id + ' questionIds'); });
});

test('DATA', 'exactly 40 questions, unique ids, unique answers, unique assets', function () {
  var qs = questionsData.questions;
  eq(qs.length, 40, 'question count');
  var ids = {}, answers = {}, assets = {};
  qs.forEach(function (q) {
    ok(!ids[q.id], 'duplicate id ' + q.id); ids[q.id] = 1;
    ok(!answers[q.answer], 'duplicate answer ' + q.answer); answers[q.answer] = 1;
    ok(!assets[q.silhouetteAsset], 'duplicate asset ' + q.silhouetteAsset); assets[q.silhouetteAsset] = 1;
  });
});

test('DATA', 'every level: name, tagline, answers order, timer and bank rule match spec', function () {
  Levels.SPEC.levels.forEach(function (spec, i) {
    var lvl = levelsData.levels[i];
    eq(lvl.id, spec.id, 'level ' + i + ' id');
    eq(lvl.name, spec.name, spec.id + ' name');
    ok(lvl.tagline && lvl.tagline.length >= 5, spec.id + ' tagline');
    eq((lvl.timerSeconds === null ? null : lvl.timerSeconds), spec.timerSeconds, spec.id + ' timer');
    deepEq(lvl.bank, spec.bank, spec.id + ' bank rule');
    lvl.questionIds.forEach(function (qid, a) {
      eq(questionById(qid).answer, spec.answers[a], spec.id + ' answer #' + (a + 1));
    });
  });
});

test('DATA', 'timers: L01-L03 none, then 70/65/60/55/50/50/45 seconds', function () {
  var expected = [null, null, null, 70, 65, 60, 55, 50, 50, 45];
  levelsData.levels.forEach(function (l, i) { eq(l.timerSeconds, expected[i], l.id); });
});

test('DATA', 'answers are 3-12 uppercase A-Z; hints/facts non-empty; hints never spoil', function () {
  questionsData.questions.forEach(function (q) {
    ok(/^[A-Z]{3,12}$/.test(q.answer), q.id + ' answer format');
    ok(q.hint && q.hint.trim().length >= 10, q.id + ' hint');
    ok(q.fact && q.fact.trim().length >= 10, q.id + ' fact');
    ok(q.hint.toLowerCase().indexOf(q.answer.toLowerCase()) === -1, q.id + ' hint spoils answer');
    ok(q.hint.toLowerCase().indexOf(q.animal.toLowerCase()) === -1, q.id + ' hint contains animal name');
  });
});

test('DATA', 'asset filenames are neutral (no animal names anywhere in path)', function () {
  questionsData.questions.forEach(function (q) {
    ok(/^assets\/silhouettes\/q\d{3}\.svg$/.test(q.silhouetteAsset), q.id + ' asset path pattern');
    var basename = q.silhouetteAsset.split('/').pop().toLowerCase();
    questionsData.questions.forEach(function (other) {
      ok(basename.indexOf(other.answer.toLowerCase()) === -1,
        q.id + ' asset name leaks answer ' + other.answer);
    });
  });
});

test('DATA', 'validator catches corrupted data (negative cases)', function () {
  var badLevels = JSON.parse(JSON.stringify(levelsData));
  badLevels.levels[0].questionIds.pop(); // only 3 questions in L01
  var v1 = Levels.validateGameData(badLevels, questionsData);
  ok(!v1.ok, 'should fail with 3 questionIds');

  var badQs = JSON.parse(JSON.stringify(questionsData));
  badQs.questions[1].answer = 'CAT'; // duplicate answer
  var v2 = Levels.validateGameData(levelsData, badQs);
  ok(!v2.ok, 'should fail on duplicate answer');

  var badQs2 = JSON.parse(JSON.stringify(questionsData));
  badQs2.questions[0].hint = 'The answer is CAT, obviously'; // spoiler hint
  var v3 = Levels.validateGameData(levelsData, badQs2);
  ok(!v3.ok, 'should fail on spoiling hint');
});

console.log('');
console.log('=== 10 x 4 CONTENT VALIDATION TABLE ===');
levelsData.levels.forEach(function (l) {
  var answers = l.questionIds.map(function (qid) { return questionById(qid).answer; });
  var unique = answers.filter(function (a, i) { return answers.indexOf(a) === i; });
  var line = l.id + ' ' + l.name + ': ' + answers.join(', ');
  ok(answers.length === 4 && unique.length === 4, l.id + ' must have 4 distinct answers');
  console.log('  ' + line + (l.timerSeconds ? '  [timer ' + l.timerSeconds + 's]' : '  [no timer]') + '  -> OK');
});

console.log('');
console.log('=== LETTERS: bank generation ===');

test('LETTERS', 'bank size rule for all 40 answers matches clamp(len+extra, min, max)', function () {
  Levels.SPEC.levels.forEach(function (spec) {
    var lvl = levelsData.levels.filter(function (l) { return l.id === spec.id; })[0];
    spec.answers.forEach(function (answer) {
      var expected = Math.min(lvl.bank.max, Math.max(lvl.bank.min, answer.length + lvl.bank.extra));
      eq(Letters.computeBankSize(lvl.bank, answer.length), expected, spec.id + '/' + answer);
    });
  });
});

test('LETTERS', 'spot-check bank sizes: CAT=9, KOALA=10, RABBIT=11, PENGUIN=12, ELEPHANT=13, ARMADILLO=14, HIPPOPOTAMUS=16', function () {
  var byId = {};
  levelsData.levels.forEach(function (l) { byId[l.id] = l.bank; });
  eq(Letters.computeBankSize(byId.L01, 3), 9, 'CAT');
  eq(Letters.computeBankSize(byId.L05, 5), 10, 'KOALA');
  eq(Letters.computeBankSize(byId.L06, 6), 11, 'RABBIT');
  eq(Letters.computeBankSize(byId.L07, 7), 12, 'PENGUIN');
  eq(Letters.computeBankSize(byId.L08, 8), 13, 'ELEPHANT');
  eq(Letters.computeBankSize(byId.L09, 9), 14, 'ARMADILLO');
  eq(Letters.computeBankSize(byId.L10, 12), 16, 'HIPPOPOTAMUS');
});

test('LETTERS', 'all 40 banks: right size, unique tile ids, always contain the answer multiset', function () {
  questionsData.questions.forEach(function (q) {
    var lvl = levelsData.levels.filter(function (l) { return l.id === q.levelId; })[0];
    var tiles = Letters.buildBank(q.answer, lvl.bank, q.id + '#attempt#1');
    var expectedSize = Letters.computeBankSize(lvl.bank, q.answer.length);
    eq(tiles.length, expectedSize, q.id + ' bank size');
    ok(tiles.length >= q.answer.length, q.id + ' at least as many tiles as slots');
    ok(Letters.bankContainsAnswer(tiles, q.answer), q.id + ' bank contains answer multiset');
    var ids = {};
    tiles.forEach(function (t) { ok(!ids[t.id], q.id + ' duplicate tile id'); ids[t.id] = 1; ok(/^[A-Z]$/.test(t.letter), q.id + ' tile letter'); });
  });
});

test('LETTERS', 'bank is never the answer spelled in order at its head', function () {
  questionsData.questions.forEach(function (q) {
    var lvl = levelsData.levels.filter(function (l) { return l.id === q.levelId; })[0];
    var tiles = Letters.buildBank(q.answer, lvl.bank, q.id + '#attempt#1');
    var head = tiles.slice(0, q.answer.length).map(function (t) { return t.letter; }).join('');
    ok(head !== q.answer, q.id + ' head spells the answer');
    // and it is genuinely shuffled (bank order differs from unshuffled answer+distractors build order)
    var differentFromAnswerOrder = tiles.some(function (t, i) { return i < q.answer.length && t.letter !== q.answer[i]; });
    ok(differentFromAnswerOrder, q.id + ' not shuffled');
  });
});

test('LETTERS', 'same seed -> identical bank (deterministic across rebuilds)', function () {
  questionsData.questions.forEach(function (q) {
    var lvl = levelsData.levels.filter(function (l) { return l.id === q.levelId; })[0];
    deepEq(
      Letters.buildBank(q.answer, lvl.bank, q.id + '#attempt#7'),
      Letters.buildBank(q.answer, lvl.bank, q.id + '#attempt#7'),
      q.id + ' determinism'
    );
  });
});

test('LETTERS', 'repeated-letter answers carry correct duplicate counts (RABBIT, GIRAFFE, HIPPOPOTAMUS)', function () {
  function bankCounts(word) {
    var lvl = levelsData.levels.filter(function (l) { return l.id === 'L06'; })[0];
    var tiles = Letters.buildBank(word, { min: 9, max: 16, extra: 6 }, 'seed#' + word);
    var counts = {};
    tiles.forEach(function (t) { counts[t.letter] = (counts[t.letter] || 0) + 1; });
    return counts;
  }
  var rabbit = bankCounts('RABBIT');
  ok(rabbit.B >= 2 && rabbit.R >= 1 && rabbit.A >= 1 && rabbit.I >= 1 && rabbit.T >= 1, 'RABBIT needs B x2');
  var giraffe = bankCounts('GIRAFFE');
  ok(giraffe.F >= 2 && giraffe.R >= 1 && giraffe.G >= 1 && giraffe.I >= 1 && giraffe.A >= 1 && giraffe.E >= 1, 'GIRAFFE needs F x2');
  var hippo = bankCounts('HIPPOPOTAMUS');
  ok(hippo.P >= 3 && hippo.O >= 2 && hippo.H >= 1 && hippo.I >= 1 && hippo.T >= 1 && hippo.A >= 1 && hippo.M >= 1 && hippo.U >= 1 && hippo.S >= 1, 'HIPPOPOTAMUS needs P x3, O x2');
});

test('LETTERS', 'grid layout helper: 9 -> 3 columns, 10-16 -> 4 columns', function () {
  eq(Letters.gridColumns(9), 3);
  eq(Letters.gridColumns(10), 4);
  eq(Letters.gridColumns(12), 4);
  eq(Letters.gridColumns(14), 4);
  eq(Letters.gridColumns(16), 4);
});

console.log('');
console.log('=== GAMEPLAY: full 10-level sweep ===');

test('GAME', 'every level solvable 4/4; rewards 120/130/140/150; 3 stars; unlocks next level', function () {
  var store = new StorageMod.ProgressStore(new StorageMod.MemoryStorage());
  var t = { value: 1000000 };
  Levels.SPEC.levels.forEach(function (spec, i) {
    var game = newGame(store, function () { return t.value; });
    var rewards = completeLevelQuick(game, spec.id, t);
    deepEq(rewards, [120, 130, 140, 150], spec.id + ' rewards (100 + 20 no-hint + streak)');
    eq(game.phase, 'level-complete', spec.id + ' phase');
    eq(game.hearts, 3, spec.id + ' hearts kept');
    eq(game.levelScore, 540, spec.id + ' level score');
    eq(store.getBestStars(spec.id), 3, spec.id + ' best stars');
    eq(store.getBestScore(spec.id), 540, spec.id + ' best score');
    if (i + 1 < Levels.SPEC.levels.length) {
      ok(store.isUnlocked(Levels.SPEC.levels[i + 1].id), spec.id + ' unlocked next level');
    }
  });
  ok(store.isUnlocked('L10'), 'all levels unlocked at the end');
});

test('GAME', 'streak bonus caps at +40 across consecutive levels', function () {
  var game = newGame(new StorageMod.ProgressStore(new StorageMod.MemoryStorage()), function () { return 0; });
  var t = { value: 500000 };
  var r1 = completeLevelQuick(game, 'L01', t);   // streaks 1..4 -> bonuses 0/10/20/30
  deepEq(r1, [120, 130, 140, 150], 'L01 rewards');
  var r2 = completeLevelQuick(game, 'L02', t);   // streaks 5..8 -> bonuses capped at 40
  deepEq(r2, [160, 160, 160, 160], 'L02 rewards (streak capped at +40)');
  eq(game.totalScore, 540 + 640, 'totalScore sums completed levels');
});

console.log('');
console.log('=== GAMEPLAY: wrong answers, hearts, input guards ===');

test('GAME', 'wrong full word: -1 heart, Try again, attempt cleared, same bank, streak reset', function () {
  var game = newGame();
  game.startLevel('L01'); // CAT
  var tilesRef = game.tiles;
  game.streak = 2; // pretend a streak was running
  var wrongEvents = 0;
  var off = game.on('wrong', function () { wrongEvents += 1; });
  swapFill(game); // fills "ACT" -> auto-submits -> wrong
  off();
  eq(wrongEvents, 1, 'exactly one wrong event');
  eq(game.phase, 'wrong', 'phase');
  eq(game.hearts, 2, 'one heart deducted');
  eq(game.streak, 0, 'streak reset');

  // input locked during feedback: no double submission, no extra heart loss
  ok(!game.selectLetter('C'), 'selectLetter locked');
  ok(!game.undoRecent(), 'undo locked');
  ok(!game.clearAll(), 'clear locked');
  ok(!game.useHint(), 'hint locked');
  ok(!game.advanceAfterSuccess(), 'advance blocked before success');
  eq(game.hearts, 2, 'no double deduction');

  ok(game.resolveWrong(), 'resolveWrong');
  eq(game.phase, 'solving', 'back to solving');
  ok(game.tiles === tilesRef, 'bank object identity preserved (not rebuilt)');
  ok(game.tiles.every(function (tl) { return !tl.used; }), 'all tiles restored');
  ok(game.slots.every(function (s) { return s.letter === null && !s.locked; }), 'slots cleared');

  var p = solveCurrent(game); // streak was reset -> starts at 1 again
  eq(p.reward, 120, 'reward after reset streak');
  eq(game.levelScore, 120, 'wrong attempt scored nothing');
});

test('GAME', 'partial input, undo and clear never cost hearts', function () {
  var game = newGame();
  game.startLevel('L01'); // CAT
  ok(game.selectLetter('C'), 'place C');
  ok(game.selectLetter('A'), 'place A');
  ok(game.undoRecent(), 'backspace removes A (most recent)');
  eq(game.slots[1].letter, null, 'slot 1 empty');
  ok(game.slots[0].letter === 'C', 'slot 0 keeps C');
  ok(game.undoSlot(0), 'tap slot 0 to undo that letter');
  eq(game.slots[0].letter, null, 'slot 0 empty');

  ok(game.selectLetter('T'), 'place T');
  ok(game.selectLetter('C'), 'place C');
  ok(game.clearAll(), 'clear');
  ok(game.slots.every(function (s) { return s.letter === null; }), 'cleared');
  ok(game.tiles.every(function (tl) { return !tl.used; }), 'tiles freed');
  eq(game.hearts, 3, 'no heart lost');
  eq(game.phase, 'solving', 'still solving');
});

test('GAME', 'undo picks the most recent letter; slot tap undoes exactly that slot', function () {
  var game = newGame();
  game.startLevel('L03'); // LION
  ['L', 'I', 'O'].forEach(function (c) { ok(game.selectLetter(c), 'place ' + c); });
  ok(game.undoRecent(), 'undo recent');
  eq(game.slots[2].letter, null, 'last slot freed');
  eq(game.slots[0].letter, 'L', 'first slot untouched');
  ok(game.undoSlot(1), 'undo slot 1 directly');
  eq(game.slots[1].letter, null, 'slot 1 freed');
  eq(game.slots[0].letter, 'L', 'slot 0 still there');
});

test('GAME', 'hearts are shared across the 4 questions of a level; 3 wrongs = level failed', function () {
  var game = newGame();
  game.startLevel('L01'); // CAT
  swapFill(game); eq(game.hearts, 2, 'wrong #1');
  game.resolveWrong();
  solveCurrent(game); game.advanceAfterSuccess(); // q1 solved
  eq(game.hearts, 2, 'hearts carry into q2');
  eq(game.questionIndex, 1, 'on q2');
  swapFill(game); eq(game.hearts, 1, 'wrong #2 (shared hearts)');
  game.resolveWrong();
  swapFill(game); eq(game.hearts, 0, 'wrong #3');
  eq(game.phase, 'level-failed', 'fail screen');
  ok(!game.resolveWrong(), 'resolveWrong does nothing after fail');
  ok(game.retryLevel(), 'retry');
  eq(game.phase, 'solving', 'retry -> solving');
  eq(game.hearts, 3, 'hearts reset on retry');
  eq(game.questionIndex, 0, 'back to first question');
});

test('GAME', 'retry never overwrites prior best progress', function () {
  var store = new StorageMod.ProgressStore(new StorageMod.MemoryStorage());
  var t = { value: 1 };
  var g1 = newGame(store, function () { return t.value; });
  completeLevelQuick(g1, 'L01', t); // 3 stars, 540
  eq(store.getBestStars('L01'), 3, 'L01 best stars');
  ok(store.isUnlocked('L02'), 'L02 unlocked');

  var game = newGame(store, function () { return t.value; });
  game.startLevel('L02'); // DUCK
  swapFill(game); game.resolveWrong();
  swapFill(game); game.resolveWrong();
  swapFill(game);
  eq(game.phase, 'level-failed', 'L02 failed');
  game.retryLevel();
  swapFill(game); game.resolveWrong();
  swapFill(game); game.resolveWrong();
  swapFill(game);
  eq(game.phase, 'level-failed', 'L02 failed again');
  eq(store.getBestStars('L01'), 3, 'L01 best stars untouched');
  eq(store.getBestScore('L01'), 540, 'L01 best score untouched');
  ok(store.isUnlocked('L02'), 'L02 stays unlocked');
});

test('GAME', 'best stars/score are maximums: replaying worse does not downgrade', function () {
  var store = new StorageMod.ProgressStore(new StorageMod.MemoryStorage());
  store.recordLevelResult('L01', 2, 480);
  eq(store.getBestStars('L01'), 2, 'first result stored');
  eq(store.getBestScore('L01'), 480, 'first score stored');
  store.recordLevelResult('L01', 1, 100);
  eq(store.getBestStars('L01'), 2, 'worse stars do not downgrade');
  eq(store.getBestScore('L01'), 480, 'worse score does not downgrade');
  store.recordLevelResult('L01', 3, 600);
  eq(store.getBestStars('L01'), 3, 'better stars upgrade');
  eq(store.getBestScore('L01'), 600, 'better score upgrades');
});

test('GAME', 'stars equal remaining hearts (2 hearts -> 2 stars) on a real run', function () {
  var store = new StorageMod.ProgressStore(new StorageMod.MemoryStorage());
  var game = newGame(store);
  game.startLevel('L01');
  swapFill(game); game.resolveWrong(); // 2 hearts
  for (var i = 0; i < 4; i++) { solveCurrent(game); game.advanceAfterSuccess(); }
  eq(store.getBestStars('L01'), 2, '2 stars saved');
  eq(store.getBestScore('L01'), 120 + 130 + 140 + 150 - 0, 'score 540 minus nothing for the wrong attempt');
});

console.log('');
console.log('=== GAMEPLAY: repeated letters, hints ===');

test('GAME', 'repeated letters are separate tiles (RABBIT with two B tiles)', function () {
  var game = newGame();
  game.startLevel('L06'); // RABBIT
  ok(game.selectLetter('B'), 'first B');
  ok(game.selectLetter('B'), 'second B is a distinct tile');
  var bTiles = game.tiles.filter(function (tl) { return tl.letter === 'B'; });
  ok(bTiles.length >= 2, 'bank carries at least 2 B tiles');
  var usedB = bTiles.filter(function (tl) { return tl.used; });
  eq(usedB.length, 2, 'two different B tiles consumed');
  ok(usedB[0].id !== usedB[1].id, 'distinct tile ids');
  game.clearAll();
  var p = solveCurrent(game);
  eq(p.reward, 120, 'RABBIT solvable');
});

test('GAME', 'hint: reveals+locks first blank, consumes its tile, costs 25, once per question', function () {
  var game = newGame();
  game.startLevel('L04'); // HORSE, 70s timer
  ok(game.useHint(), 'hint accepted');
  eq(game.slots[0].letter, 'H', 'slot 0 revealed');
  ok(game.slots[0].locked, 'slot 0 locked');
  eq(game.hintsUsed, 1, 'one hint used');
  var hTile = game.tiles.filter(function (tl) { return tl.letter === 'H' && tl.used; });
  eq(hTile.length, 1, 'H tile consumed');
  ok(!game.useHint(), 'second hint refused');
  ok(!game.undoSlot(0), 'locked slot cannot be undone');
  ok(game.selectLetter('O'), 'fill O');
  ok(game.selectLetter('R'), 'fill R');
  ok(game.selectLetter('S'), 'fill S');
  ok(game.clearAll(), 'clear keeps locked slot');
  ok(game.slots[0].locked && game.slots[0].letter === 'H', 'hint stays after clear');
  ok(game.selectLetter('O'), 'refill O');
  ok(game.selectLetter('R'), 'refill R');
  ok(game.selectLetter('S'), 'refill S');
  ok(game.selectLetter('E'), 'fill E -> board full -> auto-submit');
  eq(game.phase, 'correct', 'HORSE solved');
  eq(game.levelScore, 75, '100 - 25 hint penalty, no +20 bonus');
});

test('GAME', 'hint rescues an otherwise stuck layout (every copy of a letter misplaced)', function () {
  var game = newGame();
  game.startLevel('L06'); // RABBIT; its deterministic attempt-1 bank carries B x3 (2 answer + 1 distractor)
  eq(game.tiles.filter(function (tl) { return tl.letter === 'B'; }).length, 3, 'B x3 in bank');
  ok(game.selectLetter('B'), 'B -> slot 0');
  ok(game.selectLetter('B'), 'B -> slot 1');
  ok(game.selectLetter('B'), 'B -> slot 2 (all B copies now used)');
  ok(game.useHint(), 'hint at first blank: slot 3 needs B and no unused B tile exists');
  eq(game.slots[3].letter, 'B', 'slot 3 revealed');
  ok(game.slots[3].locked, 'slot 3 locked');
  eq(game.slots[2].letter, null, 'most recent misplaced B freed from slot 2');
  eq(game.slots[0].letter, 'B', 'earlier placement untouched');
  eq(game.slots[1].letter, 'B', 'earlier placement untouched');
  eq(game.tiles.filter(function (tl) { return tl.letter === 'B' && tl.used; }).length, 3,
    'net B consumption unchanged (one freed, one locked in)');
  // still winnable: undo the two wrong Bs, then spell the remaining letters
  ok(game.undoRecent(), 'free slot 1');
  ok(game.undoRecent(), 'free slot 0');
  ['R', 'A', 'B', 'I', 'T'].forEach(function (c) { ok(game.selectLetter(c), 'fill ' + c); });
  eq(game.phase, 'correct', 'RABBIT solvable after hint rescue');
  eq(game.levelScore, 75, '100 - 25 hint penalty applied');
});

test('GAME', 'hint completing the word submits automatically', function () {
  var game = newGame();
  game.startLevel('L02'); // DUCK
  ['D', 'U', 'C'].forEach(function (c) { ok(game.selectLetter(c), 'place ' + c); });
  ok(game.useHint(), 'hint fills last slot K');
  eq(game.phase, 'correct', 'auto-submitted on hint completion');
  ok(game.slots[3].locked, 'hint slot locked');
});

console.log('');
console.log('=== AUDIO: sound-event dispatch ===');
var AudioMod = require(path.join(ROOT, 'js', 'audio.js'));

function makeAudio() {
  var played = [];
  var clock = { value: 0 };
  var audio = new AudioMod.AudioManager({
    now: function () { return clock.value; },
    onPlay: function (name, opt) { played.push({ name: name, opt: opt }); }
  });
  audio.setSoundOn(true);
  return { audio: audio, played: played, clock: clock };
}
function countPlayed(played, name) {
  return played.filter(function (p) { return p.name === name; }).length;
}

test('AUDIO', 'module loads; AudioManager + pure timerCue helper exposed and Node-safe', function () {
  ok(AudioMod.AudioManager && AudioMod.timerCue, 'exports');
  var a = new AudioMod.AudioManager();   // no window/AudioContext: must not throw
  ok(a.play('pop') === false, 'muted by default in Node (no harness set)');
});

test('AUDIO', 'timerCue: one warning at <=10s, restrained ticks exactly once at 3/2/1, none outside', function () {
  var prior = { warned: false, lastTick: -1 };
  eq(AudioMod.timerCue(11, prior), null, 'before 10s');
  eq(AudioMod.timerCue(10, prior), 'timer-warning', 'at 10s');
  prior.warned = true;
  eq(AudioMod.timerCue(9.5, prior), null, 'mid countdown: silent');
  eq(AudioMod.timerCue(4, prior), null, 'not yet final three');
  eq(AudioMod.timerCue(3, prior), 'countdown-3', 'tick 3');
  prior.lastTick = 3;
  eq(AudioMod.timerCue(3, prior), null, 'no double tick for 3');
  eq(AudioMod.timerCue(2, prior), 'countdown-2', 'tick 2');
  prior.lastTick = 2;
  eq(AudioMod.timerCue(1, prior), 'countdown-1', 'tick 1');
  prior.lastTick = 1;
  eq(AudioMod.timerCue(0, prior), null, 'nothing at zero');
});

test('AUDIO', 'engine events -> exactly one sound each for place/undo/clear/hint/correct', function () {
  var h = makeAudio();
  var game = newGame();
  h.audio.wireEngine(game);
  game.startLevel('L01'); // CAT
  eq(countPlayed(h.played, 'swoosh'), 1, 'level start swoosh');

  h.clock.value += 0.06; ok(game.selectLetter('C'), 'place C');
  h.clock.value += 0.06; ok(game.selectLetter('A'), 'place A');
  eq(countPlayed(h.played, 'pop'), 2, 'two pops for two placements');
  // slot ladder used for pitch, not randomness
  eq(h.played.filter(function (p) { return p.name === 'pop'; })[1].opt.step, 1, 'second pop step');

  h.clock.value += 0.06; ok(game.undoRecent(), 'undo A');
  eq(countPlayed(h.played, 'undo'), 1, 'one undo sound');

  h.clock.value += 0.06; ok(game.useHint(), 'hint'); // reveals+locks next needed letter
  eq(countPlayed(h.played, 'hint'), 1, 'one hint sound');

  h.clock.value += 0.06; ok(game.selectLetter('T'), 'finish CAT'); // auto-submits
  eq(countPlayed(h.played, 'correct'), 1, 'exactly one correct chime');
  eq(countPlayed(h.played, 'wrong'), 0, 'no wrong sound on a correct word');
});

test('AUDIO', 'no-change actions dispatch nothing (used tile, empty undo/clear, spent hint, locked replay)', function () {
  var h = makeAudio();
  var game = newGame();
  h.audio.wireEngine(game);
  game.startLevel('L01');
  var baseline = 0;

  ok(!game.undoRecent(), 'undo on empty board');
  eq(countPlayed(h.played, 'undo'), baseline, 'no undo sound without a change');
  ok(!game.clearAll(), 'clear empty board');
  eq(countPlayed(h.played, 'clear'), baseline, 'no clear sound without a change');

  var usedId = game.tiles[0].id;
  ok(game.selectLetter(game.tiles[0].letter), 'place first tile');
  ok(!game.selectTile(usedId), 'same tile is used now');
  eq(countPlayed(h.played, 'pop'), 1, 'no pop for a disabled tile');

  ok(game.useHint(), 'hint #1'); h.clock.value += 0.06;
  h.clock.value += 0.06; ok(!game.useHint(), 'hint already used this question');
  eq(countPlayed(h.played, 'hint'), 1, 'no second hint sound');
});

test('AUDIO', 'wrong word -> one gentle oops; resolved without extra sounds', function () {
  var h = makeAudio();
  var game = newGame();
  h.audio.wireEngine(game);
  game.startLevel('L02'); // DUCK
  h.clock.value += 0.06;
  swapFill(game);              // auto-submits wrong
  eq(countPlayed(h.played, 'wrong'), 1, 'exactly one oops per rejected answer');
  eq(countPlayed(h.played, 'correct'), 0, 'no reveal sound on failure');
  h.clock.value += 0.06;
  game.resolveWrong();
  eq(countPlayed(h.played, 'wrong'), 1, 'resolving plays nothing new');
});

test('AUDIO', 'rapid taps: human-speed placements all sound; true machine spam is gated', function () {
  var h = makeAudio();
  var game = newGame();
  h.audio.wireEngine(game);
  game.startLevel('L03'); // LION
  ['L', 'I', 'O', 'N'].forEach(function (c) {
    h.clock.value += 0.03;      // 30ms apart: a fast real player
    ok(game.selectLetter(c), 'rapid place ' + c);
  });
  eq(countPlayed(h.played, 'pop'), 4, '4 rapid pops, none dropped');

  // anti-spam gate: the same-name burst under 20ms yields exactly one sound
  h.clock.value += 0.15;
  ok(h.audio.play('pop', { step: 0 }), 'pop 1 after cooldown');
  ok(!h.audio.play('pop', { step: 1 }), 'pop replayed 5ms later is gated');
  h.clock.value += 0.03;
  ok(h.audio.play('pop', { step: 1 }), 'pop plays again once the gate passes');
});

test('AUDIO', 'fanfare only on the 4th completion, once per event; star variants accepted', function () {
  var h = makeAudio();
  var game = newGame();
  h.audio.wireEngine(game);
  var t = { value: 1000000 };
  game.startLevel('L01');
  for (var i = 0; i < 3; i++) {                 // first 3 questions: no fanfare
    t.value += 1000; game.tick(t.value);
    game._answer.split('').forEach(function (ch) { h.clock.value += 0.06; game.selectLetter(ch); });
    game.advanceAfterSuccess();
    eq(countPlayed(h.played, 'fanfare'), 0, 'no fanfare at question ' + (i + 1));
  }
  t.value += 1000; game.tick(t.value);
  game._answer.split('').forEach(function (ch) { h.clock.value += 0.06; game.selectLetter(ch); });
  eq(countPlayed(h.played, 'correct'), 4, 'four correct chimes for four answers');
  game.advanceAfterSuccess();                   // 4th solved -> level complete
  eq(countPlayed(h.played, 'fanfare'), 1, 'fanfare exactly once');
  eq(h.played.filter(function (p) { return p.name === 'fanfare'; })[0].opt.stars, 3, '3-star variant');
});

test('AUDIO', 'muting absolutely silences everything, including fanfare and countdown cues', function () {
  var h = makeAudio();
  var game = newGame();
  h.audio.wireEngine(game);
  game.startLevel('L01');
  h.audio.setSoundOn(false);
  var n = h.played.length;

  swapFill(game);              // wrong answer while muted
  game.startLevel('L01');      // retry still makes zero sound
  ok(game.pause(), 'paused while muted');
  game.resume();
  game._loadQuestion(0);
  h.audio.play('fanfare', { stars: 3 });
  h.audio.onTimerSecond(10);
  h.audio.onTimerSecond(3);
  eq(h.played.length, n, 'not a single sound dispatched while muted');
  h.audio.setSoundOn(true);
  h.clock.value += 0.06;
  ok(h.audio.play('click'), 'unmuted again');
});

console.log('');

console.log('=== GAMEPLAY: timers, pause, visibility ===');

test('GAME', 'L01-L03 have no timer; timed levels start at the exact duration', function () {
  ['L01', 'L02', 'L03'].forEach(function (id) {
    var game = newGame(); game.startLevel(id);
    eq(game.timer, null, id + ' no timer');
  });
  var expected = { L04: 70000, L05: 65000, L06: 60000, L07: 55000, L08: 50000, L09: 50000, L10: 45000 };
  Object.keys(expected).forEach(function (id) {
    var game = newGame(); game.startLevel(id);
    eq(game.timer.totalMs, expected[id], id + ' total');
    eq(game.timer.remainingMs, expected[id], id + ' remaining');
  });
});

test('GAME', 'timeout: exactly -1 heart once, same question+bank, fresh timer', function () {
  var store = new StorageMod.ProgressStore(new StorageMod.MemoryStorage());
  var t = { value: 1000000 };
  var g0 = newGame(store, function () { return t.value; });
  completeLevelQuick(g0, 'L01', t); // seed store with prior progress

  var game = newGame(store, function () { return t.value; });
  game.startLevel('L04'); // HORSE, 70s
  var tilesRef = game.tiles;
  var timeoutCount = 0;
  var off = game.on('timeout', function () { timeoutCount += 1; });
  ok(game.selectLetter('H'), 'partial input before timeout');
  game.tick(t.value);      // anchor
  t.value += 1000; game.tick(t.value);
  eq(game.timer.remainingMs, 69000, 'timer ticks while solving');
  t.value += 70000; game.tick(t.value); // hits zero -> timeout
  off();
  eq(timeoutCount, 1, 'timeout fired once');
  eq(game.hearts, 2, 'one heart deducted');
  eq(game.phase, 'solving', 'still on the same question');
  eq(game.questionIndex, 0, 'same question index');
  eq(game.timer.remainingMs, 70000, 'fresh full timer');
  ok(game.tiles === tilesRef, 'same bank instance (deterministic seed kept)');
  ok(game.slots.every(function (s) { return s.letter === null; }), 'attempt cleared');
  ok(game.tiles.every(function (tl) { return !tl.used; }), 'tiles restored');
  eq(game.streak, 0, 'streak reset on timeout');

  t.value += 1000; game.tick(t.value);
  eq(game.timer.remainingMs, 69000, 'timer runs again normally');
  eq(game.hearts, 2, 'no double deduction on later ticks');

  t.value += 70000; game.tick(t.value); eq(game.hearts, 1, 'second timeout');
  t.value += 70000; game.tick(t.value); eq(game.hearts, 0, 'third timeout');
  eq(game.phase, 'level-failed', 'out of hearts');
  t.value += 70000; game.tick(t.value);
  eq(game.hearts, 0, 'no further deduction after fail');
  ok(game.retryLevel(), 'retry level');
  eq(game.hearts, 3, 'hearts reset');
  eq(store.getBestStars('L01'), 3, 'prior best progress untouched');
  ok(store.isUnlocked('L02'), 'unlocks preserved');
});

test('GAME', 'pause/resume restores the exact remaining time; no duplicated countdown', function () {
  var t = { value: 2000000 };
  var game = newGame(null, function () { return t.value; });
  game.startLevel('L05'); // 65s
  game.tick(t.value); // anchor
  t.value += 5000; game.tick(t.value);
  eq(game.timer.remainingMs, 60000, '5s consumed');
  ok(game.pause(), 'pause');
  ok(!game.selectLetter('T'), 'input frozen while paused');
  t.value += 600000; game.tick(t.value); // 10 minutes paused
  eq(game.timer.remainingMs, 60000, 'clock frozen while paused');
  ok(game.resume(), 'resume');
  t.value += 1000; game.tick(t.value);
  eq(game.timer.remainingMs, 59000, 'resumes precisely (no jump, no double speed)');

  game.setHidden(true); // tab hidden
  t.value += 300000; game.tick(t.value);
  eq(game.timer.remainingMs, 59000, 'clock frozen while hidden');
  game.setHidden(false);
  t.value += 1000; game.tick(t.value);
  eq(game.timer.remainingMs, 58000, 'visible again: ticks normally');
});

test('GAME', 'timer is frozen during wrong-answer feedback', function () {
  var t = { value: 3000000 };
  var game = newGame(null, function () { return t.value; });
  game.startLevel('L04'); // 70s
  game.tick(t.value);
  swapFill(game); // wrong -> phase 'wrong', clock must stop
  eq(game.phase, 'wrong', 'in feedback');
  t.value += 69000; game.tick(t.value);
  eq(game.hearts, 2, 'heart lost only from the wrong answer');
  eq(game.timer.remainingMs, 70000 - 0, 'timer did not run during feedback');
  game.resolveWrong();
  t.value += 1000; game.tick(t.value);
  eq(game.timer.remainingMs, 69000, 'timer resumes after feedback');
});

test('GAME', 'timer is frozen during success celebration', function () {
  var t = { value: 4000000 };
  var game = newGame(null, function () { return t.value; });
  game.startLevel('L07'); // 55s
  game.tick(t.value);
  solveCurrent(game); // correct -> phase 'correct'
  eq(game.phase, 'correct', 'celebrating');
  t.value += 54000; game.tick(t.value);
  ok(game.timer.remainingMs > 0, 'timer frozen during celebration');
  eq(game.phase, 'correct', 'no timeout while celebrating');
  game.advanceAfterSuccess();
  t.value += 1000; game.tick(t.value);
  eq(game.timer.remainingMs, 54000, 'next question has a full fresh timer');
});

console.log('');
console.log('=== GAMEPLAY: keyboard, public state, replays ===');

test('GAME', 'keyboard: letter keys select first matching tile, Backspace undoes, Escape pauses', function () {
  var game = newGame();
  game.startLevel('L01'); // CAT
  ok(game.handleKey('c'), 'key c');
  ok(game.handleKey('A'), 'key A (case-insensitive)');
  ok(game.handleKey('t'), 'key t');
  eq(game.phase, 'correct', 'keyboard completes the word');

  game.advanceAfterSuccess(); // q2 DOG
  ok(game.handleKey('d'), 'key d');
  ok(game.handleKey('Backspace'), 'backspace undoes d');
  eq(game.slots[0].letter, null, 'slot freed');
  ok(game.handleKey('Escape'), 'escape pauses');
  eq(game.paused, true, 'paused');
  ok(!game.handleKey('o'), 'letters ignored while paused');
  ok(game.handleKey('Escape'), 'escape resumes');
  eq(game.paused, false, 'resumed');
  ok(game.handleKey('Enter') === false, 'Enter has no gameplay effect');
});

test('GAME', 'public state never leaks the answer or animal before success', function () {
  var game = newGame();
  game.startLevel('L10'); // HIPPOPOTAMUS
  game.selectLetter('H');
  var s = game.getPublicState();
  ok(s.revealed === null, 'nothing revealed yet');
  ok(!('answer' in s) && !('animal' in s) && !('fact' in s), 'no answer/animal/fact keys');
  ok(JSON.stringify(s).indexOf('HIPPOPOTAMUS') === -1, 'answer string absent from state');
  ok(JSON.stringify(s).indexOf('Hippopotamus') === -1, 'animal name absent from state');
  ok(s.silhouetteAsset === 'assets/silhouettes/q037.svg', 'neutral asset path');
  eq(s.questionCount, 4, '4 questions');
  eq(s.questionIndex, 0, 'first question');
  eq(s.hearts, 3, '3 hearts');
  ok(s.hint && s.hint.length > 10, 'hint exposed for display');

  ok(game.clearAll(), 'return the probe tile');
  var p = solveCurrent(game);
  eq(game.getPublicState().revealed.animal, 'Hippopotamus', 'animal revealed only after success');
  eq(p.fact, questionById('q037').fact, 'fact delivered with success');
});

test('GAME', 'first playthrough uses stated order; replays shuffle reproducibly', function () {
  var g1 = newGame();
  g1.startLevel('L01');
  deepEq(g1.questionOrder, ['q001', 'q002', 'q003', 'q004'], 'attempt 1: stated order');
  g1.startLevel('L01'); // attempt 2 on same instance
  var order2 = g1.questionOrder.slice();
  deepEq(order2.slice().sort(), ['q001', 'q002', 'q003', 'q004'], 'replay is a permutation');

  var g2 = newGame();
  g2.startLevel('L01'); g2.startLevel('L01');
  deepEq(g2.questionOrder, order2, 'replay shuffle is reproducible (same seed)');
});

test('GAME', 'every question rebuilds an identical bank within one attempt', function () {
  questionsData.questions.forEach(function (q) {
    var game = newGame();
    game.startLevel(q.levelId);
    game._attempt = 5; // force a known attempt number for a stable seed
    game._loadQuestion(game.questionOrder.indexOf(q.id));
    var first = game.tiles.map(function (tl) { return { id: tl.id, letter: tl.letter }; });
    game._loadQuestion(game.questionOrder.indexOf(q.id)); // "retry" same question
    var second = game.tiles.map(function (tl) { return { id: tl.id, letter: tl.letter }; });
    deepEq(first, second, q.id + ' stable bank across reloads within an attempt');
  });
});

console.log('');
console.log('=== STORAGE ===');

test('STORAGE', 'unlocking is forward-only and starts with L01 unlocked', function () {
  var store = new StorageMod.ProgressStore(new StorageMod.MemoryStorage());
  ok(store.isUnlocked('L01'), 'L01 unlocked by default');
  ok(!store.isUnlocked('L02'), 'L02 locked initially');
  ok(store.unlockLevel('L02'), 'unlock L02');
  ok(!store.unlockLevel('L02'), 'second unlock is a no-op');
  ok(store.isUnlocked('L02'), 'stays unlocked');
});

test('STORAGE', 'progress round-trips through persistence', function () {
  var mem = new StorageMod.MemoryStorage();
  var a = new StorageMod.ProgressStore(mem);
  a.recordLevelResult('L01', 3, 540);
  a.unlockLevel('L02');
  a.setSoundOn(false);
  var b = new StorageMod.ProgressStore(mem); // fresh instance, same storage
  eq(b.getBestStars('L01'), 3, 'stars persisted');
  eq(b.getBestScore('L01'), 540, 'score persisted');
  ok(b.isUnlocked('L02'), 'unlock persisted');
  eq(b.getSoundOn(), false, 'sound preference persisted');
  b.reset();
  eq(b.getBestStars('L01'), 0, 'reset clears progress');
  ok(b.isUnlocked('L01'), 'L01 always unlocked after reset');
});

test('STORAGE', 'corrupted saved data falls back to safe defaults', function () {
  var mem = new StorageMod.MemoryStorage();
  mem.setItem(StorageMod.STORAGE_KEY, '{this is not json');
  var store = new StorageMod.ProgressStore(mem);
  eq(store.getBestStars('L01'), 0, 'defaults after corruption');
  ok(store.isUnlocked('L01'), 'L01 unlocked');
  ok(!store.isUnlocked('L05'), 'others locked');
});

console.log('');
console.log('=== ASSETS (informational, next phase) ===');
var missing = 0;
questionsData.questions.forEach(function (q) {
  if (!fs.existsSync(path.join(ROOT, q.silhouetteAsset))) missing += 1;
});
console.log('  silhouette SVGs on disk: ' + (40 - missing) + '/40 (expected 0 at this logic-only stage)');

console.log('');
console.log('=== UI / ASSET INTEGRATION ===');
var AssetMap = require(path.join(ROOT, 'js', 'asset-map.js'));

test('UI', 'all 40 silhouette SVGs exist, are valid XML and distinct (no placeholder reuse)', function () {
  var seen = {};
  questionsData.questions.forEach(function (q) {
    var file = path.join(ROOT, q.silhouetteAsset);
    ok(fs.existsSync(file), q.id + ' missing ' + q.silhouetteAsset);
    var text = fs.readFileSync(file, 'utf8');
    ok(text.indexOf('<svg') !== -1 && text.indexOf('</svg>') !== -1, q.id + ' not a valid SVG document');
    ok(text.indexOf('class="body"') !== -1, q.id + ' has no body group');
    ok(text.toLowerCase().indexOf('aria-label="mystery animal silhouette"') !== -1, q.id + ' neutral aria label');
    ok(!seen[text], q.id + ' duplicates another silhouette file');
    seen[text] = q.id;
  });
});

test('UI', 'silhouette files contain no animal names in markup or paths', function () {
  questionsData.questions.forEach(function (q) {
    var text = fs.readFileSync(path.join(ROOT, q.silhouetteAsset), 'utf8').toLowerCase();
    questionsData.questions.forEach(function (other) {
      ok(text.indexOf(other.answer.toLowerCase()) === -1, q.id + ' leaks answer ' + other.answer);
    });
  });
});

test('UI', 'asset map covers all 40 questions with two distinct reveal colors', function () {
  questionsData.questions.forEach(function (q) {
    var c = AssetMap.colorsFor(q.id);
    ok(/^#[0-9a-f]{6}$/i.test(c.c1) && /^#[0-9a-f]{6}$/i.test(c.c2), q.id + ' colors missing/invalid');
    ok(c.c1 !== c.c2, q.id + ' reveal colors identical');
  });
  deepEq(Object.keys(AssetMap.COLORS).sort(),
    questionsData.questions.map(function (q) { return q.id; }).sort(), 'asset map ids == question ids');
});

test('UI', 'approved art files referenced by the page exist on disk', function () {
  ['assets/art/board.png', 'assets/art/progress.png', 'assets/art/bg-desktop.png', 'assets/art/bg-phone.png', 'assets/art/btn-undo.png', 'assets/art/btn-clear.png', 'assets/art/btn-hint.png', 'assets/art/btn-pause.png', 'assets/art/slot.png'].forEach(function (f) {
    ok(fs.existsSync(path.join(ROOT, f)), f + ' missing');
  });
  ['index.html', 'css/style.css', 'js/main.js', 'js/renderer.js', 'js/controls.js', 'js/asset-map.js'].forEach(function (f) {
    ok(fs.existsSync(path.join(ROOT, f)), f + ' missing');
  });
});

test('UI', 'index.html wires every script relatively and leaks no answers', function () {
  var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  ['js/letters.js', 'js/storage.js', 'js/levels.js', 'js/game.js', 'js/asset-map.js',
   'js/renderer.js', 'js/controls.js', 'js/audio.js', 'js/main.js', 'css/style.css'].forEach(function (src) {
    ok(html.indexOf(src) !== -1, 'index.html does not reference ' + src);
  });
  questionsData.questions.forEach(function (q) {
    ok(html.indexOf(q.answer) === -1, 'index.html leaks answer ' + q.answer);
    ok(html.toLowerCase().indexOf(q.animal.toLowerCase()) === -1, 'index.html leaks animal ' + q.animal);
  });
});

test('UI', 'renderer recolor rules exist for both silhouette and modal reveal', function () {
  var css = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
  ok(css.indexOf('.board-surface.revealed .silhouette .body') !== -1, 'board reveal rule');
  ok(css.indexOf('.reveal-img.revealed .body') !== -1, 'modal reveal rule');
  ['@media (max-width: 360px)', '100dvh', 'env(safe-area-inset-bottom)', 'prefers-reduced-motion'].forEach(function (s) {
    ok(css.indexOf(s) !== -1, 'css missing ' + s);
  });
});

console.log('');
console.log('=== ANIMAL IMAGE INTEGRATION ===');

test('ANIMALS', 'all 40 local animal illustrations exist, are valid SVG and leak no names', function () {
  questionsData.questions.forEach(function (q) {
    var file = path.join(ROOT, 'assets', 'animals', q.id + '.svg');
    ok(fs.existsSync(file), q.id + ' animal illustration missing');
    var t = fs.readFileSync(file, 'utf8');
    ok(t.indexOf('<svg') !== -1 && /viewBox=/.test(t) && t.length > 200, q.id + ' invalid SVG');
    questionsData.questions.forEach(function (other) {
      ok(t.toLowerCase().indexOf(other.answer.toLowerCase()) === -1, q.id + ' leaks answer ' + other.answer);
    });
  });
});

test('ANIMALS', 'manifest covers 40 questions with source+license; resolver maps neutral ids', function () {
  var manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'animals', 'manifest.json'), 'utf8'));
  questionsData.questions.forEach(function (q) {
    var m = manifest[q.id];
    ok(m && m.source && m.license && m.url, q.id + ' manifest entry incomplete');
    ok(AssetMap.animalUrl(q.id) === 'assets/animals/' + q.id + '.svg', q.id + ' resolver path');
  });
});

test('ANIMALS', 'one image in two states: black layer via brightness(0), color crossfade', function () {
  var css = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
  ok(css.indexOf('.animal-black') !== -1 && css.indexOf('brightness(0)') !== -1, 'black layer uses brightness(0)');
  ok(css.indexOf('.animal-mount.revealed .animal-color') !== -1, 'color reveal rule');
  var js = fs.readFileSync(path.join(ROOT, 'js', 'renderer.js'), 'utf8');
  ok(js.indexOf('animalUrl') !== -1, 'renderer uses resolver');
  ok(js.indexOf('revealAnimal') !== -1 && js.indexOf('revealSuccess') !== -1, 'reveal wired to success');
  var engine = fs.readFileSync(path.join(ROOT, 'js', 'game.js'), 'utf8');
  ok(engine.indexOf('questionId: this.question ? this.question.id : null') !== -1, 'public state exposes neutral questionId');
});

console.log('');
console.log('================================================');
console.log('RESULT: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) {
  console.log('Failures:');
  failures.forEach(function (f) { console.log('  - ' + f); });
}
process.exitCode = failed > 0 ? 1 : 0;
