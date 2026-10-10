/**
 * What the boot has done so far, as a share, for the progress bar on the title's sky panel, and when that bar is to be seen.
 * The bar is for a slow machine or a slow link: a boot that has the title up inside half a second shows none, so a good
 * machine sees only the sky turn into the title. The share comes from the boot's own named steps, each weighted by what it
 * cost on a prod build here (scripts 43 ms, the pipelines' compile 160, the hole 36, the letters 37, the scene 77, the grass
 * 45), so the bar moves as the work does and never by a made-up pace. Page time and nothing of the game's.
 */

/** Half a second after the page started, the bar is shown, if the title is not up yet. The stylesheet's delay is held to this by a test. */
export const BOOT_BAR = { after: 500 } as const;

/** The boot's steps, in the order they usually finish, and what each is worth. They finish in any order: the compile runs beside the rest. */
export const BOOT_STEPS = {
  scripts: 43,
  compile: 160,
  hole: 36,
  letters: 37,
  scene: 77,
  grass: 45,
} as const;

export type BootStep = keyof typeof BOOT_STEPS;

const TOTAL = Object.values(BOOT_STEPS).reduce((a, b) => a + b, 0);

/** Whether the bar is to be seen `elapsed` milliseconds after the page started: not before the wait, and not once the title is up. */
export function barShown(elapsed: number, titleUp: boolean): boolean {
  return !titleUp && elapsed >= BOOT_BAR.after;
}

export class BootProgress {
  private readonly done = new Set<BootStep>();
  private shown = 0;

  /** A step is done; the share of the whole that is done now, from nought to one. A step said twice counts once, and the share never goes back. */
  finish(step: BootStep): number {
    if (!(step in BOOT_STEPS)) throw new Error(`no boot step called ${String(step)}`);
    this.done.add(step);
    let sum = 0;
    for (const s of this.done) sum += BOOT_STEPS[s];
    this.shown = Math.max(this.shown, sum / TOTAL);
    return this.shown;
  }

  get share(): number {
    return this.shown;
  }
}
