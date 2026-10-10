/** The types of `trace-title.mjs`, which is a plain script: what the test reads of it. */
export const CROP: { x0: number; y0: number; x1: number; y1: number };
export const GROW: number;
export const EDGE: number;
export const BANDS: number;
export const BALL_LIGHT: number[];
export const BALL: { cx: number; cy: number; r: number };
export const FOLD: number[][];
export const KNOB: { x: number; y: number; r: number };
export const SOURCE: string;
export const OUTPUT: string;
/** The title's lettering as `src/titletrace.json` has it, from the bytes of the picture; `grow` is how far each outline piece goes under its neighbours. */
export function traceTitle(file: Buffer, options?: { grow?: number }): unknown;
