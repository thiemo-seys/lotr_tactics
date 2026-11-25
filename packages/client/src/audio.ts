// Plays the play page's sound with Web Audio (docs/game-spec.md section 12, Sound): the interface's
// sounds, made from the tones in sound.ts, and the music tracks, crossfading between them. What
// plays when is worked out in sound.ts; this only makes it heard.

import musicFiles from 'virtual:music';
import { CROSSFADE, CUE_GAP, CUES, TRACKS, cueLength, listen, volumeGain, type Cue, type SoundSettings, type Tone, type Track } from './sound.js';

/** A track's state: not asked for yet, loading, ready, or with no file to play. */
type Loaded = { state: 'loading' } | { state: 'ready'; buffer: AudioBuffer } | { state: 'missing' };

interface Playing {
  readonly track: Track;
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
}

export class SoundSystem {
  private context: AudioContext | null = null;
  private master!: GainNode;
  private effects!: GainNode;
  private music!: GainNode;
  /** Lowers the music under the big stings. */
  private duck!: GainNode;
  private noise!: AudioBuffer;
  private readonly tracks = new Map<Track, Loaded>();
  private playing: Playing | null = null;
  private wanted: Track | null = null;
  /** When each sound last started, in the context's time, so the same sound can't pile up. */
  private readonly lastPlayed = new Map<Cue, number>();

  constructor(private settings: SoundSettings) {
    listen((name) => this.play(name));
    // Browsers start sound only after the person presses something.
    const start = () => this.start();
    for (const type of ['pointerdown', 'keydown'] as const) window.addEventListener(type, start, { capture: true });
    document.addEventListener('visibilitychange', () => {
      if (this.context === null) return;
      if (document.hidden) void this.context.suspend();
      else void this.context.resume();
    });
  }

  /** Changes the settings, which take effect at once. */
  set(settings: SoundSettings): void {
    this.settings = settings;
    if (this.context === null) return;
    const now = this.context.currentTime;
    this.master.gain.setTargetAtTime(settings.muted ? 0 : 1, now, 0.03);
    this.effects.gain.setTargetAtTime(volumeGain(settings.effects), now, 0.03);
    this.music.gain.setTargetAtTime(volumeGain(settings.music), now, 0.03);
  }

  /** The track the page wants now, which plays once its file has loaded. */
  want(track: Track): void {
    if (this.wanted === track) return;
    this.wanted = track;
    this.follow();
  }

  /** Plays one of the interface's sounds. */
  play(name: Cue): void {
    const context = this.context;
    if (context === null || context.state !== 'running' || this.settings.muted || this.settings.effects === 0) return;
    const now = context.currentTime;
    const last = this.lastPlayed.get(name);
    if (last !== undefined && now - last < CUE_GAP) return;
    this.lastPlayed.set(name, now);
    const sound = CUES[name];
    for (const tone of sound.tones) playTone(context, this.effects, this.noise, tone, now);
    if (sound.duck !== undefined) {
      const gain = this.duck.gain;
      const low = 1 - sound.duck / 100;
      gain.cancelScheduledValues(now);
      gain.setTargetAtTime(low, now, 0.05);
      gain.setTargetAtTime(1, now + cueLength(sound), 0.4);
    }
  }

  private start(): void {
    if (this.context !== null) {
      if (this.context.state === 'suspended' && !document.hidden) void this.context.resume();
      return;
    }
    const context = new AudioContext();
    this.context = context;
    this.master = context.createGain();
    this.master.connect(limiter(context));
    this.effects = context.createGain();
    this.effects.connect(this.master);
    this.music = context.createGain();
    this.duck = context.createGain();
    this.music.connect(this.duck).connect(this.master);
    this.noise = noiseBuffer(context);
    this.set(this.settings);
    // Both tracks load now, so the first fight's music starts with it.
    for (const track of TRACKS) this.load(context, track);
    this.follow();
  }

