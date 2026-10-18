/**
 * Saves from every shape the game has ever written, kept in `test/saves`, all
 * still loading and playing. A player's save outlives the code that wrote it.
 *
 * A save whose shape is new needs a file here. The last test sees to that: it
 * fails when the game writes a field no file in the corpus has.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/course';
import { Game } from '../src/game';
import { ITEMS } from '../src/items';
import { checkInvariants } from '../src/invariants';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { seasonContext } from '../src/tours';

const DIR = new URL('saves/', import.meta.url);
const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .sort();
const read = (file: string) => readFileSync(new URL(file, DIR), 'utf8');

/** A save with nothing in it yet, as every field's default makes it. */
const NONE = { club: '', ball: '', accessory: '' };
/** What a save from before the seasons loads its season as: both tours at the club grade, no season begun, no event played, no title. */
const NO_SEASON = {
  golf: { grade: 'club', begun: 0, played: [], titles: 0 },
  mini: { grade: 'club', begun: 0, played: [], titles: 0 },
};
/** What a save from before the caddie loads its tips taken as: none of either kind. */
const NO_TIPS = { club: 0, shape: 0, spin: 0 };
/** What a save from before the career loads its career as: counted in it, as every round was, with no record, no round and no season. */
const CAREER = { mode: 'career', records: {}, round: null, season: NO_SEASON, caddie: NO_TIPS };
/** What a save from before the sound loads its setting as: on, at full volume. */
const NO_SOUND = { muted: false, volume: 1 };
const FRESH = { coins: 0, gems: 0, owned: [], kit: NONE, best: {}, ...CAREER, ...NO_SOUND };

/**
 * What each save loads as. The first is the template's stub's, a bank the
 * game no longer has, and the second the empty save of a course with no
 * cup: both must still load, as a fresh save, with nothing of them kept.
 */
