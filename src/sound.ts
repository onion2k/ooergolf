/**
 * The sound is a package of its own, artshape-sound, which knows nothing of golf: a layered sound is a list of numbers,
 * a song a tempo and a pattern, and what the game hears is whichever it asks for by name. This is the game's side of it:
 * the golf sounds (a club meeting the ball, a putt, a ball landing, the cup), the stock ones it takes as they are (wood,
 * a marimba, a bell, a splash, applause, wind and birds), the menus' music and the course's ambience. Everything the
 * game makes a noise with goes through here, so the package stays behind one door, and a change it needs goes in its own
 * repo with a version bump here. It knows nothing of the page: the context, the first gesture and the buttons are
 * main.ts's.
 *
 * Rendering every sound at once would cost tens of milliseconds in one frame, so `GameSound` loads one a step, the
 * strikes and the putt first, and a sound not yet loaded is a silence. `LazySound` is what the page holds: the context
 * is dear to make and silent until a gesture anyway, so the `GameSound` is made when the player first acts, and until
 * then the save's mute and volume are kept here. Without it the boot gate would measure a cost the player never waits on.
 */
import { Ambience } from 'artshape-sound/ambience';
import { Audio, type LoadOptions } from 'artshape-sound/audio';
import type { Layered } from 'artshape-sound/layers';
import { Player } from 'artshape-sound/player';
import { applause, bell, birds, marimba, splash, wind, wood, WIND_SECONDS } from 'artshape-sound/sounds';
import { lounge } from 'artshape-sound/songs';
import { isWedge, isWood, type BagClub } from './bag';

/** What a strike sounds like, by the club: the woods' hollow ping, the irons' click, the wedges' shorter one, a putt. */
export type Strike = 'wood' | 'iron' | 'wedge' | 'putter';

/** The sound a club strikes with: a club of no loft putts, as the minigolf's putters do, whatever the kit has made of it. */
export function strikeOf(club: BagClub): Strike {
  if (club.loft === 0) return 'putter';
  if (isWood(club)) return 'wood';
  return isWedge(club) ? 'wedge' : 'iron';
}

/** The club face's ringing, a thump of the ball compressing, and turf for a club that takes some. */
function strike(face: [number, number, number][], thump: [number, number], turf: number): Layered {
  return {
    volume: 0.8,
    jitter: 0.03,
    layers: [
      { kind: 'noise', at: 0, gain: 0.8, filter: 'highpass', f: 3000, decay: 0.003 },
      { kind: 'modes', at: 0, gain: 1, modes: face },
      { kind: 'tone', at: 0, gain: 0.55, f: thump[0], fEnd: thump[1], glide: 0.02, decay: 0.028 },
      ...(turf > 0 ? [{ kind: 'noise' as const, at: 0.006, gain: turf, f: 1100, fEnd: 500, decay: 0.07 }] : []),
      // the follow-through: air past the shaft, which a full swing makes and a chip barely does (the gain of a play)
      {
        kind: 'noise',
        at: 0.02,
        gain: 0.25,
        filter: 'bandpass',
        f: 700,
        fEnd: 2200,
        q: 1.3,
        attack: 0.06,
        decay: 0.12,
      },
    ],
  };
}

