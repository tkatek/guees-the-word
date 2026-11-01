/*
 * levels.js — level/question data loading and integrity validation.
 * Run validateGameData() once on game load; refuse to start when errors exist.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AnimalMystery = root.AnimalMystery || {};
    root.AnimalMystery.Levels = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // The exact content contract this game ships with (10 levels x 4 questions, 40 unique answers).
  var SPEC = {
    levelCount: 10,
    questionsPerLevel: 4,
    totalQuestions: 40,
    levels: [
      { id: 'L01', name: 'First Friends',    answers: ['CAT', 'DOG', 'PIG', 'COW'],                 timerSeconds: null, bank: { min: 9,  max: 9,  extra: 0 } },
      { id: 'L02', name: 'Little Creatures', answers: ['DUCK', 'FROG', 'FISH', 'HEN'],              timerSeconds: null, bank: { min: 9,  max: 9,  extra: 0 } },
      { id: 'L03', name: 'Wild and Farm',    answers: ['LION', 'BEAR', 'GOAT', 'DEER'],             timerSeconds: null, bank: { min: 9,  max: 9,  extra: 0 } },
      { id: 'L04', name: 'Animal Shapes',    answers: ['HORSE', 'SHEEP', 'SNAKE', 'MOUSE'],         timerSeconds: 70,   bank: { min: 9,  max: 12, extra: 5 } },
      { id: 'L05', name: 'Around the World', answers: ['TIGER', 'ZEBRA', 'PANDA', 'KOALA'],         timerSeconds: 65,   bank: { min: 9,  max: 12, extra: 5 } },
      { id: 'L06', name: 'Animal Adventures',answers: ['RABBIT', 'MONKEY', 'TURTLE', 'CAMEL'],      timerSeconds: 60,   bank: { min: 9,  max: 12, extra: 5 } },
      { id: 'L07', name: 'Ocean and Sky',    answers: ['PENGUIN', 'GIRAFFE', 'DOLPHIN', 'PARROT'],  timerSeconds: 55,   bank: { min: 11, max: 14, extra: 5 } },
      { id: 'L08', name: 'Amazing Animals',  answers: ['ELEPHANT', 'KANGAROO', 'FLAMINGO', 'OCTOPUS'], timerSeconds: 50, bank: { min: 11, max: 14, extra: 5 } },
      { id: 'L09', name: 'Rare Creatures',   answers: ['RHINOCEROS', 'CHAMELEON', 'PORCUPINE', 'ARMADILLO'], timerSeconds: 50, bank: { min: 14, max: 16, extra: 4 } },
      { id: 'L10', name: 'Animal Experts',   answers: ['HIPPOPOTAMUS', 'WOODPECKER', 'HUMMINGBIRD', 'ORANGUTAN'], timerSeconds: 45, bank: { min: 14, max: 16, extra: 4 } }
    ]
  };

  var SILHOUETTE_PATH_RE = /^assets\/silhouettes\/[a-z0-9]+(?:-[a-z0-9]+)*\.svg$/;
  var ANSWER_RE = /^[A-Z]{3,12}$/;

  function validateGameData(levelsData, questionsData) {
    var errors = [];
    var levels = (levelsData && levelsData.levels) || [];
    var questions = (questionsData && questionsData.questions) || [];

    if (levels.length !== SPEC.levelCount) {
      errors.push('Expected ' + SPEC.levelCount + ' levels, found ' + levels.length);
    }
    if (questions.length !== SPEC.totalQuestions) {
      errors.push('Expected ' + SPEC.totalQuestions + ' questions, found ' + questions.length);
    }

    var questionsById = {};
    var q;
    for (var qi = 0; qi < questions.length; qi++) {
      q = questions[qi];
      if (!q.id || typeof q.id !== 'string') { errors.push('Question #' + qi + ': missing id'); continue; }
      if (questionsById[q.id]) errors.push('Duplicate question id: ' + q.id);
      questionsById[q.id] = q;

      if (!q.levelId || typeof q.levelId !== 'string') errors.push(q.id + ': missing levelId');
      if (!q.animal || typeof q.animal !== 'string') errors.push(q.id + ': missing animal name');
      if (!q.answer || typeof q.answer !== 'string') { errors.push(q.id + ': missing answer'); continue; }
      if (!ANSWER_RE.test(q.answer)) errors.push(q.id + ': answer "' + q.answer + '" must be 3-12 A-Z letters');
      if (!q.silhouetteAsset || !SILHOUETTE_PATH_RE.test(q.silhouetteAsset)) {
        errors.push(q.id + ': silhouetteAsset "' + q.silhouetteAsset + '" must match assets/silhouettes/<name>.svg');
      }
      if (!q.hint || typeof q.hint !== 'string' || q.hint.trim().length < 10) errors.push(q.id + ': hint missing or too short');
      if (!q.fact || typeof q.fact !== 'string' || q.fact.trim().length < 10) errors.push(q.id + ': fact missing or too short');
      // A hint must never spoil the answer (checks the answer and the display name, incl. inside other words).
      var lowerHint = String(q.hint || '').toLowerCase();
      if (lowerHint.indexOf(String(q.answer || '').toLowerCase()) !== -1) errors.push(q.id + ': hint spoils the answer');
      if (q.animal && lowerHint.indexOf(String(q.animal).toLowerCase()) !== -1) errors.push(q.id + ': hint contains the animal name');
    }

    // Unique answers and unique silhouette assets across all questions.
    var answers = {}, assets = {};
    for (var i = 0; i < questions.length; i++) {
      q = questions[i];
      if (answers[q.answer]) errors.push('Duplicate answer ' + q.answer + ' (' + q.id + ' and ' + answers[q.answer] + ')');
      answers[q.answer] = q.id;
      if (q.silhouetteAsset) {
        if (assets[q.silhouetteAsset]) errors.push('Duplicate silhouetteAsset ' + q.silhouetteAsset);
        assets[q.silhouetteAsset] = q.id;
      }
    }

    // Level structure and references.
    var levelIds = {}, referenced = {};
    for (var li = 0; li < levels.length; li++) {
      var lvl = levels[li];
      if (!lvl.id || typeof lvl.id !== 'string') { errors.push('Level #' + li + ': missing id'); continue; }
      if (levelIds[lvl.id]) errors.push('Duplicate level id: ' + lvl.id);
      levelIds[lvl.id] = true;
      if (!lvl.name || typeof lvl.name !== 'string') errors.push(lvl.id + ': missing name');

      var ids = lvl.questionIds || [];
      if (ids.length !== SPEC.questionsPerLevel) {
        errors.push(lvl.id + ': expected exactly ' + SPEC.questionsPerLevel + ' questionIds, found ' + ids.length);
      }
      var seenInLevel = {};
      for (var k = 0; k < ids.length; k++) {
        var qid = ids[k];
        var found = questionsById[qid];
        if (!found) { errors.push(lvl.id + ': references unknown question ' + qid); continue; }
        if (seenInLevel[qid]) errors.push(lvl.id + ': references ' + qid + ' twice');
        seenInLevel[qid] = true;
        if (referenced[qid]) errors.push(qid + ' is referenced by more than one level');
        referenced[qid] = lvl.id;
        if (found.levelId !== lvl.id) errors.push(qid + ': levelId ' + found.levelId + ' does not match referencing level ' + lvl.id);
      }

      if (lvl.timerSeconds !== null && !(typeof lvl.timerSeconds === 'number' && lvl.timerSeconds >= 30 && lvl.timerSeconds <= 120)) {
        errors.push(lvl.id + ': timerSeconds must be null or 30-120 seconds');
      }
      var bank = lvl.bank;
      if (!bank || typeof bank.min !== 'number' || typeof bank.max !== 'number' || typeof bank.extra !== 'number' ||
          bank.min < 9 || bank.min > bank.max || bank.max > 16 || bank.extra < 0) {
        errors.push(lvl.id + ': invalid bank rule');
      }
    }

    // Every question must be referenced by exactly one level.
    for (var r = 0; r < questions.length; r++) {
      if (!referenced[questions[r].id]) errors.push(questions[r].id + ': not referenced by any level');
    }

    return { ok: errors.length === 0, errors: errors, levels: levels, questions: questions };
  }

  // Compare loaded content against the shipped SPEC (exact answers in exact level order).
  function matchesSpec(levelsData, questionsData) {
    var result = validateGameData(levelsData, questionsData);
    if (!result.ok) return { ok: false, reason: 'data invalid', errors: result.errors };

    var questionsById = {};
    result.questions.forEach(function (q) { questionsById[q.id] = q; });

    for (var i = 0; i < result.levels.length && i < SPEC.levels.length; i++) {
      var lvl = result.levels[i];
      var spec = SPEC.levels[i];
      if (lvl.id !== spec.id) return { ok: false, reason: 'level ' + i + ' id mismatch: ' + lvl.id + ' != ' + spec.id };
      var actualAnswers = lvl.questionIds.map(function (qid) { return questionsById[qid].answer; });
      for (var a = 0; a < spec.answers.length; a++) {
        if (actualAnswers[a] !== spec.answers[a]) {
          return { ok: false, reason: lvl.id + ' answer #' + (a + 1) + ' is ' + actualAnswers[a] + ', expected ' + spec.answers[a] };
        }
      }
      if ((lvl.timerSeconds || null) !== (spec.timerSeconds || null)) {
        return { ok: false, reason: lvl.id + ' timer ' + lvl.timerSeconds + ' != ' + spec.timerSeconds };
      }
    }
    return { ok: true, reason: '' };
  }

  // Browser loader: relative paths only, so the game works on localhost, GitHub Pages
  // and nested directories alike. Pass a fetch-like function (defaults to window.fetch).
  function fetchGameData(fetchLike, baseUrl) {
    var f = fetchLike || (typeof fetch === 'function' ? fetch : null);
    if (!f) return Promise.reject(new Error('No fetch implementation available'));
    var base = baseUrl || '';
    var levelsUrl = base + 'data/levels.json';
    var questionsUrl = base + 'data/questions.json';
    return Promise.all([
      f(levelsUrl).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + levelsUrl); return r.json(); }),
      f(questionsUrl).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + questionsUrl); return r.json(); })
    ]).then(function (pair) {
      var validation = validateGameData(pair[0], pair[1]);
      if (!validation.ok) throw new Error('Invalid game data:\n- ' + validation.errors.join('\n- '));
      return { levelsData: pair[0], questionsData: pair[1], validation: validation };
    });
  }

  return {
    SPEC: SPEC,
    validateGameData: validateGameData,
    matchesSpec: matchesSpec,
    fetchGameData: fetchGameData
  };
});
