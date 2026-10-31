/**
 * The scenery's models, built for a biome the first time a hole of it asks, once, and kept: the picture's side of
 * `Theme.scenery`. A theme says how each model is made (a maker, `theme.ts`); this bakes each into its yaw buckets and its
 * tiers of light (`models/tone.ts`) and holds the set, so the scene reads the models of the hole's own biome and never a
 * module-level few. Earth's is built when the scene is loaded, as the scene always built it, and the others are built when a
 * hole of theirs is first begun, so a game that never plays a desert never pays for one. There are four biomes, so there are
 * at most four sets, which is the ceiling `scripts/leaks.ts` names.
 */
import { treeOf, type BiomeName } from './biome';
import type { Model } from './models/part';
import { TONE_SUN, bucketed, sceneryRule } from './models/tone';
import type { Maker, ModelKind, Theme } from './theme';

/** A kind's models, one for each bucket of yaw, or none where the biome draws nothing of the kind. */
export type Baked = Partial<Record<ModelKind, Model[]>>;

export interface SceneryModels {
  scatter: Baked;
  beyond: Baked;
  far: { conifer?: Model[]; broadleaf?: Model[] };
  /** A golf tree baked for the one turn it is drawn at; null where the biome has no tree (the Moon's). */
  golfTree: Model[] | null;
  /** What drifts on the wind, baked for the one turn it is drawn at; null where the biome has nothing that does. */
  drift: Model[] | null;
}

const toneSet = (make: Maker) => bucketed(make, TONE_SUN, sceneryRule);

/** Each kind of a record of makers baked, the kinds with no maker left out. */
function bake<K extends string>(makers: Record<K, Maker | null>): Partial<Record<K, Model[]>> {
  const out: Partial<Record<K, Model[]>> = {};
  for (const kind of Object.keys(makers) as K[]) {
    const make = makers[kind];
    if (make) out[kind] = toneSet(make);
  }
  return out;
}

const SETS = new Map<BiomeName, SceneryModels>();

/** The scenery's models for `theme`, made the first time and the same objects on every ask after. */
export function sceneryOf(theme: Theme): SceneryModels {
  let made = SETS.get(theme.name);
  if (!made) {
    const s = theme.scenery;
    const tree = treeOf({ biome: theme.name });
    made = {
      scatter: bake(s.scatter),
      beyond: bake(s.beyond),
      far: bake(s.far),
      golfTree: s.golfTree && tree ? bucketed(() => s.golfTree!(tree), TONE_SUN, sceneryRule, 1) : null,
      drift: s.drift ? bucketed(s.drift, TONE_SUN, sceneryRule, 1) : null,
    };
    SETS.set(theme.name, made);
  }
  return made;
}

/** How many sets are kept: at most one for each biome. */
export const setsKept = (): number => SETS.size;