  /** Loads the wanted track if need be, and crossfades to it once it is ready. */
  private follow(): void {
    const context = this.context;
    const track = this.wanted;
    if (context === null || track === null) return;
    const loaded = this.tracks.get(track);
    if (loaded === undefined) {
      this.load(context, track);
      return;
    }
    if (loaded.state !== 'ready') {
      // Nothing to play for this step: the other track fades out.
      if (loaded.state === 'missing') this.fadeOut(context.currentTime);
      return;
    }
    if (this.playing?.track === track) return;
    const now = context.currentTime;
    this.fadeOut(now);
    const source = context.createBufferSource();
    source.buffer = loaded.buffer;
    source.loop = true;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + CROSSFADE);
    source.connect(gain).connect(this.music);
    source.start(now);
    this.playing = { track, source, gain };
  }

  private fadeOut(now: number): void {
    const old = this.playing;
    if (old === null) return;
    this.playing = null;
    old.gain.gain.cancelScheduledValues(now);
    old.gain.gain.setValueAtTime(old.gain.gain.value, now);
    old.gain.gain.linearRampToValueAtTime(0, now + CROSSFADE);
    old.source.stop(now + CROSSFADE + 0.05);
    old.source.onended = () => old.gain.disconnect();
  }

  private load(context: AudioContext, track: Track): void {
    if (!musicFiles.includes(track)) {
      this.tracks.set(track, { state: 'missing' });
      this.follow();
      return;
    }
    this.tracks.set(track, { state: 'loading' });
    fetch(`${import.meta.env.BASE_URL}music/${track}.mp3`)
      .then((response) => {
        if (!response.ok) throw new Error(`${response.status}`);
        return response.arrayBuffer();
      })
      .then((data) => context.decodeAudioData(data))
      .then(
        (buffer) => this.tracks.set(track, { state: 'ready', buffer }),
        () => this.tracks.set(track, { state: 'missing' }),
      )
      .finally(() => this.follow());
  }
}

/** A gentle limiter before the speakers, so sounds that land together don't clip. */
function limiter(context: BaseAudioContext): DynamicsCompressorNode {
  const node = context.createDynamicsCompressor();
  node.threshold.value = -10;
  node.knee.value = 6;
  node.ratio.value = 8;
  node.attack.value = 0.003;
  node.release.value = 0.15;
  node.connect(context.destination);
  return node;
}

/** Plays one tone of a sound into `out`, starting `now` plus its `at`. */
function playTone(context: BaseAudioContext, out: AudioNode, noise: AudioBuffer, tone: Tone, now: number): void {
  const start = now + (tone.at ?? 0);
  const end = start + tone.attack + tone.decay;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(tone.gain / 100, start + tone.attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  gain.connect(out);
  let source: AudioScheduledSourceNode;
  let into: AudioNode = gain;
  if (tone.wave === 'noise') {
    const buffer = context.createBufferSource();
    buffer.buffer = noise;
    buffer.loop = true;
    const band = context.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = tone.q ?? 1;
    glide(band.frequency, tone, start, end);
    band.connect(into);
    buffer.connect(band);
    source = buffer;
  } else {
    if (tone.lowpass !== undefined) {
      const low = context.createBiquadFilter();
      low.type = 'lowpass';
      low.frequency.value = tone.lowpass;
      low.connect(into);
      into = low;
    }
    const oscillator = context.createOscillator();
    oscillator.type = tone.wave;
    glide(oscillator.frequency, tone, start, end);
    oscillator.connect(into);
    source = oscillator;
  }
  source.start(start);
  source.stop(end + 0.02);
  source.onended = () => gain.disconnect();
}

/**
 * One of the interface's sounds rendered offline at full volume, as it would play: for listening to
 * each in turn, and for checking how loud it is.
 */
export function renderCue(name: Cue, sampleRate = 44100): Promise<AudioBuffer> {
  const sound = CUES[name];
  const context = new OfflineAudioContext(1, Math.ceil((cueLength(sound) + 0.1) * sampleRate), sampleRate);
  const out = context.createGain();
  out.connect(limiter(context));
  const noise = noiseBuffer(context);
  for (const tone of sound.tones) playTone(context, out, noise, tone, 0);
  return context.startRendering();
}

/** Sets a pitch or a band's centre, gliding to `to` by the tone's end if it has one. */
function glide(param: AudioParam, tone: Tone, start: number, end: number): void {
  param.setValueAtTime(tone.hz, start);
  if (tone.to !== undefined) param.exponentialRampToValueAtTime(tone.to, end);
}

/** A second of white noise, looped by the sounds that use it. */
function noiseBuffer(context: BaseAudioContext): AudioBuffer {
  const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}
