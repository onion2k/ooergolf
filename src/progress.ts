/**
 * What the player has done, and where it is kept: the coins and gems, the
 * clubs owned and the one in hand, and the best score on each hole with the
 * club it was made with, in the browser's storage or, for the game run
 * without a page, anywhere.
 *
 * Old saves must still load. A field a save does not have takes its default,
 * a value that is not what it should be is taken as missing, and a field the
 * game no longer knows is dropped without complaint: every shape ever
 * written is in `test/saves/`.
 */
import { CLUBS, STARTING_CLUB } from './clubs';

export interface Best {
  strokes: number;
  /** The club it was made with, so a score is a score with a given club. */
  club: string;
}

export interface Save {
  coins: number;
  gems: number;
  /** The clubs owned, the starting putter always among them. */
  owned: string[];
  /** The club in hand: always one owned. */
  club: string;
  /** The best score on each hole, by the hole's name. */
  best: Record<string, Best>;
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

const fresh = (): Save => ({ coins: 0, gems: 0, owned: [STARTING_CLUB], club: STARTING_CLUB, best: {} });

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
  const known = new Set(CLUBS.map((c) => c.id));
  if (Array.isArray(from.owned))
    for (const id of from.owned)
      if (typeof id === 'string' && known.has(id) && !save.owned.includes(id)) save.owned.push(id);
  if (typeof from.club === 'string' && save.owned.includes(from.club)) save.club = from.club;
  if (typeof from.best === 'object' && from.best !== null && !Array.isArray(from.best))
    for (const [hole, b] of Object.entries(from.best as Record<string, unknown>)) {
      if (typeof b !== 'object' || b === null) continue;
      const { strokes, club } = b as Record<string, unknown>;
      if (count(strokes, 0) < 1) continue;
      save.best[hole] = { strokes: strokes as number, club: typeof club === 'string' ? club : STARTING_CLUB };
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
