/**
 * The game's door to artshape-sound, held to what it hands the package. The package's Audio is replaced here by one
 * that writes down what it was asked, because a real one needs a browser's AudioContext, and the sound itself is the
 * package's to hold and is heard in the smoke tests; its Player and Ambience are the real ones, driven over the stand-in.
 * What is held: the golf sounds are sounds the package takes, cheap enough to load one a frame; they load one a step,
 * the first shot's first, and none is played before it is loaded; each event plays the sounds it should, as loud as it
 * should; the music moves only while a menu is up; and the setting goes in and
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
const asked = vi.hoisted(() => ({ loads: [] as string[], plays: [] as Asked[], made: [] as unknown[] }));

vi.mock('artshape-sound/audio', async (real) => ({
  // the package's constants, which its player reads, are the real ones
  ...(await real<typeof import('artshape-sound/audio')>()),
  Audio: class {
    volume: number;
    muted: boolean;
    time = 10;
    voices = 0;
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
    expect(asked.loads.slice(0, 14)).toContain('applause');
    expect(asked.loads.slice(14).every((n) => n.startsWith('song'))).toBe(true);
    // the place's own sounds, which nothing seen answered, are gone
    expect(asked.loads.filter((n) => n === 'wind' || n === 'birds')).toEqual([]);
    const all = asked.loads.length;
    sound.step(1 / 60, true);
    expect(asked.loads.length, 'nothing is loaded twice').toBe(all);
  });

  it('loads a sound dear to load only while the screen is still, and the cheap ones after it meanwhile', () => {
    const sound = made();
    // the ball rolling: the strikes, the splash, the applause, the bell and the music wait
    for (let k = 0; k < 40; k++) sound.step(1 / 60, false);
    const dear = ['strike-iron', 'strike-wood', 'strike-wedge', 'splash', 'applause', 'bell'];
    expect(asked.loads.filter((n) => dear.includes(n))).toEqual([]);
    expect(asked.loads.some((n) => n.startsWith('song'))).toBe(false);
    expect(sound.state.loaded).toBe(sound.state.queued - 7);
    // at rest, one a step, in their order
    sound.step(1 / 60, true);
    expect(asked.loads.at(-1)).toBe('strike-iron');
    for (let k = 0; k < 6; k++) sound.step(1 / 60, true);
    expect(sound.state.loaded).toBe(sound.state.queued);
  });

  it('plays nothing it has not loaded yet, and throws for none of it', () => {
    const sound = made();
    sound.step(0, true);
    sound.struck('iron', 1, true);
    sound.holed(1, 3);
    sound.lipped();
    sound.longPutt();
    sound.chippedIn();
    sound.longDrive();
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
    const marimba = (strokes: number, par: number) => {
      after(strokes, par);
      return asked.plays.filter((p) => p.name === 'marimba');
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
    expect(after(7, 4), 'over par is still holed, with the cup first').toEqual(['cup', 'marimba', 'marimba']);
    // an eagle is fuller than a birdie: more notes, a bell, and the applause louder, short of the ace's
    const eagle = after(2, 4);
    expect(eagle.filter((n) => n === 'marimba').length).toBeGreaterThan(4);
    expect(eagle).toContain('bell');
    const eagleApplause = asked.plays.find((p) => p.name === 'applause')!.gain;
    after(3, 4);
    const birdieApplause = asked.plays.find((p) => p.name === 'applause')!.gain;
    after(1, 4);
    const aceApplause = asked.plays.find((p) => p.name === 'applause')!.gain;
    expect(birdieApplause).toBeLessThan(eagleApplause);
    expect(eagleApplause).toBeLessThan(aceApplause);
    // a bogey falls where a par rises, and is quieter and lower
    const par = marimba(4, 4);
    const bogey = marimba(5, 4);
    expect(par[1].pitch).toBeGreaterThan(par[0].pitch);
    expect(bogey[1].pitch).toBeLessThan(bogey[0].pitch);
    expect(bogey[0].gain).toBeLessThan(par[0].gain);
    expect(Math.max(...bogey.map((p) => p.pitch))).toBeLessThan(Math.min(...par.map((p) => p.pitch)));
  });

  it('answers a hole five ways: an ace, an eagle or better, a birdie, a par and over par, each its own', () => {
    // each from a sound of its own, so that the same chance is behind each and a difference is the score's
    const answer = (strokes: number, par: number) => {
      const sound = loadedSound();
      sound.holed(strokes, par);
      return JSON.stringify(asked.plays);
    };
    const five = [answer(1, 4), answer(2, 4), answer(3, 4), answer(4, 4), answer(5, 4)];
    expect(new Set(five).size).toBe(5);
    // an albatross is as an eagle and a double bogey as a bogey, and a birdie on a hole of five as one on a hole of three
    expect(answer(2, 5)).toBe(answer(2, 4));
    expect(answer(6, 4)).toBe(answer(5, 4));
    expect(answer(2, 3)).toBe(answer(3, 4));
    expect(answer(3, 3)).toBe(answer(4, 4));
    // two under is the line: one under is a birdie
    expect(answer(3, 5)).toBe(answer(2, 4));
    expect(answer(4, 5)).toBe(answer(3, 4));
  });

  it('asks for something of its own for a lip-out, a long putt, a chip-in and a long drive, from sounds in the queue', () => {
    const sound = loadedSound();
    const each: [string, () => void][] = [
      ['lipped', () => sound.lipped()],
      ['longPutt', () => sound.longPutt()],
      ['chippedIn', () => sound.chippedIn()],
      ['longDrive', () => sound.longDrive()],
    ];
    const lists = each.map(([name, ask]) => {
      asked.plays.length = 0;
      ask();
      expect(asked.plays.length, name).toBeGreaterThan(0);
      for (const p of asked.plays) {
        expect(asked.loads, `${name} plays ${p.name}`).toContain(p.name);
        expect(p.gain, name).toBeGreaterThan(0);
        expect(p.gain, name).toBeLessThanOrEqual(1);
      }
      return JSON.stringify(asked.plays);
    });
    expect(new Set(lists).size, 'four different answers').toBe(4);
  });

  it('keeps a long putt or a chip-in from doubling the applause of the hole it comes before', () => {
    const sound = loadedSound();
    for (const ask of [() => sound.longPutt(), () => sound.chippedIn()]) {
      asked.plays.length = 0;
      ask();
      sound.holed(3, 4);
      expect(
        names().filter((n) => n === 'applause'),
        'one applause, the hole’s',
      ).toHaveLength(1);
      // the cheer comes first, so what the hole plays after it sits over it
      expect(asked.plays.findIndex((p) => p.name === 'cup')).toBeGreaterThan(0);
    }
    // a drive is not applauded: the ball is still running
    asked.plays.length = 0;
    sound.longDrive();
    expect(names()).not.toContain('applause');
    // a lip-out is a miss: no marimba run up
    asked.plays.length = 0;
    sound.lipped();
    expect(names()).not.toContain('applause');
    expect(asked.plays.every((p) => p.gain < 0.6)).toBe(true);
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
    lazy.lipped();
    lazy.longPutt();
    lazy.chippedIn();
    lazy.longDrive();
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
