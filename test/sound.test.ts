/**
 * The game's door to artshape-sound, held to what it hands the package. The package's Audio is replaced here by one
 * that writes down what it was asked, because a real one needs a browser's AudioContext, and the sound itself is the
 * package's to hold and is heard in the smoke tests; its Player and Ambience are the real ones, driven over the stand-in.
 * What is held: the golf sounds are sounds the package takes, cheap enough to load one a frame; they load one a step,
 * the first shot's first, and none is played before it is loaded; each event plays the sounds it should, as loud as it
 * should; the music moves only while a menu is up, and the ambience only on the course; and the setting goes in and
 * comes out unchanged, kept while there is no context.
 */
import { checkLayered, renderLayered } from 'artshape-sound/layers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BAG, PUTTER } from '../src/bag';
import { seeded } from '../src/random';

interface Asked {
  name: string;
  gain: number;
  pitch: number;
  later: boolean;
}
const asked = vi.hoisted(() => ({ loads: [] as string[], plays: [] as Asked[], loops: 0, made: [] as unknown[] }));

vi.mock('artshape-sound/audio', async (real) => ({
  // the package's constants, which its player reads, are the real ones
  ...(await real<typeof import('artshape-sound/audio')>()),
  Audio: class {
    volume: number;
    muted: boolean;
    time = 10;
    voices = 0;
    loops = 0;
    private readonly names = new Set<string>();
    constructor(options: { volume?: number; muted?: boolean }) {
      asked.made.push(options);
      this.volume = options.volume ?? 1;
      this.muted = options.muted ?? false;
    }
    load(name: string) {
      asked.loads.push(name);
      this.names.add(name);
    }
    play(name: string, options: { gain?: number; pitch?: number; at?: number } = {}) {
      // as the real one does: a name not loaded is a mistake, thrown by name
      if (!this.names.has(name)) throw new Error(`no sound named "${name}"`);
      asked.plays.push({ name, gain: options.gain ?? 1, pitch: options.pitch ?? 1, later: options.at !== undefined });
      this.voices++;
    }
    loop(name: string) {
      if (!this.names.has(name)) throw new Error(`no sound named "${name}"`);
      asked.loops++;
      this.loops++;
      return {
        stop: () => {
          this.loops--;
        },
        gain: 1,
        playing: true,
      };
    }
    resume() {
      return Promise.resolve();
    }
    mute(on: boolean) {
      this.muted = on;
    }
  },
}));

const { GOLF, GameSound, LazySound, strikeOf } = await import('../src/sound');
const context = {} as BaseAudioContext;
const made = (setting = { volume: 1, muted: false }) => new GameSound({ context, random: seeded(3), ...setting });
/** A sound with everything loaded: as many steps as there are sounds. */
const loadedSound = () => {
  const sound = made();
  for (let k = 0; k < sound.state.queued; k++) sound.step(0, true);
  asked.plays.length = 0;
  return sound;
};
const names = () => asked.plays.map((p) => p.name);

beforeEach(() => {
  asked.loads.length = 0;
  asked.plays.length = 0;
  asked.loops = 0;
  asked.made.length = 0;
});

describe('the golf sounds', () => {
  for (const [name, sound] of Object.entries(GOLF))
    it(`${name} is a sound the package takes, rendered inside the package's budget`, () => {
      expect(checkLayered(sound)).toBe(null);
      const random = seeded(1);
      renderLayered(sound, 48000, random);
      // the fastest of a few, as the package's bench takes it, so the figure is the work and not the machine's hiccup
      let fastest = Infinity;
      for (let k = 0; k < 5; k++) {
        const t = performance.now();
        renderLayered(sound, 48000, random);
        fastest = Math.min(fastest, performance.now() - t);
      }
      // the package's hard budget for a sound, 10 ms: each renders in under 3 ms in node on a quiet machine (the spring,
      // the dearest, 2.8 on 18 October 2026), and over 4 beside the quick check's other workers, so the ceiling here catches a
      // sound grown several times dearer and not the machine's load; what a load costs the player is the smoke test's
      expect(fastest).toBeLessThan(10);
    });

  it('strikes as the club is: the woods ping, the irons click, the wedges, and a club of no loft putts', () => {
    expect(BAG.map((c) => strikeOf(c))).toEqual(['wood', 'wood', 'iron', 'iron', 'iron', 'wedge', 'wedge', 'putter']);
    expect(strikeOf(PUTTER)).toBe('putter');
  });
});

