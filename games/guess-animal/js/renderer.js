/*
 * renderer.js — paints the game from AnimalGame.getPublicState() snapshots.
 * Pure DOM: keyed tiles/slots, arcade HUD badges, sprite answer slots,
 * glossy letter tiles, numbered progress markers, modals.
 * The animal illustration mount (#animal-mount) stays EMPTY until real
 * animal artwork is integrated — no drawn/fallback creatures, no image
 * requests that could 404. NEVER reads engine internals; the answer/animal
 * never exist in the DOM before the engine reports success.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AnimalMystery = root.AnimalMystery || {};
    root.AnimalMystery.Renderer = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var Letters = (typeof AnimalMystery !== 'undefined' && AnimalMystery.Letters) || null;
  var HEART = '♥';
  var STAR_LIT = '★';
  var STAR_OFF = '☆';

  function $(id) { return document.getElementById(id); }

  function Renderer(assets) {
    this.assets = assets;
    this.el = {
      screens: {
        loading: $('screen-loading'), error: $('screen-error'),
        home: $('screen-home'), levels: $('screen-levels'), game: $('screen-game')
      },
      hud: {
        level: $('hud-level'), question: $('hud-question'), hearts: $('hud-hearts'),
        timer: $('hud-timer'), timerText: $('timer-text'), score: $('hud-score'),
        practice: $('hud-practice')
      },
      boardFrame: $('board-frame'), animalMount: $('animal-mount'),
      bubble: $('bubble'), slots: $('slots'), bank: $('bank'),
      btnHint: $('btn-hint'), levelGrid: $('level-grid'),
      progressTitle: $('progress-title'), progressMarkers: $('progress-markers'),
      overlay: $('modal-overlay'), modal: $('modal'), app: $('app'),
      boardZone: $('board-zone'),
      soundState: $('sound-state')
    };
    this._lastTiles = null;
    this._lastSlots = null;
    this._step = -1;
    this._bubbleTimer = null;
  }

  Renderer.prototype.showScreen = function (name) {
    var s = this.el.screens;
    Object.keys(s).forEach(function (k) { s[k].classList.toggle('hidden', k !== name); });
  };

  Renderer.prototype.showError = function (message) {
    $('error-msg').textContent = message;
    this.showScreen('error');
  };

  Renderer.prototype.setSound = function (on) {
    if (this.el.soundState) this.el.soundState.textContent = on ? 'On' : 'Off';
  };

  /* ---------------- level select ---------------- */

  Renderer.prototype.renderLevels = function (levels, store, currentLevelId) {
    var grid = this.el.levelGrid;
    grid.innerHTML = '';
    levels.forEach(function (lvl, i) {
      var unlocked = store.isUnlocked(lvl.id);
      var stars = store.getBestStars(lvl.id);
      var best = store.getBestScore(lvl.id);
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'level-card' + (unlocked ? '' : ' locked') + (lvl.id === currentLevelId ? ' current' : '');
      card.setAttribute('role', 'listitem');
      card.setAttribute('data-action', unlocked ? 'start-level' : 'locked-level');
      card.setAttribute('data-level', lvl.id);
      card.setAttribute('aria-label', unlocked
        ? 'Level ' + (i + 1) + ' ' + lvl.name + ', ' + stars + ' of 3 stars' + (best ? ', best ' + best : '')
        : 'Level ' + (i + 1) + ' locked');
      var starsHtml = '';
      for (var s = 1; s <= 3; s++) {
        starsHtml += s <= stars ? STAR_LIT : '<span class="off">' + STAR_OFF + '</span>';
      }
      card.innerHTML =
        '<div class="lv-num">Level ' + (i + 1) + '</div>' +
        (unlocked ? '' : '<span class="lv-lock">🔒</span>') +
        '<div class="lv-name">' + lvl.name + '</div>' +
        (unlocked ? '<div class="lv-stars">' + starsHtml + '</div>' : '<div class="lv-stars">&nbsp;</div>');
      grid.appendChild(card);
    });
  };

  /* ---------------- gameplay ---------------- */

  Renderer.prototype.renderQuestion = function (state) {
    var e = this.el;
    e.hud.level.textContent = 'LEVEL ' + (state.levelIndex + 1);
    e.hud.question.textContent = 'Q ' + (state.questionIndex + 1) + '/' + state.questionCount;
    e.hud.timer.classList.toggle('hidden', !state.timer);
    e.hud.practice.classList.toggle('hidden', !!state.timer);
    this._renderHearts(state.hearts, state.heartsMax);
    this._renderAnimalMount(state);
    this._renderSlots(state.slots, true);
    this._renderBank(state.tiles, true);
    this._renderActions(state);
    this.hideBubble();
  };

  // Neutral, id-driven animal stage: two perfectly aligned copies of the SAME
  // local illustration — a brightness(0) black layer on top of the full-color
  // layer. Success crossfades them (CSS), so silhouette and color shapes match
  // by construction. Files stay neutral (qNNN.svg); nothing about the animal
  // leaks through markup. Missing files leave the board empty, never broken.
  Renderer.prototype._renderAnimalMount = function (state) {
    var mount = this.el.animalMount;
    var qid = state.questionId ||
      (state.silhouetteAsset || '').split('/').pop().replace('.svg', '');
    if (!qid) return;
    mount.setAttribute('aria-label', 'Mystery animal ' + (state.questionIndex + 1) + ' of ' + state.questionCount);

    if (!this._animalStage) {
      var color = document.createElement('img');
      color.className = 'animal-color';
      color.alt = '';
      color.draggable = false;
      var black = document.createElement('img');
      black.className = 'animal-black';
      black.alt = '';
      black.draggable = false;
      mount.appendChild(color);
      mount.appendChild(black);
      this._animalStage = { color: color, black: black };
      var self = this;
      [color, black].forEach(function (img) {
        img.addEventListener('error', function () {
          img.classList.add('failed');
          mount.dataset.failed = 'true';
        });
        img.addEventListener('load', function () {
          img.classList.remove('failed');
          delete mount.dataset.failed;
        });
      });
    }

    // Only touch the DOM when the question actually changes.
    if (this._animalQid !== qid) {
      this._animalQid = qid;
      mount.dataset.qid = qid;
      var url = this.assets.animalUrl(qid);
      if (this._animalStage.color.getAttribute('src') !== url) {
        this._animalStage.color.src = url;
        this._animalStage.black.src = url;
      }
      mount.classList.remove('revealed'); // every new question starts black
    } else {
      mount.classList.remove('revealed');
    }
  };

  // Warm the next animal's file so advancing questions never flashes empty.
  Renderer.prototype.preloadSilhouette = function (questionAssetPath) {
    var qid = (questionAssetPath || '').split('/').pop().replace('.svg', '');
    if (!qid || !this.assets.animalUrl) return;
    var img = new Image();
    img.src = this.assets.animalUrl(qid);
  };

  // Called only from the engine's 'correct' event: black -> color crossfade.
  Renderer.prototype.revealAnimal = function () {
    this.el.animalMount.classList.add('revealed');
  };

  Renderer.prototype._renderHearts = function (hearts, max) {
    var html = '';
    for (var i = 0; i < max; i++) {
      html += i < hearts ? HEART : '<span class="off">' + HEART + '</span>';
    }
    this.el.hud.hearts.innerHTML = html;
  };

  Renderer.prototype._renderSlots = function (slots, rebuild) {
    var box = this.el.slots;
    var needRebuild = rebuild || this._lastSlots === null || box.children.length !== slots.length;
    if (needRebuild) {
      box.innerHTML = '';
      var cols = slots.length <= 8 ? slots.length : Math.ceil(slots.length / 2);
      box.style.setProperty('--slot-cols', String(cols));
      slots.forEach(function (s, i) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'slot';
        b.setAttribute('data-action', 'slot');
        b.setAttribute('data-slot', String(i));
        b.setAttribute('aria-label', 'Answer slot ' + (i + 1) +
          (s.letter ? ', letter ' + s.letter + ', tap to remove' : ', empty'));
        b.innerHTML = '<span class="art" aria-hidden="true"></span><span class="glyph" aria-hidden="true"></span>';
        box.appendChild(b);
      });
      this._lastSlots = slots.length;
    }
    Array.prototype.forEach.call(box.children, function (b, i) {
      var s = slots[i];
      var glyph = b.querySelector('.glyph');
      var had = glyph.textContent;
      glyph.textContent = s.letter || '';
      if (s.letter && s.letter !== had) {
        glyph.classList.remove('pop');
        void glyph.offsetWidth;
        glyph.classList.add('pop');
      }
      b.classList.toggle('locked', !!s.locked);
      b.disabled = !s.letter || s.locked;
      b.setAttribute('aria-label', 'Answer slot ' + (i + 1) +
        (s.letter ? (s.locked ? ', letter ' + s.letter + ' revealed by hint' : ', letter ' + s.letter + ', tap to remove') : ', empty'));
    });
  };

  Renderer.prototype._renderBank = function (tiles, rebuild) {
    var box = this.el.bank;
    var ids = tiles.map(function (t) { return t.id; }).join(',');
    if (rebuild || this._lastTiles !== ids) {
      box.innerHTML = '';
      var count = tiles.length;
      // desktop: one centered row up to 9 tiles, two balanced rows above that
      var colsWide = count <= 9 ? count : Math.ceil(count / 2);
      // phone (reference layout): 5 columns — 9-tile banks render 5+4
      var colsNarrow = count <= 10 ? 5 : 4;
      box.style.setProperty('--cols-wide', String(colsWide));
      box.style.setProperty('--cols-narrow', String(colsNarrow));
      tiles.forEach(function (t, i) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'tile';
        b.textContent = t.letter;
        b.setAttribute('data-action', 'tile');
        b.setAttribute('data-tile', t.id);
        b.setAttribute('aria-label', 'Letter ' + t.letter);
        b.style.animationDelay = (i * 26) + 'ms';
        box.appendChild(b);
      });
      this._lastTiles = ids;
    }
    Array.prototype.forEach.call(box.children, function (b) {
      var tile = null;
      for (var i = 0; i < tiles.length; i++) if (tiles[i].id === b.getAttribute('data-tile')) { tile = tiles[i]; break; }
      if (tile) b.classList.toggle('used', tile.used);
    });
  };

  Renderer.prototype._renderActions = function (state) {
    this.el.btnHint.disabled = !state.hintAvailable;
    this.el.btnHint.setAttribute('aria-label',
      state.hintAvailable ? 'Hint: reveal one letter, costs 25 points' : 'Hint already used');
  };

  // Full snapshot sync (safe to call after every engine event).
  Renderer.prototype.syncGame = function (state) {
    this._renderSlots(state.slots);
    this._renderBank(state.tiles);
    this._renderHearts(state.hearts, state.heartsMax);
    this._renderActions(state);
    this.el.hud.score.querySelector('b').textContent = state.levelScore;
    if (state.timer) {
      this.el.hud.timerText.textContent = String(Math.ceil(state.timer.remainingMs / 1000));
      this.el.hud.timer.classList.toggle('low', state.timer.remainingMs <= 10500);
    }
  };

  // step = solved count (0..4); markers show done / current / upcoming states.
  Renderer.prototype.renderProgress = function (solvedCount) {
    if (solvedCount === this._step) return;
    var box = this.el.progressMarkers;
    if (box.children.length !== 4) {
      box.innerHTML = '';
      for (var i = 0; i < 4; i++) {
        var m = document.createElement('span');
        m.className = 'marker';
        m.textContent = String(i + 1);
        m.setAttribute('aria-label', 'Question ' + (i + 1));
        box.appendChild(m);
      }
    }
    for (var j = 0; j < 4; j++) {
      var el = box.children[j];
      var isDone = j < solvedCount;
      var isCurrent = j === solvedCount;
      var was = el.className;
      el.className = 'marker' + (isDone ? ' done' : isCurrent ? ' current' : '');
      if (isDone && was.indexOf('done') === -1) {
        el.classList.remove('pop');
        void el.offsetWidth;
        el.classList.add('pop');
      }
      el.setAttribute('aria-label', 'Question ' + (j + 1) + (isDone ? ', solved' : isCurrent ? ', current' : ', upcoming'));
    }
    this._step = solvedCount;
  };

  /* ---------------- feedback ---------------- */

  Renderer.prototype.showBubble = function (text, mood, sticky) {
    var b = this.el.bubble;
    b.textContent = text;
    b.className = 'bubble ' + (mood || '');
    b.classList.remove('hidden');
    if (this._bubbleTimer) { clearTimeout(this._bubbleTimer); this._bubbleTimer = null; }
    if (!sticky) {
      this._bubbleTimer = setTimeout(function () { b.classList.add('hidden'); }, 2200);
    }
  };

  Renderer.prototype.hideBubble = function () {
    if (this._bubbleTimer) { clearTimeout(this._bubbleTimer); this._bubbleTimer = null; }
    this.el.bubble.classList.add('hidden');
  };

  Renderer.prototype.shakeSlots = function () {
    var s = this.el.slots;
    s.classList.remove('shake');
    void s.offsetWidth;
    s.classList.add('shake');
  };

  Renderer.prototype.rewardFloat = function (points) {
    var d = document.createElement('div');
    d.className = 'reward-float';
    d.textContent = '+' + points;
    this.el.boardZone.appendChild(d);
    setTimeout(function () { d.remove(); }, 1400);
  };

  Renderer.prototype.revealSuccess = function (payload) {
    this.revealAnimal(); // black silhouette -> full color, ~550ms crossfade
    this.rewardFloat(payload.reward);
    var zone = this.el.boardFrame;
    var sp = zone.querySelector('.sparkles');
    if (!sp) {
      sp = document.createElement('div');
      sp.className = 'sparkles';
      zone.appendChild(sp);
    }
    sp.classList.remove('go');
    sp.innerHTML = '';
    for (var i = 0; i < 10; i++) {
      var s = document.createElement('span');
      s.style.left = (10 + Math.random() * 80) + '%';
      s.style.top = (10 + Math.random() * 70) + '%';
      s.style.animationDelay = (Math.random() * 350) + 'ms';
      sp.appendChild(s);
    }
    void sp.offsetWidth;
    sp.classList.add('go');
  };

  /* ---------------- modals ---------------- */

  Renderer.prototype.openModal = function (html) {
    this.el.modal.innerHTML = html;
    this.el.overlay.classList.remove('hidden');
    var first = this.el.modal.querySelector('button');
    if (first) first.focus();
  };

  Renderer.prototype.closeModal = function () {
    this.el.overlay.classList.add('hidden');
    this.el.modal.innerHTML = '';
  };

  Renderer.prototype.isModalOpen = function () {
    return !this.el.overlay.classList.contains('hidden');
  };

  Renderer.prototype.showPause = function () {
    this.openModal(
      '<h2>Paused</h2><p class="m-sub">Take a little breather!</p>' +
      '<div class="m-buttons">' +
      '<button class="btn btn-green big" data-action="resume">▶ Resume</button>' +
      '<button class="btn btn-blue" data-action="restart">↻ Restart level</button>' +
      '<button class="btn btn-red" data-action="quit">✖ Level map</button>' +
      '</div>'
    );
  };

  Renderer.prototype.showCorrect = function (payload, onContinueLabel) {
    // The animal name is safe here: the engine emits 'correct' only after success.
    this.openModal(
      '<h2>' + payload.animal + '!</h2>' +
      '<div class="score-line">+' + payload.reward + ' points</div>' +
      '<div class="fact">💡 ' + payload.fact + '</div>' +
      '<div class="m-buttons">' +
      '<button class="btn btn-green big" data-action="continue">▶ ' + (onContinueLabel || 'Continue') + '</button>' +
      '</div>'
    );
  };

  Renderer.prototype.showResults = function (payload, levelName, isLast) {
    var stars = '';
    for (var i = 1; i <= 3; i++) {
      stars += i <= payload.stars ? '<span class="lit" style="animation-delay:' + ((i - 1) * 180) + 'ms">' + STAR_LIT + '</span>'
                                  : STAR_OFF;
    }
    this.openModal(
      '<h2>Level Complete!</h2>' +
      '<p class="m-sub">' + levelName + '</p>' +
      '<div class="stars-row">' + stars + '</div>' +
      '<div class="score-line">Score: ' + payload.score + '</div>' +
      '<div class="best-line">Best: ' + (payload.best ? payload.best.bestScore : payload.score) + ' points · ' +
        (payload.best ? payload.best.bestStars : payload.stars) + '★</div>' +
      '<div class="m-buttons">' +
      (isLast
        ? '<button class="btn btn-green big" data-action="levels">🏆 Finish</button>'
        : '<button class="btn btn-green big" data-action="next-level">▶ Next level</button>') +
      '<button class="btn btn-blue" data-action="replay">↻ Replay</button>' +
      '<button class="btn btn-yellow" data-action="levels">🗺 Map</button>' +
      '</div>'
    );
  };

  Renderer.prototype.showGameOver = function (levelName) {
    this.openModal(
      '<h2>Out of Hearts!</h2>' +
      '<p class="m-sub">' + levelName + '</p>' +
      '<div class="fact">Every expert guesses wrong sometimes — give it another try!</div>' +
      '<div class="m-buttons">' +
      '<button class="btn btn-green big" data-action="retry">↻ Retry level</button>' +
      '<button class="btn btn-blue" data-action="levels">🗺 Level map</button>' +
      '</div>'
    );
  };

  return { Renderer: Renderer };
});
