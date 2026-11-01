/*
 * main.js — bootstrap: loads + validates data with the existing loader,
 * instantiates the engine, wires renderer/controls, drives the rAF tick loop,
 * and routes all screens. All game rules live in game.js; this file only
 * orchestrates.
 */
(function () {
  'use strict';

  var AM = window.AnimalMystery;
  var store = new AM.Storage.ProgressStore();
  var renderer = new AM.Renderer.Renderer(AM.Assets);
  var controls = new AM.Controls.Controls(document);

  var game = null;          // AnimalGame instance
  var levels = [];          // validated level array
  var questionById = {};    // qid -> question (for preloading only)
  var currentLevelId = null;
  var lastWrongTimer = null;
  var running = true;

  // ---------- boot ----------
  AM.Levels.fetchGameData(window.fetch.bind(window))
    .then(function (loaded) {
      levels = loaded.validation.levels;
      loaded.validation.questions.forEach(function (q) { questionById[q.id] = q; });
      game = new AM.Game.AnimalGame({
        levels: loaded.levelsData,
        questions: loaded.questionsData,
        store: store,
        now: function () { return performance.now(); }
      });
      wireEngine();
      wireActions();
      controls.bindKeyboard(onKey);
      document.addEventListener('visibilitychange', function () {
        game.setHidden(document.hidden);
      });
      renderer.setSound(store.getSoundOn());
      goHome();
      requestAnimationFrame(loop);
    })
    .catch(function (err) {
      console.error('[animal-mystery] failed to load game data:', err);
      renderer.showError(
        'Could not load the game data. If you opened index.html directly (file://), ' +
        'please serve the folder over HTTP (see README.md).'
      );
    });

  // ---------- frame loop: the ONLY clock driver ----------
  var lastFrame = 0;
  function loop(t) {
    if (!running) return;
    if (game && t - lastFrame >= 100) {          // 10 fps is plenty for a countdown
      lastFrame = t;
      game.tick(t);
      var s = game.getPublicState();
      if (s.timer) {
        var sec = Math.ceil(s.timer.remainingMs / 1000);
        var txt = document.getElementById('timer-text');
        txt.textContent = String(sec);
        document.getElementById('hud-timer').classList.toggle('low', sec <= 10);
      }
    }
    requestAnimationFrame(loop);
  }

  // ---------- engine events -> presentation ----------
  function wireEngine() {
    game.on('level-start', function (info) {
      // warm the SVG cache for all 4 animals of this level (tiny files, no leak: they stay black)
      var lvl = levels.filter(function (l) { return l.id === info.levelId; })[0];
      if (lvl) lvl.questionIds.forEach(function (qid) {
        if (questionById[qid]) renderer.preloadSilhouette(questionById[qid].silhouetteAsset);
      });
    });
    game.on('question', function (state) {
      clearTimeout(lastWrongTimer);
      renderer.closeModal();
      renderer.renderQuestion(state);
      renderer.syncGame(state);
      renderer.renderProgress(state.questionIndex); // solved = index (previous ones done)
      document.getElementById('game-scroll').scrollTop = 0;
    });
    game.on('place', function () { renderer.syncGame(game.getPublicState()); });
    game.on('undo', function () { renderer.syncGame(game.getPublicState()); });
    game.on('clear', function () { renderer.syncGame(game.getPublicState()); });
    game.on('hint', function (info) {
      renderer.syncGame(game.getPublicState());
      renderer.showBubble('Revealed ' + info.letter + '!', 'happy');
    });
    game.on('correct', function (payload) {
      renderer.syncGame(game.getPublicState());
      renderer.revealSuccess(payload);
      var s = game.getPublicState();
      var last = s.questionIndex + 1 >= s.questionCount;
      setTimeout(function () {
        renderer.showCorrect(payload, last ? 'See results' : 'Next animal');
      }, 650);
    });
    game.on('wrong', function (payload) {
      renderer.syncGame(game.getPublicState());
      renderer.shakeSlots();
      renderer.showBubble('Try again!', 'sad');
      lastWrongTimer = setTimeout(function () {
        game.resolveWrong();
        renderer.syncGame(game.getPublicState());
      }, 900);
    });
    game.on('timeout', function (payload) {
      renderer.syncGame(game.getPublicState());
      renderer.showBubble('Time is up! Same animal, fresh timer.', 'sad', false);
    });
    game.on('question-restarted', function (state) {
      renderer.renderQuestion(state);
      renderer.syncGame(state);
    });
    game.on('resume-solving', function (state) {
      renderer.syncGame(state);
    });
    game.on('level-complete', function (payload) {
      var s = game.getPublicState();
      var lvl = levels[s.levelIndex];
      renderer.renderProgress(4);
      setTimeout(function () {
        renderer.showResults(payload, lvl ? lvl.name : '', s.levelIndex + 1 >= levels.length);
      }, 500);
    });
    game.on('level-failed', function () {
      var s = game.getPublicState();
      var lvl = levels[s.levelIndex];
      setTimeout(function () {
        renderer.showGameOver(lvl ? lvl.name : '');
      }, 450);
    });
    game.on('pause', function () { renderer.showPause(); });
    game.on('resume', function () { renderer.closeModal(); });
  }

  // ---------- screens ----------
  function goHome() {
    currentLevelId = null;
    renderer.showScreen('home');
  }
  function goLevels() {
    renderer.closeModal();
    renderer.renderLevels(levels, store, nextUncompletedLevelId());
    renderer.showScreen('levels');
  }
  function startLevel(levelId) {
    currentLevelId = levelId;
    renderer.showScreen('game');
    game.startLevel(levelId);
  }
  function nextUncompletedLevelId() {
    for (var i = 0; i < levels.length; i++) {
      if (store.isUnlocked(levels[i].id) && store.getBestStars(levels[i].id) === 0) return levels[i].id;
    }
    return null;
  }

  // ---------- actions (buttons / tiles / slots) ----------
  function wireActions() {
    controls.bindActions(function (action, data) {
      switch (action) {
        case 'play': goLevels(); break;
        case 'levels': goLevels(); break;
        case 'home': goHome(); break;
        case 'start-level': startLevel(data.levelId); break;
        case 'locked-level': buzzLocked(); break;
        case 'reload': location.reload(); break;
        case 'sound': {
          var on = !store.getSoundOn();
          store.setSoundOn(on);
          renderer.setSound(on);
          break;
        }
        case 'pause': if (game.phase === 'solving') game.pause(); break;
        case 'resume': game.resume(); break;
        case 'restart': game.resume(); startLevel(currentLevelId); break;
        case 'quit': game.resume(); goLevels(); break;
        case 'retry': startLevel(currentLevelId); break;
        case 'replay': startLevel(currentLevelId); break;
        case 'next-level': {
          var idx = game.getPublicState().levelIndex + 1;
          if (idx < levels.length) startLevel(levels[idx].id);
          else goLevels();
          break;
        }
        case 'continue': game.advanceAfterSuccess(); break;
        case 'tile':
          if (game.phase === 'solving') game.selectTile(data.tileId);
          break;
        case 'slot':
          if (game.phase === 'solving') game.undoSlot(parseInt(data.slotIndex, 10));
          break;
        case 'undo': game.undoRecent(); break;
        case 'clear': game.clearAll(); break;
        case 'hint': game.useHint(); break;
      }
    });
  }

  function buzzLocked() {
    // friendly shake on a locked level card
    var card = document.querySelector('.level-card.locked');
    if (card) {
      card.style.transition = 'transform .1s ease';
      var n = 0;
      var iv = setInterval(function () {
        card.style.transform = 'translateX(' + (n % 2 ? 4 : -4) + 'px)';
        if (++n > 5) { clearInterval(iv); card.style.transform = ''; }
      }, 60);
    }
  }

  // ---------- keyboard ----------
  function onKey(key, ev) {
    if (renderer.isModalOpen()) {
      if (key === 'Escape' && game.paused) { game.resume(); return true; }
      if (key === 'Enter') {
        var btn = document.querySelector('#modal .btn-green');
        if (btn) { btn.click(); return true; }
      }
      return false;
    }
    if (game.phase !== 'solving') {
      if (key === 'Escape' && game.paused) { game.resume(); return true; }
      return false;
    }
    return game.handleKey(key);
  }
})();
