/**
 * audioService.js - Web Audio API synthesizer + HTML5 Audio streaming + 5-Band Equalizer
 * Real-time audio processing with presets, smooth transitions, and CORS support.
 */

export const EQUALIZER_FREQUENCIES = [
  { freq: 60, label: "60 Гц", sub: "Саб-бас", type: "lowshelf" },
  { freq: 230, label: "230 Гц", sub: "Бас", type: "peaking" },
  { freq: 910, label: "910 Гц", sub: "Вокал", type: "peaking" },
  { freq: 4000, label: "4 кГц", sub: "Яркость", type: "peaking" },
  { freq: 14000, label: "14 кГц", sub: "Воздух", type: "highshelf" },
];

export const EQUALIZER_PRESETS = {
  "Flat": { name: "Flat", label: "Flat (По умолчанию)", bands: [0, 0, 0, 0, 0] },
  "Bass Boost": { name: "Bass Boost", label: "Bass Boost (Усиление баса)", bands: [6, 4, 0, 1, 2] },
  "Vocal": { name: "Vocal", label: "Vocal (Акцент на голос)", bands: [-2, 0, 5, 3, -1] },
  "Electronic": { name: "Electronic", label: "Electronic (Электроника)", bands: [5, 2, -2, 3, 4] },
  "Rock": { name: "Rock", label: "Rock / Metal", bands: [4, 1, -1, 3, 5] },
  "Acoustic": { name: "Acoustic", label: "Acoustic", bands: [2, 3, 2, 1, 2] },
};