/** The golf sounds the stock ones do not cover, each a Layered from the numbers the user heard and agreed. */
export const GOLF = {
  // titanium, hollow: a ringing ping high up
  'strike-wood': strike(
    [
      [2900, 0.05, 0.22],
      [4300, 0.035, 0.16],
      [6100, 0.02, 0.1],
      [1550, 0.03, 0.1],
    ],
    [210, 120],
    0,
  ),
  // forged steel: a short, solid click, and the turf after it
  'strike-iron': strike(
    [
      [2200, 0.018, 0.28],
      [3600, 0.012, 0.18],
      [5200, 0.008, 0.1],
    ],
    [160, 90],
    0.3,
  ),
  'strike-wedge': strike(
    [
      [2500, 0.013, 0.22],
      [4000, 0.009, 0.14],
    ],
    [180, 100],
    0.45,
  ),
  // the putter: a soft tock
  putt: {
    volume: 0.6,
    jitter: 0.02,
    layers: [
      { kind: 'noise', at: 0, gain: 0.35, filter: 'highpass', f: 2000, decay: 0.002 },
      {
        kind: 'modes',
        at: 0,
        gain: 1,
        modes: [
          [1150, 0.012, 0.32],
          [2450, 0.008, 0.18],
          [3900, 0.005, 0.08],
        ],
      },
      { kind: 'tone', at: 0, gain: 0.3, f: 270, fEnd: 210, decay: 0.016 },
    ],
  },
  // the sand a bunker shot throws: a dull whump and a spray of grains, played under the wedge's strike
  sand: {
    volume: 0.7,
    layers: [
      { kind: 'noise', at: 0.004, gain: 0.7, f: 600, fEnd: 250, decay: 0.12 },
      { kind: 'grains', at: 0.01, gain: 0.5, count: 900, seconds: 0.4, f: 2800, q: 0.7 },
    ],
  },
  // a ball come down on turf: a thud, a rustle, and the hops after it, each smaller and sooner
  land: {
    volume: 0.7,
    layers: [
      {
        kind: 'bounces',
        at: 0,
        gain: 1,
        count: 3,
        gap: 0.24,
        shrink: 0.67,
        fade: 0.35,
        layers: [
          { kind: 'tone', at: 0, gain: 0.6, f: 115, fEnd: 55, glide: 0.03, decay: 0.05 },
          { kind: 'noise', at: 0, gain: 0.45, f: 700, decay: 0.035 },
          { kind: 'noise', at: 0, gain: 0.08, filter: 'highpass', f: 2800, attack: 0.004, decay: 0.05 },
        ],
      },
    ],
  },
  // a ball come down in a bunker: it plugs, so a whump and grains and no hop
  'land-sand': {
    volume: 0.6,
    layers: [
      { kind: 'noise', at: 0, gain: 0.7, f: 500, fEnd: 200, decay: 0.09 },
      { kind: 'grains', at: 0.004, gain: 0.35, count: 300, seconds: 0.18, f: 2600, q: 0.8 },
    ],
  },
  // a ball into the cup: the drop onto the bottom, then its bounces, lower and sooner, a plastic cup ringing at each, and
  // the roll round the bottom as it settles
  cup: {
    volume: 0.8,
    layers: [
      { kind: 'tone', at: 0, gain: 0.35, f: 190, fEnd: 120, decay: 0.03 },
      {
        kind: 'bounces',
        at: 0,
        gain: 1,
        count: 8,
        gap: 0.085,
        shrink: 0.68,
        fade: 0.62,
        scatter: 0.08,
        layers: [
          { kind: 'noise', at: 0, gain: 0.4, filter: 'highpass', f: 2500, decay: 0.0015 },
          {
            kind: 'modes',
            at: 0,
            gain: 1,
            modes: [
              [820, 0.03, 0.3],
              [1650, 0.02, 0.2],
              [2780, 0.012, 0.14],
              [4100, 0.008, 0.07],
            ],
          },
        ],
      },
      { kind: 'noise', at: 0.25, gain: 0.08, filter: 'bandpass', f: 900, q: 2, attack: 0.02, decay: 0.08 },
    ],
  },
  // the kicker's spring, under the wood of its face
  spring: {
    volume: 0.5,
    layers: [
      { kind: 'tone', at: 0.004, gain: 0.25, f: 300, fEnd: 240, decay: 0.18, vibrato: { rate: 22, depth: 0.12 } },
      {
        kind: 'modes',
        at: 0.004,
        gain: 0.1,
        modes: [
          [620, 0.2, 0.08],
          [1890, 0.09, 0.04],
        ],
      },
    ],
  },
} satisfies Record<string, Layered>;

/**
 * One load: a sound, or the menus' song (`sound` none), whose player loads its voices when it is made. A `dear` one is
 * loaded only while the screen is still, a menu up or the ball at rest, so the frame it costs is one nobody sees move.
 * Dear are those that took 4 ms or more to load in headless Chromium on 18 October 2026, against a frame's budget of 6:
 * the splash 5, the applause 6, the menus' music 8, the wind's loop 10, the bell 3.6 to 4.8, and the first strike to load
 * 3.8 to 5.3, whichever it was (the strikes are dear in any case at no cost: a ball is struck only at rest). What loads
 * while the ball moves took 3.8 ms at most, the first of them, which pays the browser's warm-up.
 */
