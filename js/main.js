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
  var audio = null;            // Audio.AudioManager (created at boot)
  var newlyUnlockedIds = [];   // levels first unlocked this session (for the unlock chime)
  var unlockTimer = null;

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
      audio = new AM.Audio.AudioManager();
      // Wallet bootstrap: creates the spendable star wallet exactly once per
      // save (brand-new AND legacy profiles get the one-time 100-star welcome
      // credit; refreshes/retries never re-grant because it is persisted).
      if (store.ensureWallet()) {
        renderer.showStarterToast('🎁 100 starter stars added! Hints cost 50 ★ each.');
      }
      // audio snapshot: levels unlocked before this session
      store.getData().levels && Object.keys(store.getData().levels).forEach(function (id) {
        if (store.getData().levels[id].unlocked) newlyUnlockedIds.push(id);
      });
      audio.setSoundOn(store.getSoundOn());
      audio.attach(document);
      wireEngine();
      wireActions();
      controls.bindKeyboard(onKey);
      document.addEventListener('visibilitychange', function () {
        game.setHidden(document.hidden);
      });
      // Re-check the centered-stack fit when the viewport changes; never touches
      // engine state, so input, shuffled tiles and the timer are unaffected.
      // reflowSlots re-derives the balanced answer-slot rows from the new width
      // (rotation/resize); it only rebuilds the DOM when the grouping changes.
      var resizeTimer = null;
      window.addEventListener('resize', function () {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
          renderer.reflowSlots();
          renderer.checkLayoutFit();
        }, 150);
      });
      // Development-only layout assertions: ?debug=layout (no cost in production —
      // the extra script is only fetched when the parameter is present).
      if (/[?&]debug=layout\b/.test(window.location.search)) {
        var dbg = document.createElement('script');
        dbg.src = 'js/debug-layout.js';
        document.head.appendChild(dbg);
      }
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
        // ideal cue point for warning (10s) + final 3-2-1 on timed levels only;
        // the audio module self-guards against repeats, pauses and reset timers.
        audio.onTimerSecond(sec);
      }
    }
    requestAnimationFrame(loop);
  }

  // ---------- engine events -> presentation ----------
  function wireEngine() {
    // sound: subscribe first so effects are scheduled before visuals proceed
    audio.wireEngine(game);
    game.on('level-start', function (info) {
      clearTimeout(unlockTimer);          // cancel a pending unlock chime
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
    });
    game.on('place', function () { renderer.syncGame(game.getPublicState()); });
    game.on('undo', function () { renderer.syncGame(game.getPublicState()); });
    game.on('clear', function () { renderer.syncGame(game.getPublicState()); });
    game.on('hint', function (info) {
      renderer.syncGame(game.getPublicState());
      renderer.starFloat('-' + info.cost + ' ★');
      renderer.showBubble('Revealed ' + info.letter + '!', 'happy');
    });
    game.on('hint-denied', function (info) {
      renderer.syncGame(game.getPublicState());
      renderer.showBubble(info.message + ' — you have ' + info.balance + ' ★', 'sad');
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
      // unlock chime: only when this completion makes a NEW level available
      var next = levels[s.levelIndex + 1];
      if (next && newlyUnlockedIds.indexOf(next.id) === -1) {
        newlyUnlockedIds.push(next.id);
        unlockTimer = setTimeout(function () {
          audio.play('unlock');           // check-in moment just after fanfare
        }, 1500);
      }
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
    // touch+click dedupe guard: some mobile browsers fire pointerup AND click
    // for one tap; the second pass within 300ms for the same target is noise.
    var lastTap = {};
    function guarded(action, data, target) {
      var key = action + '|' + (data.tileId || '') + '|' + (data.slotIndex || '') + '|' + (data.levelId || '');
      var now = performance.now();
      if (lastTap[key] && now - lastTap[key] < 300) return;
      lastTap[key] = now;
      onAction(action, data, target);
    }
    controls.bindActions(guarded);
  }

  function onAction(action, data, target) {
    switch (action) {
      case 'play': audio.click(); goLevels(); break;
      case 'levels': audio.click(); goLevels(); break;
      case 'home': audio.click(); goHome(); break;
      case 'help': audio.click(); renderer.showHelp(); break;
      case 'settings': audio.click(); renderer.showSettings(store.getSoundOn()); break;
      case 'close-modal': audio.click(); renderer.closeModal(); break;
      case 'start-level': startLevel(data.levelId); break;    // level-start swoosh
      case 'locked-level': audio.denied(); lockedNudge(data.levelId, target); break;
      case 'reload': location.reload(); break;
      case 'sound': {
        var on = !store.getSoundOn();
        store.setSoundOn(on);
        audio.setSoundOn(on);   // hard OFF kills tails; ON re-enables master gain
        renderer.setSound(on);
        if (on) audio.play('confirm');
        break;
      }
      // pause/resume/quit/restart play their own engine-event blips
      case 'pause': if (game.phase === 'solving') game.pause(); break;
      case 'resume': game.resume(); break;
      case 'restart': game.resume(); startLevel(currentLevelId); break;
      case 'quit': game.resume(); goLevels(); break;
      case 'retry': startLevel(currentLevelId); break;
      case 'replay': startLevel(currentLevelId); break;
      // tiles/slots/undo/clear/hint/continue are silent here on purpose:
      // the engine only emits events for real state changes.
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
  }

  // Locked card tap: friendly explanation + a gentle shake of THAT card.
  function lockedNudge(levelId, target) {
    var idx = -1;
    for (var i = 0; i < levels.length; i++) if (levels[i].id === levelId) { idx = i; break; }
    renderer.showLevelsToast(idx > 0
      ? 'Complete Level ' + idx + ' first!'
      : 'This level is still locked.');
    var card = target && target.closest ? target.closest('.level-card') : null;
    if (card) {
      card.style.transition = 'transform .09s ease';
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
      if (key === 'Escape') {
        if (game.paused) { game.resume(); return true; }
        if (renderer.getModalKind() === 'menu') { renderer.closeModal(); return true; }
      }
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
