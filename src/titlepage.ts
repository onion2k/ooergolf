/**
 * The title screen's panel as the page keeps it: plain sky from the first paint (the stylesheet's own gradient, so
 * nothing flashes and no picture is fetched), let go once the game is ready so the title scene drawn behind it shows,
 * by the fade `title.ts` says. The panel is handed in, and so is the player's word on motion, so none of it reaches for a
 * global. Without this the boot panel would be left to the stylesheet alone, and a page that stops on it with something
 * to say could not keep an exit still on its way from hiding the words.
 */
import { fades } from './title';

export interface TitlePage {
  /** The game is ready: fade the panel away to the title scene. Once. */
  leave(): void;
  /** The page has stopped on this panel with something to say: no exit may hide it again. */
  hold(): void;
}

/**
 * The title's panel on `boot`, faded out by `leave`. The fade is the panel's own custom property, so the stylesheet holds no
 * figure of its own; it is none under reduced motion, and for a test's page (`off`, `?title=0`), which has no wish to wait.
 */
export function titlePage(boot: HTMLElement, off: boolean, reducedMotion: boolean): TitlePage {
  boot.style.setProperty('--title-out', `${fades(reducedMotion || off).fadeOut}ms`);
  let held = false;
  return {
    leave() {
      if (!held) boot.classList.add('gone');
    },
    hold() {
      held = true;
    },
  };
}
