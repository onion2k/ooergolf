/** What the shop's tests share: a game wearing named items, owned as a save has them, on any hole, with every event noted. */
import { Game, type GameEvents } from '../src/game';
import { itemById, type KitSlots } from '../src/items';
import type { HoleDef } from '../src/course';
import { Progress, memoryStore } from '../src/progress';
import { seeded, type Random } from '../src/random';

/** The slots a list of item ids come to, each in its own aisle (a second of an aisle takes the first's place). */
export function slotsOf(ids: readonly string[]): KitSlots {
  const slots: KitSlots = { club: '', ball: '', accessory: '' };
  for (const id of ids) slots[itemById(id)!.aisle] = id;
  return slots;
}

/** A save that owns and wears `ids`, with coins and gems to spare. */
export function saveWearing(ids: readonly string[], extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ coins: 5000, gems: 20, owned: [...ids], kit: slotsOf(ids), best: {}, ...extra });
}

/** Every event a game tells, as its name and arguments. */
export type Calls = [string, unknown[]][];

/**
 * A game on `holes` wearing `ids`. Its events are noted in `calls`; `on` replaces any of them with a function of its own,
 * which is still noted. Chance is `random`, the middle always if not given, so a club strikes true.
 */
export function wearing(
  ids: readonly string[],
  holes: readonly HoleDef[],
  random: Random = () => 0.5,
  on: Partial<Record<keyof GameEvents, (...args: never[]) => void>> = {},
  json: string = saveWearing(ids),
) {
  const calls: Calls = [];
  const events = new Proxy(
    {},
    {
      get:
        (_, name: string) =>
        (...args: unknown[]) => {
          calls.push([name, args]);
          (on as Record<string, ((...a: unknown[]) => void) | undefined>)[name]?.(...args);
        },
    },
  ) as GameEvents;
  const game = new Game(new Progress(memoryStore(json)), events, { random, course: holes });
  return { game, calls };
}

/** A random source that counts how many times it was asked: `random` is the source and `drawn()` the count. */
export function counted(seed = 1) {
  const inner = seeded(seed);
  let n = 0;
  return {
    random: (() => {
      n++;
      return inner();
    }) as Random,
    drawn: () => n,
  };
}
