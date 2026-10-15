/* Playback only. Queue transitions are confirmed by the server in app.js. */
class AudioController {
  constructor({ onTick, onEnded, onError }) {
    Object.assign(this, { onTick, onEnded, onError, volume: .7, playing: false, offset: 0 });
    this.timer = setInterval(() => {
      this.onTick?.();
      if (this.playing && !this.audio && this.seconds >= this.duration) this.finish();
    }, 200);
  }
  get seconds() { return this.audio ? this.audio.currentTime : this.offset + (this.playing ? (performance.now() - this.started) / 1000 : 0); }
  get duration() { return Number.isFinite(this.audio?.duration) ? this.audio.duration : Number(this.track?.duration_seconds) || 60; }
  async load(track, url) {
    this.stop();
    this.track = track;
    if (track.source_type === 'upload') {
      const audio = new Audio();
      audio.preload = 'auto';
      audio.src = url;
      audio.volume = this.volume;
      audio.addEventListener('ended', () => this.finish());
      audio.addEventListener('error', () => {
        if (!this.playing) return;
        this.playing = false;
        this.onError?.('Браузер не смог воспроизвести этот аудиофайл');
      });
      this.audio = audio;
    }
    await this.play();
  }
  async play() {
    if (!this.track) return;
    this.started = performance.now();
    this.playing = true;
    try {
      if (this.audio) await this.audio.play();
      else this.startSynth();
    } catch (error) {
      this.playing = false;
      if (this.audio) throw new Error('Браузер не смог воспроизвести этот аудиофайл', { cause: error });
      throw error;
    }
  }
  pause() {
    if (!this.playing) return;
    this.offset = this.seconds;
    this.playing = false;
    this.audio?.pause();
    this.stopSynth();
  }
  stopSynth() {
    clearInterval(this.synthTimer);
    this.synthTimer = null;
    this.context?.close().catch(() => {});
    this.context = null;
    this.master = null;
  }
  stop() {
    this.pause();
    if (this.audio) { this.audio.src = ''; this.audio = null; }
    this.stopSynth();
    this.offset = 0;
    this.track = null;
  }
  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, Number(value)));
    if (this.audio) this.audio.volume = this.volume;
    if (this.master) this.master.gain.value = this.volume * .13;
  }
  seek(seconds) {
    const value = Math.min(this.duration, Math.max(0, Number(seconds)));
    if (this.audio) this.audio.currentTime = value;
    else { this.offset = value; this.started = performance.now(); }
    this.onTick?.();
  }
  finish() {
    if (!this.playing) return;
    const track = this.track;
    this.pause();
    this.offset = this.duration;
    this.onEnded?.(track);
  }
  startSynth() {
    const notes = {
      dawn: [261.63,329.63,392,523.25], city: [220,261.63,329.63,392],
      orbit: [293.66,369.99,440,587.33], rain: [196,246.94,293.66,392],
      night: [164.81,196,246.94,329.63], sea: [174.61,220,261.63,349.23]
    }[this.track.library_key] || [220,330,440,550];
    const context = this.context = new (window.AudioContext || window.webkitAudioContext)();
    const master = this.master = context.createGain();
    master.gain.value = this.volume * .13;
    master.connect(context.destination);
    let beat = Math.floor(this.offset / .32);
    const tick = () => {
      if (context.state === 'closed') return;
      const at = context.currentTime + .02;
      const osc = context.createOscillator(), gain = context.createGain();
      osc.type = this.track.library_key === 'night' ? 'sawtooth' : 'sine';
      osc.frequency.value = notes[beat % notes.length] * (beat % 8 === 7 ? 2 : 1);
      gain.gain.setValueAtTime(.001, at);
      gain.gain.exponentialRampToValueAtTime(.65, at + .035);
      gain.gain.exponentialRampToValueAtTime(.001, at + .29);
      osc.connect(gain).connect(master); osc.start(at); osc.stop(at + .31);
      if (beat % 4 === 0) {
        const bass = context.createOscillator(), bg = context.createGain();
        bass.type = 'triangle'; bass.frequency.value = notes[0] / 2;
        bg.gain.setValueAtTime(.001, at); bg.gain.exponentialRampToValueAtTime(.5, at + .08);
        bg.gain.exponentialRampToValueAtTime(.001, at + .55);
        bass.connect(bg).connect(master); bass.start(at); bass.stop(at + .57);
      }
      beat++;
    };
    tick(); this.synthTimer = setInterval(tick, 320);
  }
}
window.AudioController = AudioController;
