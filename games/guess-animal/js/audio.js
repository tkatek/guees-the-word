/*
 * audio.js — original procedural sound-effect engine for
 * "Guess the Word: Animal Mystery".
 *
 * Design rules (hard requirements):
 *  - NO background music, NO looping soundtrack, NO ambience, NO narration.
 *    Every sound here is a short one-shot, fully scheduled with an explicit
 *    envelope and a scheduled stop time, then dropped (GC-friendly).
 *  - ONE shared AudioContext, created lazily on the first real user gesture
 *    (browser autoplay policy), reused for every sound forever.
 *  - Master bus: masterGain -> DynamicsCompressor -> destination, so stacked
 *    transient sounds are soft-limited and cannot clip.
 *  - Per-sound re-trigger gates + a global voice cap prevent duplicate and
 *    overlapping spam; routine taps are mixed quiet, success louder.
 *  - Muting (sound OFF) is absolute: master gain drops to zero instantly
 *    (silencing tails too) and every play() call short-circuits first —
 *    including victory fanfares and countdown cues.
 *  - Audio never touches game logic or scoring: main.js subscribes engine
 *    events to this module. This module can only play sounds.
 *  - If Web Audio is unavailable (very old webviews) everything silently
 *    no-ops; the game never blocks on audio.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AnimalMystery = root.AnimalMystery || {};
    root.AnimalMystery.Audio = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MASTER_VOLUME = 0.85;   // comfortable default; compressor guards the peaks
  var MAX_VOICES = 14;        // global simultaneous-sound cap (anti-clipping)
  var SILENT = 0.0001;        // "zero" for exponential ramps

  // Minimum seconds between two plays of the same sound (retrigger gates).
  var GATES = {
    pop: 0.02, undo: 0.03, clear: 0.05, hint: 0.05, correct: 0.15,
    wrong: 0.12, timeout: 0.2, gameover: 0.3, fanfare: 0.4, unlock: 0.4,
    click: 0.05, confirm: 0.1, next: 0.12, swoosh: 0.15, pause: 0.1,
    resume: 0.1, countdown: 0.06, warning: 0.3, denied: 0.12
  };
  var DEFAULT_GATE = 0.04;

  // Small pitch ladder for consecutive letter placements: each slot plays a
  // step higher (up to a major ninth) — controlled and musical, not random.
  var PENT = [0, 2, 4, 7, 9, 12, 14, 16, 19];
  var POP_BASE = 480;

  function hertz(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

  /* Pure helper (unit-tested): which timer cue belongs to a countdown second.
   * prior is { warned:boolean, lastTick:number }. Returns
   * 'timer-warning' | 'countdown-3|2|1' | null. Never fire twice per second. */
  function timerCue(sec, prior) {
    if (typeof sec !== 'number' || !isFinite(sec) || sec < 0) return null;
    if (sec <= 10 && !prior.warned) return 'timer-warning';
    if (sec >= 1 && sec <= 3 && prior.lastTick !== sec) return 'countdown-' + sec;
    return null;
  }

  /* ------------------------------------------------------------------ */
  function AudioManager(opts) {
    opts = opts || {};
    this._now = (typeof opts.now === 'function')
      ? opts.now
      : function () { return Date.now() / 1000; };
    this._onPlay = (typeof opts.onPlay === 'function') ? opts.onPlay : null;

    this.enabled = false;        // set from storage by main.js at boot
    this._ctx = null;            // THE shared AudioContext
    this._master = null;         // master gain node
    this._noiseBuf = null;       // cached noise buffer (recycled)
    this._voices = [];           // [{src, stopAt}] for stopAll() + sweeping
    this._last = {};             // retrigger-gate timestamps per sound name

    this._cue = { warned: false, lastTick: -1 };  // timer warning / countdown
    this._timed = false;         // current question has a timer (engine state)
    this._paused = false;        // suppress cues while paused
    this._unlocked = false;      // context created/resumed via user gesture
  }

  /* ---------------- lifecycle / unlocking ---------------- */

  // Call from main.js once: unlocks audio on the first real user interaction
  // (pointerdown/touchend/keydown), and suspends/resumes with tab visibility.
  AudioManager.prototype.attach = function (docRef) {
    var self = this;
    var doc = docRef || (typeof document !== 'undefined' ? document : null);
    if (!doc || doc.__amAudioAttached) return this;
    doc.__amAudioAttached = true;

    var unlock = function () { self.unlock(); };
    doc.addEventListener('pointerdown', unlock, true);
    doc.addEventListener('touchend', unlock, { passive: true, capture: true });
    doc.addEventListener('keydown', unlock, true);

    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) self.suspend();
        else if (self.enabled) self.resume();
      }, false);
      // iOS: swipe-away / app switch interrupts the context
      if (typeof window !== 'undefined') {
        if (window.addEventListener) {
          window.addEventListener('pagehide', function () { self.suspend(); }, false);
          window.addEventListener('pageshow', function () {
            if (self.enabled) self.resume();
          }, false);
        }
      }
    }
    return this;
  };

  // Create the shared context (once) and/or resume a suspended one. Called on
  // user gestures; browsers require this before any sound is audible.
  AudioManager.prototype.unlock = function () {
    if (this._unlocked && this._ctx && this._ctx.state === 'running') return true;
    try {
      if (!this._ctx) {
        var AC = typeof window !== 'undefined'
          ? (window.AudioContext || window.webkitAudioContext) : null;
        if (!AC) return false;
        this._ctx = new AC();
        var comp = null;
        try {
          comp = this._ctx.createDynamicsCompressor();
          comp.threshold.value = -14;   // gentle limiting, keeps transients soft
          comp.knee.value = 24;
          comp.ratio.value = 5;
          comp.attack.value = 0.004;
          comp.release.value = 0.18;
          comp.connect(this._ctx.destination);
        } catch (e) { comp = null; }
        this._master = this._ctx.createGain();
        this._master.gain.value = this.enabled ? MASTER_VOLUME : 0;
        this._master.connect(comp || this._ctx.destination);
        this._unlocked = true;
      }
      if (this._ctx.state === 'suspended') {
        var p = this._ctx.resume();
        if (p && typeof p.then === 'function') p.catch(function () { /* ignore */ });
      }
      return this._ctx.state !== 'closed';
    } catch (e) {
      this._ctx = null;
      return false;   // no audio available: keep playing silently
    }
  };

  AudioManager.prototype.resume = function () {
    try {
      if (this._ctx && this._ctx.state === 'suspended') {
        var p = this._ctx.resume();
        if (p && typeof p.then === 'function') p.catch(function () { /* ignore */ });
      }
    } catch (e) { /* ignore */ }
  };

  AudioManager.prototype.suspend = function () {
    try {
      if (this._ctx && this._ctx.state === 'running') {
        var p = this._ctx.suspend();
        if (p && typeof p.then === 'function') p.catch(function () { /* ignore */ });
      }
    } catch (e) { /* ignore */ }
  };

  // Hard OFF kills any tails that are still sounding; ON restores master gain.
  AudioManager.prototype.setSoundOn = function (on) {
    this.enabled = on !== false;
    if (this._ctx && this._master) {
      try {
        var t = this._ctx.currentTime;
        this._master.gain.cancelScheduledValues(t);
        this._master.gain.setValueAtTime(this.enabled ? MASTER_VOLUME : 0, t);
      } catch (e) { /* ignore */ }
    }
    if (!this.enabled) this.stopAll();
  };

  AudioManager.prototype.stopAll = function () {
    var list = this._voices.splice(0);
    for (var i = 0; i < list.length; i++) {
      try { list[i].src.stop(0); } catch (e) { /* already stopped */ }
    }
  };

  /* ---------------- playback plumbing ---------------- */

  AudioManager.prototype._nowSec = function () {
    try {
      if (this._ctx && this._ctx.currentTime) return this._ctx.currentTime;
    } catch (e) { /* context closed */ }
    return this._now();
  };

  // Registers scheduled sources for bookkeeping: voice-cap inbound,
  // stale-out sweep (no timers, no onended chains — no leaks).
  AudioManager.prototype._track = function (src, stopAt) {
    var nowS = this._nowSec();
    var i;
    for (i = this._voices.length - 1; i >= 0; i--) {
      if (this._voices[i].stopAt + 0.3 < nowS) this._voices.splice(i, 1);
    }
    if (this._voices.length >= MAX_VOICES) {
      try { src.stop(0); } catch (e) { /* never started */ }
      return false;
    }
    this._voices.push({ src: src, stopAt: stopAt });
    return true;
  };

  /*
   * One oscillator note. o = { t, f, f2 (glide target), type, dur, g,
   * a (attack), detune, lp (lowpass frequency), dest }.
   * Returns null (dropped) or { src, stopAt }.
   */
  AudioManager.prototype._tone = function (o) {
    var ctx = this._ctx;
    var dur = o.dur || 0.15;
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = o.type || 'sine';
    if (o.detune) { try { osc.detune.value = o.detune; } catch (e) { /* ignore */ } }
    osc.frequency.setValueAtTime(Math.max(20, o.f), o.t);
    if (o.f2) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), o.t + dur);
    }
    var peak = o.g != null ? o.g : 0.3;
    var a = o.a != null ? o.a : 0.006;
    g.gain.setValueAtTime(SILENT, o.t);
    g.gain.linearRampToValueAtTime(peak, o.t + a);
    g.gain.exponentialRampToValueAtTime(SILENT, o.t + dur);
    var head = osc;
    if (o.lp) {
      try {
        var f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = o.lp;
        head.connect(f);
        head = f;
      } catch (e) { /* plain tone */ }
    }
    head.connect(g);
    g.connect(o.dest || this._master);
    var stopAt = o.t + dur + 0.03;
    osc.start(o.t);
    osc.stop(stopAt);
    if (!this._track(osc, stopAt)) return null;
    return { src: osc, stopAt: stopAt };
  };

  /*
   * Filtered noise burst (swooshes, ticks, shimmer).
   * o = { t, dur, g, f0, f1, type: 'bandpass'|'highpass'|'lowpass', q, a }.
   */
  AudioManager.prototype._noise = function (o) {
    var ctx = this._ctx;
    var dur = o.dur || 0.2;
    if (!this._noiseBuf || this._noiseBuf.sampleRate !== ctx.sampleRate) {
      try {
        var len = Math.max(1, Math.floor(ctx.sampleRate * 1.0));
        var buf = ctx.createBuffer(1, len, ctx.sampleRate);
        var d = buf.getChannelData(0);
        for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this._noiseBuf = buf;
      } catch (e) { return null; }
    }
    var src = ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    var f = ctx.createBiquadFilter();
    f.type = o.type === 'highpass' ? 'highpass' : (o.type === 'lowpass' ? 'lowpass' : 'bandpass');
    f.frequency.setValueAtTime(o.f0, o.t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, o.t + dur);
    f.Q.value = o.q != null ? o.q : 1;
    var g = ctx.createGain();
    var peak = o.g != null ? o.g : 0.1;
    var a = o.a != null ? o.a : 0.02;
    g.gain.setValueAtTime(SILENT, o.t);
    g.gain.linearRampToValueAtTime(peak, o.t + a);
    g.gain.exponentialRampToValueAtTime(SILENT, o.t + dur);
    src.connect(f); f.connect(g); g.connect(o.dest || this._master);
    var stopAt = o.t + dur + 0.03;
    src.start(o.t);
    src.stop(stopAt);
    if (!this._track(src, stopAt)) return null;
    return { src: src, stopAt: stopAt };
  };

  // Warm chime voice: sine body + softly detuned triangle partner.
  AudioManager.prototype._chime = function (t, midi, dur, g) {
    this._tone({ t: t, f: hertz(midi), dur: dur, g: g, a: 0.008, lp: 4200 });
    this._tone({
      t: t, f: hertz(midi), type: 'triangle',
      dur: dur * 0.9, g: g * 0.3, a: 0.01, detune: 6, lp: 3200
    });
  };

  // Delicate star-like sparkle: a few high sine pings + faint airy shimmer.
  AudioManager.prototype._sparkle = function (t, midis, g, gap) {
    var step = gap || 0.08;
    for (var i = 0; i < midis.length; i++) {
      this._tone({
        t: t + step * i, f: hertz(midis[i]), dur: 0.22, g: g, a: 0.004
      });
    }
    this._noise({ t: t, dur: step * midis.length + 0.1, g: g * 0.5, type: 'highpass', f0: 6200, a: 0.02 });
  };

  /* ---------------- public play API ---------------- */

  /*
   * play(name): gates re-triggers, records the dispatch via onPlay (test/
   * debug hook) and paints the sound at the audio clock. Returns true when a
   * sound was actually dispatched. Never throws; never blocks gameplay.
   */
  AudioManager.prototype.play = function (name, opt) {
    if (!this.enabled) return false;
    var nowS = this._nowSec();
    var gate = GATES[name] != null ? GATES[name] : DEFAULT_GATE;
    if (this._last[name] != null && nowS - this._last[name] < gate) return false;
    this._last[name] = nowS;
    if (this._onPlay) { try { this._onPlay(name, opt); } catch (e) { /* ignore */ } }
    try {
      if (!this._ctx) return true;   // no WebAudio: hook still fired, no sound
      // tiny lookahead so every sound's first sample lands cleanly
      var t = this._ctx.currentTime + 0.02;
      this._paint(name, t, opt || {});
    } catch (e) {
      this._ctx = null;              // broken context: fail silent from now on
    }
    return true;
  };

  /* Return the end time (in audio-clock seconds) of the painted sound. */
  AudioManager.prototype._paint = function (name, t, opt) {
    switch (name) {

      case 'click':   // routine menu tick: very quiet filtered tick
        this._noise({ t: t, dur: 0.04, g: 0.09, type: 'highpass', f0: 2600, a: 0.008 });
        this._tone({ t: t, f: 1800, dur: 0.035, g: 0.07, a: 0.004 });
        return t + 0.08;

      case 'confirm': // sound toggled back ON: tiny rising double-blip
        this._tone({ t: t, f: hertz(76), dur: 0.09, g: 0.16 });
        this._chime(t + 0.10, 84, 0.18, 0.2);
        return t + 0.32;

      case 'denied':  // locked level card: soft, non-jarring "nope" pop
        this._tone({ t: t, f: 392, f2: 370, type: 'sine', dur: 0.11, g: 0.18, lp: 1400 });
        this._tone({ t: t, f: 220, f2: 165, dur: 0.09, g: 0.1, a: 0.004 });
        return t + 0.16;

      case 'pop': {   // letter placed: soft rounded bounce, slot-ladder pitch
        var step = PENT[Math.min((opt.step | 0), PENT.length - 1)];
        var f = POP_BASE * Math.pow(2, step / 12);
        this._tone({ t: t, f: f, f2: f * 0.55, dur: 0.1, g: 0.26, a: 0.004 });
        this._tone({ t: t, f: f * 2, type: 'triangle', dur: 0.05, g: 0.05, a: 0.003, lp: 3000 });
        return t + 0.12;
      }

      case 'undo':    // letter removed: softer descending pop
        this._tone({ t: t, f: 400, f2: 210, dur: 0.09, g: 0.18, a: 0.004 });
        return t + 0.11;

      case 'clear':   // two gentle descending pops + low swoosh tail
        this._tone({ t: t, f: 340, f2: 185, dur: 0.08, g: 0.2, a: 0.004 });
        this._tone({ t: t + 0.09, f: 265, f2: 140, dur: 0.1, g: 0.16, a: 0.004 });
        this._noise({ t: t + 0.02, dur: 0.2, g: 0.05, f0: 950, f1: 480, a: 0.03 });
        return t + 0.24;

      case 'hint':    // magical sparkle: soft up-gliss + high pings
        this._tone({ t: t, f: 920, f2: 1500, dur: 0.2, g: 0.1, a: 0.01 });
        this._sparkle(t + 0.08, [106, 110, 113, 118], 0.085, 0.06);
        return t + 0.5;

      case 'swoosh':  // level entered: soft downward breath
        this._noise({ t: t, dur: 0.26, g: 0.08, f0: 1000, f1: 420, q: 0.9, a: 0.05 });
        return t + 0.3;

      case 'next':    // moving to the next animal: airy upward swoosh
        this._noise({ t: t, dur: 0.3, g: 0.12, f0: 480, f1: 1700, q: 1.1, a: 0.1 });
        this._tone({ t: t, f: 520, f2: 1040, dur: 0.24, g: 0.05, a: 0.02 });
        return t + 0.34;

      case 'correct': // solved! rising warm chime + delicate sparkle tail
        this._chime(t, 72, 0.22, 0.22);          // C5
        this._chime(t + 0.10, 76, 0.22, 0.22);   // E5
        this._chime(t + 0.20, 79, 0.22, 0.22);   // G5
        this._chime(t + 0.30, 84, 0.5, 0.26);    // C6, held over the reveal
        this._sparkle(t + 0.5, [96, 100, 103], 0.06, 0.09);
        return t + 1.0;

      case 'wrong':   // gentle two-note "oops", in sync with the 0.28s shake
        this._tone({ t: t, f: 311, f2: 300, type: 'triangle', dur: 0.17, g: 0.32, a: 0.012, lp: 1100 });
        this._tone({ t: t, f: 622, dur: 0.14, g: 0.1, a: 0.008 });
        this._tone({ t: t + 0.22, f: 277, f2: 252, type: 'triangle', dur: 0.3, g: 0.34, a: 0.012, lp: 1100 });
        this._tone({ t: t + 0.22, f: 554, dur: 0.24, g: 0.1, a: 0.008 });
        return t + 0.55;

      case 'timeout': // soft doubled blip: time is up (no harsh buzzer)
        this._tone({ t: t, f: hertz(69), type: 'triangle', dur: 0.15, g: 0.24, lp: 1500 });
        this._noise({ t: t, dur: 0.05, g: 0.04, type: 'highpass', f0: 4000, a: 0.006 });
        this._tone({ t: t + 0.2, f: hertz(64), type: 'triangle', dur: 0.3, g: 0.2, lp: 1300 });
        return t + 0.55;

      case 'gameover': // hearts gone: soft, sad-but-kind descending pad
        this._chime(t, 72, 0.4, 0.2);            // C5
        this._chime(t + 0.32, 69, 0.4, 0.2);     // A4
        this._chime(t + 0.64, 65, 0.9, 0.2);     // F4, long warm resolve
        return t + 1.55;

      case 'warning': // 10 seconds left: one restrained glassy double-blip
        this._tone({ t: t, f: hertz(84), dur: 0.12, g: 0.12 });
        this._tone({ t: t + 0.15, f: hertz(79), dur: 0.15, g: 0.1 });
        return t + 0.35;

      case 'countdown': { // final 3-2-1: soft wood ticks, slightly rising
        var n = Math.max(1, Math.min(3, opt.sec | 0));
        var f = 1050 * (1 + (3 - n) * 0.1);
        this._noise({ t: t, dur: 0.05, g: 0.05, type: 'bandpass', f0: f, q: 4, a: 0.004 });
        this._tone({ t: t, f: f, dur: 0.07, g: 0.13, a: 0.003 });
        return t + 0.1;
      }

      case 'fanfare': // LEVEL COMPLETE — the payoff sounding
        return this._fanfare(t, opt);

      case 'unlock':  // a brand-new level opened: small bright chime fanfare
        this._chime(t, 76, 0.28, 0.2);           // E5
        this._chime(t + 0.10, 79, 0.28, 0.2);    // G5
        this._chime(t + 0.20, 84, 0.45, 0.24);   // C6
        this._sparkle(t + 0.5, [96, 103], 0.05, 0.08);
        return t + 0.95;
    }
    return t;
  };

  /*
   * Original one-time victory fanfare (~1.45–2.35s + sparkle finish), with
   * warmer/longer variants per star count. C-major theme: pickup run ->
   * leader note -> wind-back -> resolve on C6, star arpeggio finish.
   * NOT background music: every note is one-shot; nothing repeats or loops.
   */
  AudioManager.prototype._fanfare = function (t, opt) {
    var stars = Math.max(1, Math.min(3, (opt && opt.stars) | 0));
    var end;

    // intro breath: airy rise + soft ascending glissando
    this._noise({ t: t, dur: 0.4, g: 0.08, f0: 550, f1: 2600, q: 0.9, a: 0.07 });
    this._tone({ t: t, f: 420, f2: 1350, dur: 0.32, g: 0.05, a: 0.04, lp: 2600 });

    if (stars === 1) {
      // 1 star: compact, sweetstatement
      this._chime(t + 0.28, 79, 0.2, 0.22);          // G5
      this._chime(t + 0.44, 84, 0.32, 0.26);         // C6
      this._chime(t + 0.78, 79, 0.2, 0.18);          // G5
      this._chime(t + 0.96, 84, 0.5, 0.26);          // C6 resolve
      this._tone({ t: t + 0.26, f: hertz(72), type: 'triangle', dur: 0.5, g: 0.05, lp: 1500 });
      end = t + 1.5;
    } else {
      // 2–3 stars: pickup run into the melody
      var run = [72, 74, 76, 77];                    // C5 D5 E5 F5
      for (var i = 0; i < run.length; i++) {
        this._tone({ t: t + 0.05 + i * 0.06, f: hertz(run[i]), dur: 0.07, g: 0.11, a: 0.005 });
      }
      this._chime(t + 0.3, 79, 0.2, 0.22);           // G5
      this._chime(t + 0.46, 84, 0.3, 0.28);          // C6 (shine)
      if (stars === 3) {
        this._chime(t + 0.74, 81, 0.16, 0.2);        // A5
        this._chime(t + 0.90, 77, 0.16, 0.2);        // F5
        this._chime(t + 1.06, 79, 0.3, 0.22);        // G5
        this._chime(t + 1.40, 84, 0.6, 0.28);        // C6 resolve
        this._tone({ t: t + 0.28, f: hertz(72), type: 'triangle', dur: 0.55, g: 0.05, lp: 1500 });
        this._tone({ t: t + 1.04, f: hertz(67), type: 'triangle', dur: 0.6, g: 0.05, lp: 1400 });
        end = t + 2.05;
      } else { // 2 stars
        this._chime(t + 0.72, 79, 0.22, 0.2);
        this._chime(t + 0.94, 84, 0.5, 0.26);
        this._tone({ t: t + 0.28, f: hertz(72), type: 'triangle', dur: 0.5, g: 0.05, lp: 1500 });
        end = t + 1.5;
      }
    }

    // delicate star-like finish: luminous arpeggio + faint airy shimmer
    this._sparkle(end + 0.02, [96, 100, 103, 108], 0.055, 0.07);
    this._noise({ t: end + 0.02, dur: 0.28, g: 0.025, type: 'highpass', f0: 6800, a: 0.02 });
    return end + 0.32;
  };

  /* ---------------- engine wiring ---------------- */

  /*
   * Subscribe to engine events. Every sound here is driven by a real engine
   * state change (never by CSS classes, animation timing or re-renders).
   * Engine events already fire exactly once per genuine change, so replayed
   * renders, resizes and screen switches can never retrigger sounds.
   */
  AudioManager.prototype.wireEngine = function (game) {
    var self = this;

    game.on('level-start', function () {
      self._resetCue(null);
      self.play('swoosh');                       // soft breath into a level
    });

    game.on('question', function (state) {
      self._resetCue(state);
      if (state && state.questionIndex > 0) self.play('next');
    });

    game.on('question-restarted', function (state) {
      self._resetCue(state);                     // timer reset: fresh cue state
    });

    game.on('place', function (info) {
      self.play('pop', { step: info && info.slotIndex });
    });

    game.on('undo', function () { self.play('undo'); });

    game.on('clear', function () { self.play('clear'); });

    game.on('hint', function () { self.play('hint'); });

    game.on('correct', function () { self.play('correct'); });   // engine-verified success only

    game.on('wrong', function () { self.play('wrong'); });

    game.on('timeout', function () { self.play('timeout'); });

    game.on('level-complete', function (payload) {
      self.play('fanfare', { stars: payload && payload.stars });
    });

    game.on('level-failed', function () { self.play('gameover'); });

    game.on('pause', function () {
      self._paused = true;
      self.play('pause');
    });

    game.on('resume', function () {
      self._paused = false;
      self.play('resume');
    });

    game.on('visibility', function (info) {
      // tab hidden -> freeze cues; audio context suspend handled by attach()
      if (info && info.hidden) self._paused = true;
      else self._paused = game.paused;
    });
  };

  AudioManager.prototype._resetCue = function (state) {
    this._cue.warned = false;
    this._cue.lastTick = -1;
    this._timed = !!(state && state.timer);
  };

  /*
    Timer-driven cues, fed by main.js whenever the displayed second changes on
    a TIMED question only (untimed levels never call this):
      - one restrained glassy blip when exactly 10 seconds remain;
      - soft ticks at 3, 2 and 1
  */
  AudioManager.prototype.onTimerSecond = function (sec) {
    if (this._paused) return;
    if (!this._timed) return;
    var cue = timerCue(sec, this._cue);
    if (!cue) return;
    if (cue === 'timer-warning') {
      this._cue.warned = true;
      this.play('warning');
    } else {
      this._cue.lastTick = sec;
      this.play('countdown', { sec: sec });
    }
  };

  /* Pause/confirm blips used by main.js for menu buttons. */
  AudioManager.prototype.click = function () { return this.play('click'); };
  AudioManager.prototype.denied = function () { return this.play('denied'); };
  AudioManager.prototype.pauseBlip = function () { return this.play('pause'); };
  AudioManager.prototype.resumeBlip = function () { return this.play('resume'); };

  return { AudioManager: AudioManager, timerCue: timerCue, GATES: GATES };
});