interface Load {
  name: string;
  sound?: Layered;
  options?: LoadOptions;
  dear?: boolean;
}

/**
 * The order the sounds are loaded in, one a step: what the first shot needs first, the cup and the losses next, and the
 * ambience and the music, which can wait a moment, last. A dear one waits for a still screen, and the cheap ones after it
 * go on loading meanwhile.
 */
const QUEUE: readonly Load[] = [
  { name: 'putt', sound: GOLF.putt },
  { name: 'strike-iron', sound: GOLF['strike-iron'], dear: true },
  { name: 'strike-wood', sound: GOLF['strike-wood'], dear: true },
  { name: 'strike-wedge', sound: GOLF['strike-wedge'], dear: true },
  { name: 'land', sound: GOLF.land },
  { name: 'wood', sound: wood },
  { name: 'cup', sound: GOLF.cup },
  { name: 'marimba', sound: marimba },
  { name: 'splash', sound: splash, dear: true },
  { name: 'sand', sound: GOLF.sand },
  { name: 'land-sand', sound: GOLF['land-sand'] },
  { name: 'spring', sound: GOLF.spring },
  { name: 'applause', sound: applause, dear: true },
  { name: 'bell', sound: bell, dear: true },
  { name: 'birds', sound: birds },
  { name: 'wind', sound: wind, options: { loop: WIND_SECONDS }, dear: true },
  { name: 'music', dear: true },
];

/** The marimba is rendered at C5; a note is played by bending it, and the MIDI numbers here say which. */
const C5 = 72;
const bend = (note: number) => 2 ** ((note - C5) / 12);

/** The strongest wind of any hole, in the course files' own units: the ambience's bed is loudest there. */
const STRONGEST_WIND = 15;

export interface SoundOptions {
  /** The page's own AudioContext, so that which one the browser has is the page's to say. */
  context: BaseAudioContext;
  /** Chance for the sounds' takes and small variations: its own source, never the game's. */
  random: () => number;
  volume: number;
  muted: boolean;
  /** A clock for timing each load, for the test API; none, and nothing is timed. */
  now?: () => number;
}

/** What a test reads of the sound. */
export interface SoundState {
  /** Whether the context has been made, on the first gesture. */
  awake: boolean;
  muted: boolean;
  volume: number;
  /** Sounds playing now, the music's notes among them; the loops (the wind) are not voices. */
  voices: number;
  /** Loops playing now: the wind's bed, while the ambience is on. */
  loops: number;
  /** Of the sounds to load, how many are, and how many there are. */
  loaded: number;
  queued: number;
  /** The longest a single load took, in milliseconds, by the clock handed in, and which it was. */
  slowestLoadMs: number;
  slowestLoad: string;
  /** What each load took, in milliseconds, by its name: as many as there are sounds, and no more. */
  loadMs: Record<string, number>;
  /** Where the menus' music is, in beats from its start: it moves only while a menu is up and the game is stepped. */
  beat: number;
  /** Whether the menus' music and the course's ambience are asked for now. */
  music: boolean;
  ambience: boolean;
}

export class GameSound {
  private readonly audio: Audio;
  private readonly random: () => number;
  private readonly now: (() => number) | undefined;
  private readonly loaded = new Set<string>();
  /** Which of the queue are loaded, by their place in it. */
  private readonly done = new Set<number>();
  private slowest = 0;
  private slowestName = '';
  private readonly took: Record<string, number> = {};
  private player: Player | null = null;
  private place: Ambience | null = null;
  private musicOn = false;
  private ambienceOn = false;
  private windy = 0;

  constructor({ context, random, volume, muted, now }: SoundOptions) {
    this.audio = new Audio({ context, random, volume, muted });
    this.random = random;
    this.now = now;
  }

  /** The next sound loaded, if there is one: one a step, so that no frame renders more than one, and a dear one only on a still screen. */
  private loadOne(still: boolean) {
    const at = QUEUE.findIndex((load, i) => !this.done.has(i) && (still || !load.dear));
    if (at < 0) return;
    this.done.add(at);
    const load = QUEUE[at];
    const started = this.now?.() ?? 0;
    if (!load.sound) this.player = new Player(this.audio, lounge);
    else {
      this.audio.load(load.name, load.sound, load.options);
      this.loaded.add(load.name);
    }
    const took = this.now ? this.now() - started : 0;
    const { name } = load;
    this.took[name] = took;
    if (took > this.slowest) [this.slowest, this.slowestName] = [took, name];
    if (this.loaded.has('wind') && this.loaded.has('birds') && !this.place) {
      this.place = new Ambience(this.audio, { random: this.random, bed: 'wind', calls: ['birds'], callGain: 0.6 });
      this.setAmbience(this.ambienceOn, this.windy);
    }
  }