const BEFORE_SOUND: Record<string, Record<string, unknown>> = {
  '01-first.json': FRESH,
  '02-empty.json': FRESH,
  '03-shop.json': {
    ...CAREER,
    coins: 145,
    gems: 2,
    // the putters are not sold any more: neither the ones owned nor the one in hand nor a best's club is kept
    owned: [],
    kit: NONE,
    best: { Straight: { strokes: 1, kit: NONE }, 'Dog-leg': { strokes: 2, kit: NONE } },
  },
  // the eighteen first items were withdrawn on 8 October 2026: the coins, gems and bests stay and the items go
  '04-items.json': {
    ...CAREER,
    coins: 310,
    gems: 3,
    owned: [],
    kit: NONE,
    best: { Straight: { strokes: 1, kit: NONE }, 'Dog-leg': { strokes: 2, kit: NONE } },
  },
  // the three aisles' shape: a mallet, a featherie and a comet owned and worn, and a best made with the mallet and the comet
  '05-kit.json': {
    ...CAREER,
    coins: 220,
    gems: 1,
    owned: ['mallet', 'feather', 'comet'],
    kit: { club: 'mallet', ball: 'feather', accessory: 'comet' },
    best: {
      Straight: { strokes: 1, kit: { club: 'mallet', ball: '', accessory: 'comet' } },
      'Dog-leg': { strokes: 3, kit: NONE },
    },
  },
  // a best on a hole of each of the three courses of 14 October 2026, which an older game keeps by name as any best
  '06-six-courses.json': {
    ...CAREER,
    coins: 90,
    gems: 0,
    owned: [],
    kit: NONE,
    best: {
      'Heather Run': { strokes: 4, kit: NONE },
      'Rookery Walk': { strokes: 5, kit: NONE },
      'The Spectacles': { strokes: 6, kit: NONE },
    },
  },
  // the career of 15 October 2026: free play chosen, a record on two courses and a round of The Heath two holes in (it loads as no round now:
  // a round with no tour is from before there were events)
  '07-career.json': {
    coins: 340,
    gems: 1,
    owned: ['mallet'],
    kit: { club: 'mallet', ball: '', accessory: '' },
    best: {
      Straight: { strokes: 1, kit: NONE },
      'Heather Run': { strokes: 3, kit: { club: 'mallet', ball: '', accessory: '' } },
    },
    mode: 'free',
    records: {
      'The Meadow': { strokes: 19, par: 26, kit: NONE, when: '2026-10-15' },
      'The Heath': { strokes: 31, par: 32, kit: { club: 'mallet', ball: '', accessory: '' }, when: '2026-10-15' },
    },
    // the round kept is from before there were events, so it has none to belong to and is let go; the season starts at the club grade
    season: NO_SEASON,
    round: null,
    caddie: NO_TIPS,
  },
  // the seasons of 15 October 2026: both tours begun, the golf tour at the county grade with an event played and one withdrawn
  // from and an event round kept on its third event (The Fells), the mini tour at the championship with a title and an event played
  '08-season.json': {
    coins: 410,
    gems: 2,
    owned: ['mallet'],
    kit: { club: 'mallet', ball: '', accessory: '' },
    best: {
      Straight: { strokes: 1, kit: NONE },
      'Heather Run': { strokes: 3, kit: { club: 'mallet', ball: '', accessory: '' } },
    },
    mode: 'career',
    records: {
      'The Links': { strokes: 33, par: 36, kit: { club: 'mallet', ball: '', accessory: '' }, when: '2026-10-15' },
      'The Meadow': { strokes: 19, par: 26, kit: NONE, when: '2026-10-15' },
    },
    round: { tour: 'golf', course: 'The Fells', hole: 2, card: [5, 4], retaken: false, pickedUp: false },
    season: {
      golf: { grade: 'county', begun: 2, played: [[4, 5, 3, 4, 4, 3, 5, 4, 4], null], titles: 0 },
      mini: { grade: 'championship', begun: 4, played: [[2, 3, 2, 3, 2, 3, 2, 3, 3]], titles: 1 },
    },
    caddie: NO_TIPS,
  },
  // the caddie of 16 October 2026: two tips of a club taken and three of a shape, so shapes are said only when asked for
  '09-caddie.json': {
    coins: 120,
    gems: 0,
    owned: [],
    kit: NONE,
    best: { 'Heather Run': { strokes: 4, kit: NONE } },
    mode: 'career',
    records: {},
    round: null,
    season: NO_SEASON,
    caddie: { club: 2, shape: 3, spin: 0 },
  },
  // the caddie's spin of 17 October 2026: a tip of spin taken once, beside the two of a club and three of a shape
  '10-caddie-spin.json': {
    coins: 120,
    gems: 0,
    owned: [],
    kit: NONE,
    best: { 'Heather Run': { strokes: 4, kit: NONE } },
    mode: 'career',
    records: {},
    round: null,
    season: NO_SEASON,
    caddie: { club: 2, shape: 3, spin: 1 },
  },
};
const KEPT: Record<string, Record<string, unknown>> = {
  ...Object.fromEntries(Object.entries(BEFORE_SOUND).map(([file, save]) => [file, { ...save, ...NO_SOUND }])),
  // the sound of 18 October 2026: turned off, and the volume at two fifths
  '11-sound.json': { ...BEFORE_SOUND['10-caddie-spin.json'], muted: true, volume: 0.4 },
};

