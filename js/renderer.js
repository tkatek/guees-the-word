/*
 * renderer.js — paints the game from AnimalGame.getPublicState() snapshots.
 * Pure DOM: keyed tiles/slots, HUD, progress tokens, modals, reveal animation.
 * NEVER reads engine internals; the answer/animal never exist in the DOM
 * before the engine reports success.
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
  var CHECK_SVG = '<svg viewBox="0 0 40 40" aria-hidden="true">' +
    '<circle cx="20" cy="20" r="18" fill="#57c84d" stroke="#2f7d2a" stroke-width="3"/>' +
    '<path d="M11 21 L17 27 L29 14" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
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
      hud: { level: $('hud-level'), question: $('hud-question'), hearts: $('hud-hearts'), timer: $('hud-timer'), timerText: $('timer-text'), score: $('hud-score') },
      boardWrap: $('board-wrap'), boardSurface: $('board-surface'), silhouette: $('silhouette'),
      sparkles: $('sparkles'), bubble: $('bubble'), slots: $('slots'), bank: $('bank'),
      btnHint: $('btn-hint'), levelGrid: $('level-grid'), progressTokens: $('progress-tokens'),
      overlay: $('modal-overlay'), modal: $('modal'), app: $('app'),
      soundState: $('sound-state')
    };
    this._lastTiles = null;   // last rendered tile id list, to detect bank changes
    this._lastSlots = null;
    this._solved = -1;
    this._wrongTimer = null;
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
    e.hud.level.textContent = 'Lv ' + (state.levelIndex + 1) + ' · ' + state.levelName;
    e.hud.question.textContent = (state.questionIndex + 1) + '/' + state.questionCount;
    e.hud.timer.classList.toggle('hidden', !state.timer);
    this._renderHearts(state.hearts, state.heartsMax);
    this._renderSilhouette(state.silhouetteAsset);
    e.boardSurface.classList.remove('revealed');
    this._renderSlots(state.slots, true);
    this._renderBank(state.tiles, Letters.gridColumns(state.tiles.length), true);
    this._renderActions(state);
    this.hideBubble();
  };

  // The SVG is inlined (not <img>) so page CSS can recolor it for the reveal.
  // Silhouette markup is cached per src and preloaded ahead of time.
  Renderer.prototype._svgCache = function () {
    if (!this._svgs) this._svgs = {};
    return this._svgs;
  };

  Renderer.prototype._fetchSvg = function (src) {
    var cache = this._svgCache();
    if (cache[src]) return Promise.resolve(cache[src]);
    if (!window.fetch) return Promise.resolve(null);
    return fetch(src).then(function (r) { return r.ok ? r.text() : null; }).catch(function () { return null; })
      .then(function (text) { cache[src] = text; return text; });
  };

  Renderer.prototype._renderSilhouette = function (src) {
    var holder = this.el.boardSurface;
    var img = this.el.silhouette;
    var self = this;
    // neutral colors keyed by the q-id inside the path, applied as CSS variables
    var qid = src.split('/').pop().replace('.svg', '');
    var colors = this.assets.colorsFor(qid);
    holder.style.setProperty('--c1', colors.c1);
    holder.style.setProperty('--c2', colors.c2);
    holder.setAttribute('role', 'img');
    holder.setAttribute('aria-label', 'Mystery animal silhouette');
    if (this._silSrc === src && this._silNode) return;
    this._silSrc = src;
    this._fetchSvg(src).then(function (text) {
      if (!text || self._silSrc !== src) return; // stale or missing
      var div = document.createElement('div');
      div.className = 'silhouette';
      div.innerHTML = text;
      var svg = div.querySelector('svg');
      if (svg) {
        svg.removeAttribute('aria-label');
        svg.setAttribute('aria-hidden', 'true');
      }
      if (self._silNode) self._silNode.remove();
      self._silNode = div;
      holder.insertBefore(div, self.el.sparkles);
      img.classList.add('hidden'); // fallback <img> hidden once inline SVG is in
    });
  };

  // Warm the cache for the NEXT question (never displayed until its turn).
  Renderer.prototype.preloadSilhouette = function (src) {
    this._fetchSvg(src);
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
      slots.forEach(function (s, i) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'slot';
        b.setAttribute('data-action', 'slot');
        b.setAttribute('data-slot', String(i));
        b.setAttribute('aria-label', 'Answer slot ' + (i + 1) +
          (s.letter ? ', letter ' + s.letter + ', tap to remove' : ', empty'));
        box.appendChild(b);
      });
      this._lastSlots = slots.length;
    }
    Array.prototype.forEach.call(box.children, function (b, i) {
      var s = slots[i];
      b.textContent = s.letter || '';
      b.classList.toggle('filled', !!s.letter);
      b.classList.toggle('locked', !!s.locked);
      b.disabled = !s.letter || s.locked;
    });
    box.classList.toggle('two-rows', slots.length > 8);
  };

  Renderer.prototype._renderBank = function (tiles, columns, rebuild) {
    var box = this.el.bank;
    var ids = tiles.map(function (t) { return t.id; }).join(',');
    var needRebuild = rebuild || this._lastTiles !== ids;
    if (needRebuild) {
      box.innerHTML = '';
      box.style.gridTemplateColumns = 'repeat(' + columns + ', auto)';
      var self = this;
      tiles.forEach(function (t) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'tile';
        b.textContent = t.letter;
        b.setAttribute('data-action', 'tile');
        b.setAttribute('data-tile', t.id);
        b.setAttribute('aria-label', 'Letter ' + t.letter);
        b.style.animation = 'pop-in .18s ease both';
        b.style.animationDelay = (tiles.indexOf(t) * 28) + 'ms';
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
    this._renderBank(state.tiles, Letters.gridColumns(state.tiles.length));
    this._renderHearts(state.hearts, state.heartsMax);
    this._renderActions(state);
    this.el.hud.score.textContent = state.levelScore;
    if (state.timer) {
      var sec = Math.ceil(state.timer.remainingMs / 1000);
      this.el.hud.timerText.textContent = String(sec);
      this.el.hud.timer.classList.toggle('low', sec <= 10);
    }
    this.el.screens.game.classList.toggle('paused', state.paused);
  };

  Renderer.prototype.renderProgress = function (solvedCount) {
    if (solvedCount === this._solved) return;
    var tokens = this.el.progressTokens;
    if (tokens.children.length !== 4) {
      tokens.innerHTML = '';
      for (var i = 0; i < 4; i++) {
        var d = document.createElement('span');
        d.className = 'token';
        d.innerHTML = CHECK_SVG;
        d.style.visibility = 'hidden';
        tokens.appendChild(d);
      }
    }
    for (var j = 0; j < 4; j++) {
      var t = tokens.children[j];
      var show = j < solvedCount;
      if (show && t.style.visibility === 'hidden') {
        t.style.visibility = 'visible';
        t.classList.remove('pop');
        void t.offsetWidth; // restart animation
        t.classList.add('pop');
      } else if (!show) {
        t.style.visibility = 'hidden';
      }
    }
    this._solved = solvedCount;
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
    this.el.boardWrap.appendChild(d);
    setTimeout(function () { d.remove(); }, 1500);
  };

  Renderer.prototype.revealSuccess = function (payload) {
    this.el.boardSurface.classList.add('revealed');
    var sp = this.el.sparkles;
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
    this.rewardFloat(payload.reward);
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
    var cached = this._svgCache()[this._silSrc];
    var colors = this.assets.colorsFor(this._silSrc.split('/').pop().replace('.svg', ''));
    this.openModal(
      '<h2>' + payload.animal + '!</h2>' +
      '<div class="reveal-img revealed" style="--c1:' + colors.c1 + ';--c2:' + colors.c2 + '">' + (cached || '') + '</div>' +
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

  return { Renderer: Renderer, CHECK_SVG: CHECK_SVG };
});