  /** A sound, if it is loaded yet, a hair higher or lower each time, so a repeat is not the same twice. */
  private play(name: string, gain = 1, pitch = 1, later = 0) {
    if (!this.loaded.has(name) || gain <= 0) return;
    const wobble = 0.97 + 0.06 * this.random();
    this.audio.play(name, { gain, pitch: pitch * wobble, at: later > 0 ? this.audio.time + later : undefined });
  }

  /** The ball struck with `power` of the hardest shot, by a club that strikes as `kind` does, from sand or not. */
  struck(kind: Strike, power: number, sand: boolean) {
    const gain = 0.35 + 0.65 * Math.sqrt(power);
    if (kind === 'putter') this.play('putt', 0.25 + 0.75 * power);
    else this.play(`strike-${kind}`, gain);
    if (sand) this.play('sand', 0.9);
  }

  /** A lofted ball come down, going `speed` into the ground (its share of a full shot's, 0 to 1), on turf or in sand. */
  landed(speed: number, sand: boolean) {
    if (sand) this.play('land-sand', 0.4 + 0.6 * speed);
    else this.play('land', 0.3 + 0.7 * speed);
  }

  /** The ball knocked `hard` units a second (from `least`, the softest told of, and loudest at 60), by a kicker or not. */
  knocked(hard: number, least: number, kicker: boolean) {
    this.play('wood', Math.min(1, 0.12 + (0.88 * (hard - least)) / (60 - least)));
    if (kicker) this.play('spring', 0.8);
  }

  /** The ball in the cup in `strokes` on a hole of `par`: the rattle, and a run up the marimba as good as the score. */
  holed(strokes: number, par: number) {
    this.play('cup');
    if (strokes === 1) {
      [72, 76, 79, 83, 84, 88].forEach((n, i) => this.play('marimba', 0.5, bend(n), 0.3 + i * 0.075));
      [96, 100, 103].forEach((n, i) => this.play('bell', 0.25, bend(n - 24), 0.75 + i * 0.12));
      this.play('applause', 0.9, 1, 0.5);
    } else if (strokes < par) {
      [72, 76, 79, 84].forEach((n, i) => this.play('marimba', 0.5, bend(n), 0.3 + i * 0.09));
      this.play('applause', 0.55, 1, 0.55);
    } else {
      this.play('marimba', 0.45, bend(76), 0.3);
      this.play('marimba', 0.45, bend(79), 0.42);
    }
  }

  /** The ball into water. */
  splashed() {
    this.play('splash', 1, 0.85);
  }

  /** The ball lost out of bounds, or picked up at the limit (`low`): two soft notes falling. */
  lost(low: boolean) {
    const [a, b] = low ? [69, 64] : [74, 69];
    this.play('marimba', 0.45, bend(a));
    this.play('marimba', 0.45, bend(b), 0.16);
  }

  /** The menus' music wanted or not: it plays while a menu is up and the game is stepped, and waits where it was. */
  setMusic(on: boolean) {
    this.musicOn = on;
  }

  /** The course's wind and birds wanted or not, the wind as loud as the hole's (`wind`, in the course files' units). */
  setAmbience(on: boolean, wind: number) {
    this.ambienceOn = on;
    this.windy = wind;
    if (!this.place) return;
    this.place.intensity = 0.25 + 0.75 * Math.min(1, Math.max(0, wind) / STRONGEST_WIND);
    if (on) this.place.start();
    else this.place.stop();
  }

  /** On by `dt` seconds of game time: a sound loaded (a dear one only if the screen is `still`), the music if a menu is up, and the ambience. */
  step(dt: number, still: boolean) {
    this.loadOne(still);
    if (this.musicOn) this.player?.step(dt);
    this.place?.step(dt);
  }