describe('saves from every shape the game has written', () => {
  it('has a file for every shape, oldest first', () => {
    expect(files).toEqual(Object.keys(KEPT).sort());
  });

  for (const file of files) {
    describe(file, () => {
      it('loads with what it kept, and nothing the game no longer knows', () => {
        const save = new Progress(memoryStore(read(file))).save;
        expect(save).toEqual(KEPT[file]);
      });

      it('plays on from where it left off, and breaks no rule', () => {
        const game = new Game(new Progress(memoryStore(read(file))), {}, { random: seeded(7) });
        for (let f = 0; f < 300; f++) game.step(1 / 60);
        expect(checkInvariants(game)).toEqual([]);
      });

      it('comes back as it went, written again in the shape of today', () => {
        const store = memoryStore(read(file));
        const before = new Progress(store).save;
        expect(store.json, 'loading alone must not write').toBe(read(file));
        const game = new Game(new Progress(store), {}, { random: seeded(1) });
        game.persist();
        const after = new Progress(memoryStore(store.json)).save;
        expect(after).toEqual(before);
      });
    });
  }

  it('shrugs at what it cannot read, and at what is not what it should be', () => {
    expect(new Progress(memoryStore('not json')).save).toEqual(FRESH);
    expect(new Progress(memoryStore('[1, 2]')).save).toEqual(FRESH);
    expect(new Progress(memoryStore('{"bank": "lots"}')).save).toEqual(FRESH);
    // coins that are not a whole number of them, a kit of items not owned or no one sells, a best that is nonsense
    const odd = new Progress(
      memoryStore(
        JSON.stringify({
          coins: -4,
          gems: 1.5,
          owned: ['glow', 'glow', 'unheard of', 7],
          kit: { club: 'glove', ball: 7, accessory: 'glow' },
          best: { Straight: { strokes: 0, kit: NONE }, 'Dog-leg': 'two', Nowhere: { strokes: 3 } },
        }),
      ),
    ).save;
    expect(odd).toEqual({ ...FRESH, best: { Nowhere: { strokes: 3, kit: NONE } } });
  });

  it('reads a kit slot only for an owned item of that slot’s own aisle, and refuses the right item in the wrong slot', () => {
    const json = JSON.stringify({
      owned: ['mallet', 'feather', 'comet'],
      kit: { club: 'feather', ball: 'mallet', accessory: 'comet' },
      best: { Straight: { strokes: 2, kit: { club: 'comet', ball: 'feather', accessory: 'mallet' } } },
    });
    const save = new Progress(memoryStore(json)).save;
    expect(save.owned).toEqual(['mallet', 'feather', 'comet']);
    expect(save.kit).toEqual({ club: '', ball: '', accessory: 'comet' });
    expect(save.best.Straight.kit).toEqual({ club: '', ball: 'feather', accessory: '' });
  });

  it('writes all forty-five items and a full kit on every best, and reads it back whole', () => {
    const all = ITEMS.map((i) => i.id);
    const kit = { club: 'gold', ball: 'gem', accessory: 'shoes' };
    const store = memoryStore(
      JSON.stringify({ coins: 9, gems: 3, owned: all, kit, best: { Straight: { strokes: 1, kit } } }),
    );
    const game = new Game(new Progress(store), {}, { random: seeded(1) });
    game.persist();
    const back = new Progress(memoryStore(store.json)).save;
    expect(back.owned).toEqual(all);
    expect(back.kit).toEqual(kit);
    expect(back.best.Straight).toEqual({ strokes: 1, kit });
    expect(store.json!.length, 'the save stays small').toBeLessThan(1200);
  });

  it('keeps the best of a hole no course has any more, The Range’s among them, and the rest of the save, and plays on', () => {
    // a best is kept by the hole's name and an unknown name is carried, not refused: The Range was scrapped on 5 October 2026
    const json = JSON.stringify({
      coins: 60,
      gems: 1,
      owned: ['glow', 'brass'],
      item: 'glow',
      best: { 'Pitch and Putt': { strokes: 2, club: 'putter' }, Straight: { strokes: 1, item: 'glow' } },
    });
    const save = new Progress(memoryStore(json)).save;
    expect(save.best['Pitch and Putt']).toEqual({ strokes: 2, kit: NONE });
    expect(save).toMatchObject({ coins: 60, gems: 1, owned: [], kit: NONE });
    expect(save.best.Straight).toEqual({ strokes: 1, kit: NONE });
    const game = new Game(new Progress(memoryStore(json)), {}, { random: seeded(7) });
    for (let f = 0; f < 300; f++) game.step(1 / 60);
    expect(checkInvariants(game)).toEqual([]);
  });

  it('keeps the bests of the nine holes cut from the minigolf courses on 8 October 2026, each by its name', () => {
    const cut = [
      'Plinko',
      'The Funnel',
      'Turnstile',
      'Whack-a-mole',
      'Carousel',
      'The Lift',
      'Mill Pond',
      'The Island Green',
      'The Lock',
    ];
    const best = Object.fromEntries(cut.map((name, k) => [name, { strokes: 1 + (k % 3), kit: NONE }]));
    const json = JSON.stringify({
      coins: 40,
      gems: 0,
      owned: [],
      kit: NONE,
      best: { ...best, Straight: { strokes: 1, kit: NONE } },
    });
    const save = new Progress(memoryStore(json)).save;
    for (const name of cut) expect(save.best[name], name).toEqual(best[name]);
    expect(save.best.Straight).toEqual({ strokes: 1, kit: NONE });
    const game = new Game(new Progress(memoryStore(json)), {}, { random: seeded(7) });
    for (let f = 0; f < 300; f++) game.step(1 / 60);
    expect(checkInvariants(game)).toEqual([]);
  });

  it('reads a career only as it should be: a known mode, records of whole counts, and a round whose card is its holes', () => {
    const save = new Progress(
      memoryStore(
        JSON.stringify({
          mode: 'ranked',
          records: {
            Good: { strokes: 30, par: 36, kit: { club: 'mallet' }, when: 'Tuesday' },
            Nought: { strokes: 0, par: 36 },
            Odd: 'thirty',
          },
          round: { tour: 'golf', course: 'The Links', hole: 2, card: [4] },
        }),
      ),
    ).save;
    expect(save.mode).toBe('career');
    // the mallet is not owned, but a record's kit is what was worn then, as a best's is
    expect(save.records).toEqual({ Good: { strokes: 30, par: 36, kit: { ...NONE, club: 'mallet' }, when: '' } });
    expect(save.round, 'a card short of its holes').toBeNull();
    for (const round of [
      { tour: 'golf', course: '', hole: 1, card: [3] },
      { tour: 'golf', course: 'The Links', hole: 1, card: [] },
      { tour: 'golf', course: 'The Links', hole: 1, card: [0] },
      { tour: 'golf', course: 'The Links', hole: -1, card: [] },
      { tour: 'golf', course: 'The Links', hole: 0.5, card: [] },
      // from before there were events, or of a tour there is not
      { course: 'The Links', hole: 1, card: [3] },
      { tour: 'senior', course: 'The Links', hole: 1, card: [3] },
      'The Links',
    ])
      expect(new Progress(memoryStore(JSON.stringify({ round }))).save.round, JSON.stringify(round)).toBeNull();
  });

  it('keeps a round at its first hole, kept from the moment the fee is paid, and one part way round', () => {
    const at = (hole: number, card: number[]) =>
      new Progress(memoryStore(JSON.stringify({ round: { tour: 'mini', course: 'The Meadow', hole, card } }))).save
        .round;
    expect(at(0, [])).toEqual({
      tour: 'mini',
      course: 'The Meadow',
      hole: 0,
      card: [],
      retaken: false,
      pickedUp: false,
    });
    expect(at(2, [3, 4])).toMatchObject({ tour: 'mini', hole: 2, card: [3, 4] });
  });

  it('reads a season only as it should be: a known grade, counts that are counts, whole cards, and the tours there are', () => {
    const read = (season: unknown) => new Progress(memoryStore(JSON.stringify({ season }))).save.season;
    const card = [3, 4, 3];
    // a whole season is read as it is, a tour the game has not is not, and a tour left out is a fresh one
    expect(
      read({
        golf: { grade: 'county', begun: 3, played: [card, null], titles: 2 },
        senior: { grade: 'club', begun: 1, played: [], titles: 0 },
      }),
    ).toEqual({ golf: { grade: 'county', begun: 3, played: [card, null], titles: 2 }, mini: NO_SEASON.mini });
    // what is not what it should be takes its own default and nothing else is lost
    expect(read({ golf: { grade: 'junior', begun: 2, played: [], titles: 1 } }).golf).toEqual({
      grade: 'club',
      begun: 2,
      played: [],
      titles: 1,
    });
    for (const begun of [-1, 1.5, '3', null, [] as unknown])
      expect(read({ mini: { grade: 'county', begun, titles: 4 } }).mini, JSON.stringify(begun)).toEqual({
        grade: 'county',
        begun: 0,
        played: [],
        titles: 4,
      });
    expect(read({ mini: { grade: 'county', begun: 1, titles: -2 } }).mini.titles).toBe(0);
    // a played list is kept only if every event in it is a whole card or a withdrawal, since one dropped would put the rest at the wrong events
    for (const played of [
      [[3, 0, 3]],
      [
        [3, 4, 3],
        [3, -1],
      ],
      [card, []],
      [card, 'three'],
      [card, [3, 1.5]],
      'none',
    ])
      expect(read({ golf: { grade: 'county', begun: 1, played } }).golf.played, JSON.stringify(played)).toEqual([]);
    // and none of it is an object at all
    for (const bad of [null, 'season', [1, 2], 7, { golf: 'county', mini: [1] }])
      expect(read(bad), JSON.stringify(bad)).toEqual(NO_SEASON);
  });

  it('reads the caddie’s tips taken only as counts, and none of a kind that is not one', () => {
    const read = (caddie: unknown) => new Progress(memoryStore(JSON.stringify({ caddie }))).save.caddie;
    expect(read({ club: 1, shape: 4, spin: 2 })).toEqual({ club: 1, shape: 4, spin: 2 });
    expect(read({ club: -1, shape: 1.5, spin: 'top' })).toEqual(NO_TIPS);
    expect(read({ shape: 2, other: 9 })).toEqual({ club: 0, shape: 2, spin: 0 });
    for (const bad of [null, 'tips', [1, 2], 7]) expect(read(bad), JSON.stringify(bad)).toEqual(NO_TIPS);
    const progress = new Progress(memoryStore());
    progress.tookTip('shape', 3);
    progress.tookTip('shape', 3);
    progress.tookTip('club', 3);
    progress.tookTip('spin', 3);
    expect(progress.save.caddie).toEqual({ club: 1, shape: 2, spin: 1 });
    // past the limit the count stands, so the save's bytes are bounded
    for (let k = 0; k < 20; k++) progress.tookTip('shape', 3);
    expect(progress.save.caddie.shape).toBe(3);
  });

  it('reads the sound only as a boolean and a volume from 0 to 1, and the default for anything else', () => {
    const sound = (json: string) => {
      const { muted, volume } = new Progress(memoryStore(json)).save;
      return { muted, volume };
    };
    expect(sound('{"muted": true, "volume": 0.25}')).toEqual({ muted: true, volume: 0.25 });
    expect(sound('{"muted": false, "volume": 0}'), 'none at all is a volume').toEqual({ muted: false, volume: 0 });
    expect(sound('{"muted": "true"}'), 'a string is not a boolean').toEqual(NO_SOUND);
    expect(sound('{"muted": 1}'), 'a number is not a boolean').toEqual(NO_SOUND);
    expect(sound('{"muted": null, "volume": null}')).toEqual(NO_SOUND);
    expect(sound('{"coins": 2}'), 'missing').toEqual(NO_SOUND);
    for (const v of ['1.5', '-0.1', '"loud"', '1e999', '[0.5]'])
      expect(sound(`{"muted": true, "volume": ${v}}`), `volume ${v}`).toEqual({ muted: true, volume: 1 });
  });

  it('writes the sound as it is set, and a reload keeps it', () => {
    const store = memoryStore();
    const progress = new Progress(store);
    progress.setMuted(true);
    progress.setVolume(0.3);
    expect(new Progress(memoryStore(store.json)).save).toMatchObject({ muted: true, volume: 0.3 });
    progress.setMuted(false);
    expect(new Progress(memoryStore(store.json)).save.muted).toBe(false);
    // a volume out of range is the caller's bug, refused by name and not written
    for (const bad of [-0.1, 1.01, NaN, Infinity]) expect(() => progress.setVolume(bad), String(bad)).toThrow(/volume/);
    expect(new Progress(memoryStore(store.json)).save.volume).toBe(0.3);
  });

  it('goes on with the event round kept in the seasons’ own save, and breaks no rule', () => {
    const season = seasonContext();
    const game = new Game(new Progress(memoryStore(read('08-season.json'))), {}, { random: seeded(7), season });
    const fells = COURSES.find((c) => c.name === 'The Fells')!;
    expect(game.resume(fells.holes, { name: fells.name, purse: fells.purse })).toBe(true);
    expect([game.hole, game.card, game.event]).toEqual([2, [5, 4], { tour: 'golf', index: 2 }]);
    for (let f = 0; f < 300; f++) game.step(1 / 60);
    expect(checkInvariants(game)).toEqual([]);
  });

  it('has the shape the game writes now: a new field means a new file here', () => {
    const game = new Game(new Progress(memoryStore()), {}, { random: seeded(1) });
    game.persist();
    const now = Object.keys(JSON.parse(JSON.stringify(game.progress.save)) as object).sort();
    const newest = Object.keys(JSON.parse(read(files[files.length - 1])) as object).sort();
    expect(newest, 'add a save in the new shape to test/saves').toEqual(now);
  });
});
