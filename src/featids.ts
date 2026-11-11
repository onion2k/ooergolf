/**
 * The feats a player can earn, by the ids the save keeps them under. An id that has been given out is kept for ever, since a save
 * names its feats by it: never renamed, and one the game withdraws is simply no longer read. This is a leaf with
 * no content in it, so that the save can say which ids it knows without importing the courses a feat is worked out from; what
 * each is called, how it is earned and how it is drawn is `feats.ts`, which holds an entry for every id here, in this order (a test sees to it).
 */
export const FEAT_IDS = [
  'ace',
  'tenAces',
  'winner',
  'champion',
  'kittedOut',
  'eagle',
  'redFigures',
  'grandSlam',
  'recordBook',
  'downtown',
] as const;

export type FeatId = (typeof FEAT_IDS)[number];

/** Whether `id` is a feat the game knows. */
export function isFeatId(id: unknown): id is FeatId {
  return typeof id === 'string' && (FEAT_IDS as readonly string[]).includes(id);
}
