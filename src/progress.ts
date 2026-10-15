/**
 * What the player has done, and where it is kept: the coins and gems, the
 * items owned and the kit worn (one thing from each aisle), and the best score on
 * each hole with the kit it was made with; and the career's: whether rounds count in it or are free play, each course's
 * record, and the career round under way. In the browser's storage or, for the game run without a page, anywhere.
 *
 * Old saves must still load. A field a save does not have takes its default,
 * a value that is not what it should be is taken as missing, and a field the
 * game no longer knows is dropped without complaint: every shape ever
 * written is in `test/saves/`.
 */
import { AISLES, emptySlots, itemById, type KitSlots } from './items';
import { PLAY_MODES, type CourseRecord, type PlayMode, type SavedRound } from './career';

export interface Best {
  strokes: number;
  /** The kit worn when it was made (each slot '' for none), so a score is a score with a given kit. */
  kit: KitSlots;
}

export interface Save {
  coins: number;
  gems: number;
  /** The ids of the items owned, each of them one the shop sells. */
  owned: string[];
  /** The kit worn, one thing from each aisle: each slot '' for none, and otherwise always an owned item of its aisle. */
  kit: KitSlots;
  /** The best score on each hole, by the hole's name. */
  best: Record<string, Best>;
  /** Whether a round counts in the career (paid, its records kept, kept to go on with) or is free play: the career for a save from before there was a choice, which was always paid. */
  mode: PlayMode;
  /** Each course's best round in the career, by the course's name. */
  records: Record<string, CourseRecord>;
  /** The career round under way, which a reload offers to go on with; null for none. */
  round: SavedRound | null;
}

/** Where the save is kept. */
export interface SaveStore {
  load(): string | null;
  store(json: string): void;
  clear(): void;
}

export const KEY = 'ooergolf-save-v1';

/** The browser's storage, and nothing at all where there is none, or it will not be written. */
export function browserStore(key = KEY): SaveStore {
  return {
    load() {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    store(json) {
      try {
        localStorage.setItem(key, json);
      } catch {
        /* fine */
      }
    },
    clear() {
      try {
        localStorage.removeItem(key);
      } catch {
        /* nothing to remove */
      }
    },
  };
}

/** A save kept in memory, starting from `json` if given: for the game run without a page. */
export function memoryStore(json: string | null = null): SaveStore & { json: string | null } {
  return {
    json,
    load() {
      return this.json;
    },
    store(next) {
      this.json = next;
    },
    clear() {
      this.json = null;
    },
  };
}

const fresh = (): Save => ({
  coins: 0,
  gems: 0,
  owned: [],
  kit: emptySlots(),
  best: {},
  mode: 'career',
  records: {},
  round: null,
});

/** A kit from a save, slot by slot: an id of the slot's own aisle that the shop sells, and '' for anything else. */
function kitFrom(kit: unknown): KitSlots {
  const made = emptySlots();
  if (typeof kit === 'object' && kit !== null && !Array.isArray(kit))
    for (const aisle of AISLES) {
      const id = (kit as Record<string, unknown>)[aisle];
      if (typeof id === 'string' && itemById(id)?.aisle === aisle) made[aisle] = id;
    }
  return made;
}

const isMap = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A count from a save: a whole number, not below nought, or the default. */
function count(v: unknown, or: number): number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : or;
}

/** The save read from whatever was stored, each field checked and defaulted. */
function read(json: string | null): Save {
  const save = fresh();
  if (json === null) return save;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return save;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return save;
  const from = raw as Record<string, unknown>;
  save.coins = count(from.coins, save.coins);
  save.gems = count(from.gems, save.gems);
  // an id the shop no longer sells (an old save's putters, an item since withdrawn) is dropped, and so is a repeat
  if (Array.isArray(from.owned))
    for (const id of from.owned)
      if (typeof id === 'string' && itemById(id) && !save.owned.includes(id)) save.owned.push(id);
  // an old save's `item` is one id of a shop since withdrawn, so it is not read; the kit is, slot by slot
  if (typeof from.kit === 'object' && from.kit !== null && !Array.isArray(from.kit)) {
    const slots = from.kit as Record<string, unknown>;
    for (const aisle of AISLES) {
      const id = slots[aisle];
      if (typeof id === 'string' && save.owned.includes(id) && itemById(id)?.aisle === aisle) save.kit[aisle] = id;
    }
  }
  if (typeof from.best === 'object' && from.best !== null && !Array.isArray(from.best))
    for (const [hole, b] of Object.entries(from.best as Record<string, unknown>)) {
      if (typeof b !== 'object' || b === null) continue;
      const { strokes, kit } = b as Record<string, unknown>;
      if (count(strokes, 0) < 1) continue;
      // a best made with an item since withdrawn (an old best's `item` or `club`) was made with an empty kit
      save.best[hole] = { strokes: strokes as number, kit: kitFrom(kit) };
    }
  if (PLAY_MODES.includes(from.mode as PlayMode)) save.mode = from.mode as PlayMode;
  // a record, like a best, is kept by its course's name, and one no course has any more is carried
  if (isMap(from.records))
    for (const [course, r] of Object.entries(from.records)) {
      if (!isMap(r)) continue;
      const strokes = count(r.strokes, 0),
        par = count(r.par, 0);
      if (strokes < 1 || par < 1) continue;
      const when = typeof r.when === 'string' && /^\d{4}-\d\d-\d\d$/.test(r.when) ? r.when : '';
      save.records[course] = { strokes, par, kit: kitFrom(r.kit), when };
    }
  // a round is kept only whole: a card of one score a hole played, each a stroke or more, and the next hole after them;
  // whether its course has that many holes is the game's to say when it goes on with it
  if (isMap(from.round)) {
    const { course, hole, card, retaken, pickedUp } = from.round;
    const scores = Array.isArray(card) ? card.map((s) => count(s, 0)) : [];
    if (
      typeof course === 'string' &&
      course !== '' &&
      count(hole, 0) >= 1 &&
      scores.length === hole &&
      scores.every((s) => s >= 1)
    )
      save.round = {
        course,
        hole,
        card: scores,
        retaken: retaken === true,
        pickedUp: pickedUp === true,
      };
  }
  return save;
}

export class Progress {
  readonly save: Save;

  /** Loaded from the store; loading alone never writes. */
  constructor(private readonly saves: SaveStore = browserStore()) {
    this.save = read(saves.load());
  }

  persist() {
    this.saves.store(JSON.stringify(this.save));
  }

  /** Start over: the save wiped, in memory and in the store. */
  reset() {
    Object.assign(this.save, fresh());
    this.saves.clear();
  }
}