class SoundEngine {
  constructor() {
    this.audio = null;
    this.context = null;
    this.sourceNode = null;
    this.filters = [];
    this.master = null;
    this.synthMaster = null;
    this.synthTimer = null;
    this.currentTrack = null;
    this.isPlaying = false;
    this.isBlockedByAutoplay = false;
    this.targetSyncOffset = null;
    this.targetSyncTime = null;
    this.volume = 0.7;
    this.offset = 0;
    this.started = 0;

    // Equalizer state
    this.isEqualizerEnabled = true;
    this.activePreset = "Flat";
    this.equalizerBands = [0, 0, 0, 0, 0];

    // Load saved settings if available
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("sound_equalizer_settings");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed.bands) && parsed.bands.length === 5) {
            this.equalizerBands = parsed.bands;
          }
          if (typeof parsed.isEnabled === "boolean") {
            this.isEqualizerEnabled = parsed.isEnabled;
          }
          if (parsed.activePreset) {
            this.activePreset = parsed.activePreset;
          }
        }
      } catch {}
    }

    this.listeners = new Set();
    this.equalizerListeners = new Set();

    this.timer = setInterval(() => {
      if (this.isPlaying) {
        this.notify();
        if (!this.audio && this.seconds >= this.duration) {
          this.finish();
        }
      }
    }, 250);
  }

  seekAudio(audio, seconds) {
    if (!audio || !Number.isFinite(seconds) || seconds < 0) return;
    try {
      if (audio.readyState >= 1) {
        audio.currentTime = seconds;
      } else {
        const onLoaded = () => {
          try { audio.currentTime = seconds; } catch {}
          audio.removeEventListener("loadedmetadata", onLoaded);
          audio.removeEventListener("canplay", onLoaded);
        };
        audio.addEventListener("loadedmetadata", onLoaded);
        audio.addEventListener("canplay", onLoaded);
      }
    } catch {}
  }

  getLiveElapsed() {
    if (this.targetSyncTime && this.targetSyncOffset !== null) {
      const added = (performance.now() - this.targetSyncTime) / 1000;
      return Math.max(0, this.targetSyncOffset + (this.isPlaying ? added : 0));
    }
    return this.offset;
  }

  get seconds() {
    if (this.audio && !this.isBlockedByAutoplay && !this.audio.paused) {
      return this.audio.currentTime;
    }
    if (this.targetSyncTime && this.targetSyncOffset !== null) {
      return this.getLiveElapsed();
    }
    return this.offset + (this.isPlaying ? (performance.now() - this.started) / 1000 : 0);
  }

  get duration() {
    if (Number.isFinite(this.audio?.duration) && this.audio.duration > 0) {
      return this.audio.duration;
    }
    return Number(this.currentTrack?.duration_seconds) || 45;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeEqualizer(listener) {
    this.equalizerListeners.add(listener);
    // Immediately emit current state
    try {
      listener(this.getEqualizerState());
    } catch {}
    return () => this.equalizerListeners.delete(listener);
  }

  notify() {
    for (const fn of this.listeners) {
      try {
        fn({
          track: this.currentTrack,
          isPlaying: this.isPlaying,
          isBlockedByAutoplay: this.isBlockedByAutoplay,
          seconds: this.seconds,
          duration: this.duration,
          progress: this.duration > 0 ? (this.seconds / this.duration) * 100 : 0,
        });
      } catch {}
    }
  }

  notifyEqualizer() {
    const state = this.getEqualizerState();
    for (const fn of this.equalizerListeners) {
      try {
        fn(state);
      } catch {}
    }
  }

  getEqualizerState() {
    return {
      isEnabled: this.isEqualizerEnabled,
      activePreset: this.activePreset,
      bands: [...this.equalizerBands],
      presets: EQUALIZER_PRESETS,
      frequencies: EQUALIZER_FREQUENCIES,
    };
  }

  saveEqualizerSettings() {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(
          "sound_equalizer_settings",
          JSON.stringify({
            isEnabled: this.isEqualizerEnabled,
            activePreset: this.activePreset,
            bands: this.equalizerBands,
          })
        );
      } catch {}
    }
  }

  /**
   * Lazy initialization of Web Audio API graph and persistent HTMLAudioElement
   */
  ensureAudioContext() {
    if (typeof window === "undefined") return null;

    if (!this.context) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;

      const ctx = (this.context = new AudioCtx());

      // Master gain node
      this.master = ctx.createGain();
      this.master.gain.setValueAtTime(this.volume, ctx.currentTime);
      this.master.connect(ctx.destination);

      // Create 5 BiquadFilterNodes
      this.filters = EQUALIZER_FREQUENCIES.map((item, idx) => {
        const filter = ctx.createBiquadFilter();
        filter.type = item.type;
        filter.frequency.setValueAtTime(item.freq, ctx.currentTime);
        if (item.type === "peaking") {
          filter.Q.setValueAtTime(1.0, ctx.currentTime);
        }
        const initialGain = this.isEqualizerEnabled ? this.equalizerBands[idx] : 0;
        filter.gain.setValueAtTime(initialGain, ctx.currentTime);
        return filter;
      });

      // Chain: filter[0] -> filter[1] -> filter[2] -> filter[3] -> filter[4] -> master -> destination
      for (let i = 0; i < this.filters.length - 1; i++) {
        this.filters[i].connect(this.filters[i + 1]);
      }
      this.filters[this.filters.length - 1].connect(this.master);

      // Setup audio element and connect source if already created
      this.attachAudioElementSource();
    }

    if (this.context.state === "suspended") {
      this.context.resume().catch(() => {});
    }

    return this.context;
  }

  getAudioElement() {
    if (this.audio) return this.audio;

    const audio = new Audio();
    // Enable CORS to avoid Web Audio API cross-origin security restrictions
    audio.crossOrigin = "anonymous";
    audio.preload = "auto";
    audio.volume = 1.0; // Volume is managed via Web Audio master GainNode
    audio.addEventListener("ended", () => this.finish());
    audio.addEventListener("error", (e) => {
      console.warn("Audio playback error, falling back to synth:", e);
      if (this.isPlaying) this.startSynth();
    });

    this.audio = audio;
    this.attachAudioElementSource();
    return audio;
  }

  attachAudioElementSource() {
    if (!this.context || !this.audio || this.sourceNode) return;
    try {
      this.sourceNode = this.context.createMediaElementSource(this.audio);
      if (this.filters.length > 0) {
        this.sourceNode.connect(this.filters[0]);
      } else if (this.master) {
        this.sourceNode.connect(this.master);
      }
    } catch (err) {
      console.warn("Could not create MediaElementSourceNode:", err);
    }
  }

  /**
   * Set gain for a specific band (-12 dB to +12 dB) with smooth ramp
   */
  setBandGain(index, gainValue) {
    if (index < 0 || index >= this.equalizerBands.length) return;
    const clamped = Math.max(-12, Math.min(12, Math.round(Number(gainValue) * 10) / 10));
    this.equalizerBands[index] = clamped;

    this.ensureAudioContext();

    if (this.context && this.filters[index]) {
      const target = this.isEqualizerEnabled ? clamped : 0;
      // Exponential / targetAtTime smoothing prevents clicks/pops
      this.filters[index].gain.setTargetAtTime(target, this.context.currentTime, 0.015);
    }

    // Check if current band values match any known preset
    let matchingPreset = "Custom";
    for (const [key, preset] of Object.entries(EQUALIZER_PRESETS)) {
      const match = preset.bands.every((b, i) => Math.abs(b - this.equalizerBands[i]) < 0.1);
      if (match) {
        matchingPreset = key;
        break;
      }
    }
    this.activePreset = matchingPreset;

    this.saveEqualizerSettings();
    this.notifyEqualizer();
  }

  /**
   * Apply a preset by name
   */
  setPreset(presetName) {
    const preset = EQUALIZER_PRESETS[presetName];
    if (!preset) return;

    this.equalizerBands = [...preset.bands];
    this.activePreset = presetName;

    this.ensureAudioContext();

    if (this.context && this.filters.length > 0) {
      this.filters.forEach((filter, i) => {
        const target = this.isEqualizerEnabled ? this.equalizerBands[i] : 0;
        filter.gain.setTargetAtTime(target, this.context.currentTime, 0.02);
      });
    }

    this.saveEqualizerSettings();
    this.notifyEqualizer();
  }

  /**
   * Master equalizer toggle (enable / bypass)
   */
  setEqualizerEnabled(enabled) {
    this.isEqualizerEnabled = Boolean(enabled);
    this.ensureAudioContext();

    if (this.context && this.filters.length > 0) {
      this.filters.forEach((filter, i) => {
        const target = this.isEqualizerEnabled ? this.equalizerBands[i] : 0;
        filter.gain.setTargetAtTime(target, this.context.currentTime, 0.025);
      });
    }

    this.saveEqualizerSettings();
    this.notifyEqualizer();
  }

  resetEqualizer() {
    this.setPreset("Flat");
  }

  async unlock() {
    this.ensureAudioContext();
    if (this.context && this.context.state === "suspended") {
      try {
        await this.context.resume();
      } catch {}
    }

    if (this.currentTrack && this.isPlaying) {
      const liveSeconds = this.getLiveElapsed();
      if (this.audio) {
        this.seekAudio(this.audio, liveSeconds);
        try {
          await this.audio.play();
          this.isBlockedByAutoplay = false;
          this.stopSynth();
        } catch (e) {
          console.warn("Audio unlock play failed:", e);
        }
      } else {
        this.offset = liveSeconds;
        this.started = performance.now();
        this.startSynth();
        if (this.context?.state === "running") {
          this.isBlockedByAutoplay = false;
        }
      }
    } else {
      this.isBlockedByAutoplay = false;
    }
    this.notify();
  }

  async play(track, audioUrl = null, startOffsetSeconds = 0) {
    if (!track) return;

    this.ensureAudioContext();

    const targetOffset = (typeof startOffsetSeconds === "number" && startOffsetSeconds > 0) ? startOffsetSeconds : 0;
    this.targetSyncOffset = targetOffset;
    this.targetSyncTime = performance.now();

    // If same track
    if (this.currentTrack?.id === track.id) {
      if (targetOffset > 0) {
        if (this.audio) {
          if (Math.abs(this.audio.currentTime - targetOffset) > 0.75) {
            this.seekAudio(this.audio, targetOffset);
          }
        } else {
          if (Math.abs(this.seconds - targetOffset) > 0.75) {
            this.offset = targetOffset;
            this.started = performance.now();
          }
        }
      }

      if (!this.isPlaying || this.isBlockedByAutoplay) {
        this.isPlaying = true;
        this.started = performance.now();
        if (this.audio) {
          try {
            await this.audio.play();
            this.isBlockedByAutoplay = false;
          } catch (err) {
            if (err.name === "NotAllowedError" || err.name === "SecurityError") {
              this.isBlockedByAutoplay = true;
            } else {
              this.startSynth();
            }
          }
        } else {
          this.startSynth();
        }
        this.notify();
      }
      return;
    }

    // New track
    this.stop();
    this.currentTrack = track;
    this.offset = targetOffset;
    this.isPlaying = true;
    this.started = performance.now();

    const fileMap = {
      bustin: "/audio/bustin_loose.mp3",
      funk90: "/audio/90_seconds_of_funk.mp3",
      cents5: "/audio/5_cents_back.mp3",
      fallingsky: "/audio/falling_sky.mp3",
      dawn: "/audio/bustin_loose.mp3",
      city: "/audio/90_seconds_of_funk.mp3",
      orbit: "/audio/falling_sky.mp3",
      rain: "/audio/5_cents_back.mp3",
      night: "/audio/falling_sky.mp3",
      sea: "/audio/90_seconds_of_funk.mp3",
    };
    const key = track.library_key || track.key;
    const directFile = fileMap[key];

    const streamUrl = directFile || audioUrl || track.audio_url || (track.id && track.room_id && track.source_type === "upload"
      ? `/api/communities/${track.room_id}/tracks/${track.id}/audio`
      : null);

    if (streamUrl) {
      const audio = this.getAudioElement();
      audio.src = streamUrl;
      if (targetOffset > 0) {
        this.seekAudio(audio, targetOffset);
      }
      try {
        await audio.play();
        this.isBlockedByAutoplay = false;
        if (targetOffset > 0 && Math.abs(audio.currentTime - targetOffset) > 0.75) {
          this.seekAudio(audio, targetOffset);
        }
      } catch (err) {
        if (err.name === "NotAllowedError" || err.name === "SecurityError") {
          console.warn("Autoplay blocked on this device. Waiting for user interaction to unmute.");
          this.isBlockedByAutoplay = true;
        } else {
          this.startSynth();
        }
      }
    } else {
      this.startSynth();
    }
    this.notify();
  }

  syncToPosition(targetSeconds) {
    if (!Number.isFinite(targetSeconds) || targetSeconds < 0) return;
    this.targetSyncOffset = targetSeconds;
    this.targetSyncTime = performance.now();

    if (this.audio) {
      if (!this.isBlockedByAutoplay && Math.abs(this.audio.currentTime - targetSeconds) > 0.8) {
        this.seekAudio(this.audio, targetSeconds);
        this.offset = targetSeconds;
        this.notify();
      }
    } else {
      if (Math.abs(this.seconds - targetSeconds) > 0.8) {
        this.offset = targetSeconds;
        this.started = performance.now();
        this.notify();
      }
    }
  }

  pause() {
    if (!this.isPlaying) return;
    this.offset = this.seconds;
    this.isPlaying = false;
    this.isBlockedByAutoplay = false;
    this.targetSyncOffset = null;
    this.targetSyncTime = null;
    if (this.audio) this.audio.pause();
    this.stopSynth();
    this.notify();
  }

  stop() {
    this.pause();
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
    }
    this.stopSynth();
    this.offset = 0;
    this.currentTrack = null;
    this.isBlockedByAutoplay = false;
    this.notify();
  }

  seek(seconds) {
    const val = Math.min(this.duration, Math.max(0, Number(seconds)));
    if (this.audio) {
      this.audio.currentTime = val;
    } else {
      this.offset = val;
      this.started = performance.now();
    }
    this.notify();
  }

  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, Number(val)));
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.02);
    }
    if (this.audio && !this.sourceNode) {
      this.audio.volume = this.volume;
    }
  }

  finish() {
    this.pause();
    this.offset = this.duration;
    this.notify();
    if (this.onEnded) this.onEnded(this.currentTrack);
  }

  stopSynth() {
    if (this.synthTimer) {
      clearInterval(this.synthTimer);
      this.synthTimer = null;
    }
    if (this.synthMaster) {
      try {
        this.synthMaster.disconnect();
      } catch {}
      this.synthMaster = null;
    }
  }

  startSynth() {
    this.stopSynth();
    this.ensureAudioContext();
    if (!this.context) return;

    const ctx = this.context;
    const key = this.currentTrack?.library_key || "dawn";
    const noteMap = {
      dawn: [261.63, 329.63, 392.0, 523.25], // C4, E4, G4, C5
      city: [220.0, 261.63, 329.63, 392.0],  // A3, C4, E4, G4
      orbit: [293.66, 369.99, 440.0, 587.33], // D4, F#4, A4, D5
      rain: [196.0, 246.94, 293.66, 392.0],   // G3, B3, D4, G4
      night: [164.81, 196.0, 246.94, 329.63], // E3, G3, B3, E4
      sea: [174.61, 220.0, 261.63, 349.23],   // F3, A3, C4, F4
    };

    const notes = noteMap[key] || [220, 277.18, 329.63, 440];
    const synthMaster = (this.synthMaster = ctx.createGain());
    synthMaster.gain.setValueAtTime(0.35, ctx.currentTime);

    // Route synth through the equalizer graph as well!
    if (this.filters.length > 0) {
      synthMaster.connect(this.filters[0]);
    } else if (this.master) {
      synthMaster.connect(this.master);
    }

    let beat = Math.floor(this.offset / 0.32);
    const tick = () => {
      if (!this.context || this.context.state === "closed" || !this.synthMaster) return;
      const at = this.context.currentTime + 0.02;

      // Melody note
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();
      osc.type = key === "night" ? "sawtooth" : "sine";
      const freq = notes[beat % notes.length] * (beat % 8 === 7 ? 2 : 1);
      osc.frequency.setValueAtTime(freq, at);

      gain.gain.setValueAtTime(0.001, at);
      gain.gain.exponentialRampToValueAtTime(0.65, at + 0.035);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.29);

      osc.connect(gain);
      gain.connect(synthMaster);
      osc.start(at);
      osc.stop(at + 0.31);

      // Bass note on downbeats
      if (beat % 4 === 0) {
        const bass = this.context.createOscillator();
        const bg = this.context.createGain();
        bass.type = "triangle";
        bass.frequency.setValueAtTime(notes[0] / 2, at);
        bg.gain.setValueAtTime(0.001, at);
        bg.gain.exponentialRampToValueAtTime(0.5, at + 0.08);
        bg.gain.exponentialRampToValueAtTime(0.001, at + 0.55);

        bass.connect(bg);
        bg.connect(synthMaster);
        bass.start(at);
        bass.stop(at + 0.57);
      }

      beat++;
    };

    tick();
    this.synthTimer = setInterval(tick, 320);
  }
}

export const audioService = new SoundEngine();
export default audioService;