  /** Start the context, on the first gesture: a browser keeps it suspended until one. */
  resume() {
    return this.audio.resume();
  }

  mute(on: boolean) {
    this.audio.mute(on);
  }

  get muted() {
    return this.audio.muted;
  }

  get volume() {
    return this.audio.volume;
  }

  set volume(value: number) {
    this.audio.volume = value;
  }

  get state(): Omit<SoundState, 'awake'> {
    return {
      muted: this.audio.muted,
      volume: this.audio.volume,
      voices: this.audio.voices,
      loops: this.audio.loops,
      loaded: this.done.size,
      queued: QUEUE.length,
      slowestLoadMs: this.slowest,
      slowestLoad: this.slowestName,
      loadMs: { ...this.took },
      beat: this.player?.beat ?? 0,
      music: this.musicOn,
      ambience: this.ambienceOn,
    };
  }
}

export interface LazySoundOptions {
  /** What the save says now: they go into the sound when it is made. */
  volume: number;
  muted: boolean;
  /** Makes the sound, and so the context: the page's, since which one the browser has is the page's to say. */
  make: (setting: { volume: number; muted: boolean }) => GameSound;
}

/**
 * The game's sound, made on the first gesture; before it, every sound is a silence and the setting is only kept. What
 * the page asks for meanwhile (the music, the ambience) is kept too, and handed to the sound when it is made.
 */
export class LazySound {
  private sound: GameSound | null = null;
  private muteSetting: boolean;
  private volumeSetting: number;
  private music = false;
  private ambience: [boolean, number] = [false, 0];
  private readonly make: LazySoundOptions['make'];

  constructor({ volume, muted, make }: LazySoundOptions) {
    this.volumeSetting = volume;
    this.muteSetting = muted;
    this.make = make;
  }

  /** Whether the context has been made. */
  get awake() {
    return this.sound !== null;
  }

  /** Make the sound, with the setting as it stands, and start it; once, however often it is asked. */
  wake() {
    if (this.sound) return;
    this.sound = this.make({ volume: this.volumeSetting, muted: this.muteSetting });
    this.sound.setMusic(this.music);
    this.sound.setAmbience(...this.ambience);
    // the browser may refuse to start it from what it does not count as a gesture: the page tries again at the next
    this.sound.resume().catch(() => undefined);
    // the first sound loaded at once, the putt, so that a first gesture that is a putt is heard
    this.sound.step(0, false);
  }

  struck(kind: Strike, power: number, sand: boolean) {
    this.sound?.struck(kind, power, sand);
  }

  landed(speed: number, sand: boolean) {
    this.sound?.landed(speed, sand);
  }

  knocked(hard: number, least: number, kicker: boolean) {
    this.sound?.knocked(hard, least, kicker);
  }

  holed(strokes: number, par: number) {
    this.sound?.holed(strokes, par);
  }

  splashed() {
    this.sound?.splashed();
  }

  lost(low: boolean) {
    this.sound?.lost(low);
  }

  /** Said every frame by the page, so it is passed on only when it changes. */
  setMusic(on: boolean) {
    if (on === this.music) return;
    this.music = on;
    this.sound?.setMusic(on);
  }

  setAmbience(on: boolean, wind: number) {
    if (on === this.ambience[0] && wind === this.ambience[1]) return;
    this.ambience = [on, wind];
    this.sound?.setAmbience(on, wind);
  }

  step(dt: number, still: boolean) {
    this.sound?.step(dt, still);
  }

  mute(on: boolean) {
    this.muteSetting = on;
    this.sound?.mute(on);
  }

  get muted() {
    return this.sound?.muted ?? this.muteSetting;
  }

  get volume() {
    return this.sound?.volume ?? this.volumeSetting;
  }

  set volume(value: number) {
    this.volumeSetting = value;
    if (this.sound) this.sound.volume = value;
  }

  get state(): SoundState {
    const kept = {
      muted: this.muteSetting,
      volume: this.volumeSetting,
      voices: 0,
      loops: 0,
      loaded: 0,
      queued: QUEUE.length,
      slowestLoadMs: 0,
      slowestLoad: '',
      loadMs: {},
      beat: 0,
      music: this.music,
      ambience: this.ambience[0],
    };
    return { awake: this.awake, ...(this.sound?.state ?? kept) };
  }
}
