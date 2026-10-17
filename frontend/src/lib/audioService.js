/**
 * audioService.js - Web Audio API synthesizer + HTML5 Audio streaming
 * Supports real audible playback for library tracks, mock tracks, and uploaded audio.
 */

class SoundEngine {
  constructor() {
    this.audio = null;
    this.context = null;
    this.master = null;
    this.synthTimer = null;
    this.currentTrack = null;
    this.isPlaying = false;
    this.volume = 0.7;
    this.offset = 0;
    this.started = 0;
    this.listeners = new Set();

    this.timer = setInterval(() => {
      if (this.isPlaying) {
        this.notify();
        if (!this.audio && this.seconds >= this.duration) {
          this.finish();
        }
      }
    }, 250);
  }

  get seconds() {
    if (this.audio) return this.audio.currentTime;
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

  notify() {
    for (const fn of this.listeners) {
      try {
        fn({
          track: this.currentTrack,
          isPlaying: this.isPlaying,
          seconds: this.seconds,
          duration: this.duration,
          progress: this.duration > 0 ? (this.seconds / this.duration) * 100 : 0,
        });
      } catch {}
    }
  }

  unlock() {
    if (this.context && this.context.state === "suspended") {
      this.context.resume().catch(() => {});
    }
    if (this.audio && this.isPlaying && this.audio.paused) {
      this.audio.play().then(() => {
        this.stopSynth();
      }).catch(() => {});
    } else if (this.isPlaying && !this.audio && this.currentTrack) {
      this.play(this.currentTrack).catch(() => {});
    }
  }

  async play(track, audioUrl = null) {
    if (!track) return;

    // If same track and paused, resume
    if (this.currentTrack?.id === track.id && !this.isPlaying) {
      this.isPlaying = true;
      this.started = performance.now();
      if (this.audio) {
        await this.audio.play();
      } else {
        this.startSynth();
      }
      this.notify();
      return;
    }

    // New track
    this.stop();
    this.currentTrack = track;
    this.offset = 0;
    this.isPlaying = true;
    this.started = performance.now();

    const fileMap = {
      bustin: "/audio/bustin_loose.mp3",
      funk90: "/audio/90_seconds_of_funk.mp3",
      cents5: "/audio/5_cents_back.mp3",
      fallingsky: "/audio/falling_sky.mp3",
    };
    const key = track.library_key || track.key;
    const directFile = fileMap[key];

    const streamUrl = directFile || audioUrl || track.audio_url || (track.id && track.room_id && track.source_type === "upload"
      ? `/api/communities/${track.room_id}/tracks/${track.id}/audio`
      : null);

    if (streamUrl) {
      const audio = new Audio();
      audio.preload = "auto";
      audio.src = streamUrl;
      audio.volume = this.volume;
      audio.addEventListener("ended", () => this.finish());
      audio.addEventListener("error", () => {
        // Fallback to synth if stream fails
        this.audio = null;
        if (this.isPlaying) this.startSynth();
      });
      this.audio = audio;
      try {
        await audio.play();
      } catch {
        this.startSynth();
      }
    } else {
      this.startSynth();
    }
    this.notify();
  }

  pause() {
    if (!this.isPlaying) return;
    this.offset = this.seconds;
    this.isPlaying = false;
    if (this.audio) this.audio.pause();
    this.stopSynth();
    this.notify();
  }

  stop() {
    this.pause();
    if (this.audio) {
      this.audio.src = "";
      this.audio = null;
    }
    this.stopSynth();
    this.offset = 0;
    this.currentTrack = null;
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
    if (this.audio) this.audio.volume = this.volume;
    if (this.master) this.master.gain.value = this.volume * 0.15;
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
    if (this.context) {
      this.context.close().catch(() => {});
      this.context = null;
      this.master = null;
    }
  }

  startSynth() {
    this.stopSynth();
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
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = (this.context = new AudioCtx());
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    const master = (this.master = ctx.createGain());
    master.gain.value = this.volume * 0.15;
    master.connect(ctx.destination);

    let beat = Math.floor(this.offset / 0.32);
    const tick = () => {
      if (!this.context || this.context.state === "closed") return;
      const at = this.context.currentTime + 0.02;

      // Мелодический тон
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();
      osc.type = key === "night" ? "sawtooth" : "sine";
      const freq = notes[beat % notes.length] * (beat % 8 === 7 ? 2 : 1);
      osc.frequency.setValueAtTime(freq, at);

      gain.gain.setValueAtTime(0.001, at);
      gain.gain.exponentialRampToValueAtTime(0.65, at + 0.035);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.29);

      osc.connect(gain);
      gain.connect(master);
      osc.start(at);
      osc.stop(at + 0.31);

      // Басовая партия на сильную долю
      if (beat % 4 === 0) {
        const bass = this.context.createOscillator();
        const bg = this.context.createGain();
        bass.type = "triangle";
        bass.frequency.setValueAtTime(notes[0] / 2, at);
        bg.gain.setValueAtTime(0.001, at);
        bg.gain.exponentialRampToValueAtTime(0.5, at + 0.08);
        bg.gain.exponentialRampToValueAtTime(0.001, at + 0.55);

        bass.connect(bg);
        bg.connect(master);
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
