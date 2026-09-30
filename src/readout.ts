/**
 * What a golfer is told of the pin from where the ball lies: how far it is along the ground and how much higher or
 * lower than the ball it stands, in yards (a unit is a yard). Arithmetic on a layout, so it is tested without a page;
 * the page shows the words and never works the numbers out.
 */
import { heightAt, type Layout } from './arena';
import { SURFACES, type Lie } from './surfaces';

export interface Pin {
  /** How far to the cup across the ground, in yards. */
  yards: number;
  /** How much higher the cup stands than the ball: under nought for a cup that is lower. */
  rise: number;
}

/** The pin as it is from (x, y), a ball lying on the ground there. */
export function pinReadout(layout: Layout, x: number, y: number): Pin {
  const { cup } = layout;
  return {
    yards: Math.hypot(cup.x - x, cup.y - y),
    rise: heightAt(layout, cup.x, cup.y) - heightAt(layout, x, y),
  };
}

/** The least rise or fall, in yards, that is worth an arrow: under it the shot is level for a golfer's purpose. */
const LEVEL = 0.5;

/** The pin as words: whole yards, and an arrow up or down with the rise or fall in whole yards when there is one. */
export function pinText(pin: Pin): string {
  const yards = `${Math.round(pin.yards)} yd`;
  if (pin.rise >= LEVEL) return `${yards} ▲ ${Math.round(pin.rise)}`;
  if (pin.rise <= -LEVEL) return `${yards} ▼ ${Math.round(-pin.rise)}`;
  return yards;
}

/** What a shot is struck to do, as the preview works it out: how far it carries, what it comes to, what ground, and whether a tree is met. */
export interface Landing {
  carry: number;
  end: 'landed' | 'holed' | 'water' | 'out';
  lie: Lie;
  hit: boolean;
}

/**
 * Where a shot would come down, in words: the tree in the way first if there is one, then how far and what it comes
 * down on, which is the news where it is the water or out of bounds; or that it drops in the cup.
 */
export function landingText(l: Landing): string {
  if (l.end === 'holed') return 'drops in the cup';
  const yards = `lands ${Math.round(l.carry)} yd`;
  const where =
    l.end === 'water' ? 'in the water' : l.end === 'out' ? 'out of bounds' : (SURFACES[l.lie]?.name ?? 'ground');
  return `${l.hit ? 'hits a tree · ' : ''}${yards} · ${where}`;
}