describe('the game sound', () => {
  it('loads one sound a step, the putt and the strikes first, and the music last', () => {
    const sound = made();
    sound.step(1 / 60, true);
    expect(asked.loads).toEqual(['putt']);
    for (let k = 0; k < 3; k++) sound.step(1 / 60, true);
    expect(asked.loads).toEqual(['putt', 'strike-iron', 'strike-wood', 'strike-wedge']);
    while (sound.state.loaded < sound.state.queued) sound.step(1 / 60, true);
    // the music's player loads its voices when it is made, in that last step
    expect(asked.loads.slice(0, 16)).toContain('wind');
    expect(asked.loads.slice(16).every((n) => n.startsWith('song'))).toBe(true);
    const all = asked.loads.length;
    sound.step(1 / 60, true);
    expect(asked.loads.length, 'nothing is loaded twice').toBe(all);
  });

  it('loads a sound dear to load only while the screen is still, and the cheap ones after it meanwhile', () => {
    const sound = made();
    // the ball rolling: the strikes, the splash, the applause, the bell, the wind and the music wait
    for (let k = 0; k < 40; k++) sound.step(1 / 60, false);
    const dear = ['strike-iron', 'strike-wood', 'strike-wedge', 'splash', 'applause', 'bell', 'wind'];
    expect(asked.loads.filter((n) => dear.includes(n))).toEqual([]);
    expect(asked.loads.some((n) => n.startsWith('song'))).toBe(false);
    expect(sound.state.loaded).toBe(sound.state.queued - 8);
    // at rest, one a step, in their order
    sound.step(1 / 60, true);
    expect(asked.loads.at(-1)).toBe('strike-iron');
    for (let k = 0; k < 7; k++) sound.step(1 / 60, true);
    expect(sound.state.loaded).toBe(sound.state.queued);
  });

  it('plays nothing it has not loaded yet, and throws for none of it', () => {
    const sound = made();
    sound.step(0, true);
    sound.struck('iron', 1, true);
    sound.holed(1, 3);
    sound.splashed();
    sound.lost(false);
    sound.knocked(30, 6, true);
    sound.landed(1, false);
    expect(names()).toEqual([]);
    sound.struck('putter', 1, false);
    expect(names()).toEqual(['putt']);
  });

  it('strikes louder the harder the swing, and a bunker shot throws sand', () => {
    const sound = loadedSound();
    sound.struck('wood', 1, false);
    sound.struck('wood', 0.25, false);
    sound.struck('wedge', 0.8, true);
    sound.struck('putter', 0.1, false);
    expect(names()).toEqual(['strike-wood', 'strike-wood', 'strike-wedge', 'sand', 'putt']);
    const [full, quarter] = asked.plays;
    expect(full.gain).toBeCloseTo(1);
    expect(quarter.gain).toBeLessThan(full.gain);
    expect(quarter.gain).toBeGreaterThan(0.3);
    // a repeat is a hair higher or lower, never far
    for (const p of asked.plays) expect(Math.abs(p.pitch - 1)).toBeLessThan(0.031);
  });

  it('lands on turf with a hop and plugs in sand, louder the faster it came down', () => {
    const sound = loadedSound();
    sound.landed(1, false);
    sound.landed(0.2, false);
    sound.landed(0.5, true);
    expect(names()).toEqual(['land', 'land', 'land-sand']);
    expect(asked.plays[1].gain).toBeLessThan(asked.plays[0].gain);
  });

  it('knocks as wood, louder the harder, from the softest knock told of; a kicker springs too', () => {
    const sound = loadedSound();
    sound.knocked(6, 6, false);
    sound.knocked(30, 6, false);
    sound.knocked(200, 6, true);
    expect(names()).toEqual(['wood', 'wood', 'wood', 'spring']);
    const [soft, mid, hard] = asked.plays.map((p) => p.gain);
    expect(soft).toBeCloseTo(0.12);
    expect(mid).toBeGreaterThan(soft);
    expect(hard).toBe(1);
  });

  it('rattles the cup for every ball holed, and a run up the marimba as good as the score', () => {
    const sound = loadedSound();
    const after = (strokes: number, par: number) => {
      asked.plays.length = 0;
      sound.holed(strokes, par);
      return names();
    };
    expect(after(4, 4)).toEqual(['cup', 'marimba', 'marimba']);
    expect(after(3, 4)).toEqual(['cup', 'marimba', 'marimba', 'marimba', 'marimba', 'applause']);
    expect(after(1, 3)).toEqual([
      'cup',
      ...Array<string>(6).fill('marimba'),
      ...Array<string>(3).fill('bell'),
      'applause',
    ]);
    // the cup at once and the rest after it, on the audio clock
    expect(asked.plays[0].later).toBe(false);
    expect(asked.plays.slice(1).every((p) => p.later)).toBe(true);
    // the run climbs
    const run = asked.plays.filter((p) => p.name === 'marimba').map((p) => p.pitch);
    expect(run[5]).toBeGreaterThan(run[0] * 1.5);
    expect(after(7, 4), 'over par is still holed').toEqual(['cup', 'marimba', 'marimba']);
  });

  it('splashes into water, and falls two notes for a ball lost or picked up, the pick-up lower', () => {
    const sound = loadedSound();
    sound.splashed();
    sound.lost(false);
    sound.lost(true);
    expect(names()).toEqual(['splash', 'marimba', 'marimba', 'marimba', 'marimba']);
    const [, a, b, c, d] = asked.plays.map((p) => p.pitch);
    expect(b).toBeLessThan(a);
    expect(d).toBeLessThan(c);
    expect(c).toBeLessThan(a);
  });

  it('plays the music only while a menu is up and the game steps, and it waits where it was', () => {
    const sound = loadedSound();
    for (let k = 0; k < 60; k++) sound.step(1 / 60, true);
    expect(sound.state.beat).toBe(0);
    sound.setMusic(true);
    for (let k = 0; k < 60; k++) sound.step(1 / 60, true);
    const beat = sound.state.beat;
    expect(beat).toBeCloseTo(82 / 60, 5);
    sound.setMusic(false);
    for (let k = 0; k < 60; k++) sound.step(1 / 60, true);
    expect(sound.state.beat).toBe(beat);
  });

  it('starts the wind and birds on the course, as loud as the hole is windy, and stops them off it', () => {
    const sound = made();
    // asked for before the wind is loaded: it starts once it is
    sound.setAmbience(true, 15);
    while (sound.state.loaded < sound.state.queued) sound.step(1 / 60, true);
    for (let k = 0; k < 10; k++) sound.step(1 / 60, true);
    expect(sound.state.loops).toBe(1);
    sound.setAmbience(false, 15);
    expect(sound.state.loops).toBe(0);
    sound.setAmbience(true, 4);
    for (let k = 0; k < 10; k++) sound.step(1 / 60, true);
    expect(sound.state.loops).toBe(1);
    // the birds call now and then, on the course and not off it
    asked.plays.length = 0;
    for (let k = 0; k < 60 * 30; k++) sound.step(1 / 60, true);
    expect(names().filter((n) => n === 'birds').length).toBeGreaterThan(0);
    sound.setAmbience(false, 4);
    asked.plays.length = 0;
    for (let k = 0; k < 60 * 30; k++) sound.step(1 / 60, true);
    expect(names()).toEqual([]);
  });

  it('takes the save’s volume and mute, and hands them back', () => {
    const sound = made({ volume: 0.4, muted: true });
    expect(asked.made).toEqual([{ context, random: expect.any(Function) as unknown, volume: 0.4, muted: true }]);
    expect([sound.volume, sound.muted]).toEqual([0.4, true]);
    sound.mute(false);
    sound.volume = 0.7;
    expect([sound.volume, sound.muted]).toEqual([0.7, false]);
  });
});

describe('the sound made on the first gesture', () => {
  it('is a silence until woken, keeping the setting and what the page asked for, and hands them over once', () => {
    let makes = 0;
    const lazy = new LazySound({
      volume: 0.5,
      muted: false,
      make: (setting) => {
        makes++;
        return made(setting);
      },
    });
    lazy.struck('iron', 1, false);
    lazy.holed(1, 3);
    lazy.step(1 / 60, true);
    lazy.mute(true);
    lazy.volume = 0.25;
    lazy.setMusic(true);
    expect(lazy.state).toMatchObject({ awake: false, muted: true, volume: 0.25, loaded: 0, music: true });
    expect(asked.made).toEqual([]);
    lazy.wake();
    lazy.wake();
    expect(makes).toBe(1);
    expect(lazy.state).toMatchObject({ awake: true, muted: true, volume: 0.25, music: true });
    expect(asked.made).toEqual([expect.objectContaining({ volume: 0.25, muted: true })]);
    // woken, the putt is loaded at once, so a first gesture that is a putt is heard
    expect(asked.loads).toEqual(['putt']);
    lazy.struck('putter', 1, false);
    expect(names()).toEqual(['putt']);
  });
});
