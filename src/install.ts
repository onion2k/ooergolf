/**
 * The page as an app: when the service worker is registered, and the browser's offer to install, kept until the player
 * presses Install. Handed the page's facts and the window to listen on, so it is tested with neither; without it the
 * registration would be a line in `main.ts` no test sees, and a worker in the dev server would hand every smoke test a
 * build it did not ask for.
 */

/** Whether a page registers the worker: only a built page, in a browser that has workers, and not one that asked `?sw=0`. */
export function shouldRegister(page: { prod: boolean; search: string; supported: boolean }): boolean {
  if (!page.prod || !page.supported) return false;
  return new URLSearchParams(page.search).get('sw') !== '0';
}

/** Where the worker's registration has got to, for the test API. */
export type WorkerState = 'none' | 'registering' | 'ready' | 'failed';

/** What a registration needs of `navigator.serviceWorker`. */
export interface WorkerContainer {
  register(url: string, options: { type: 'module' }): Promise<unknown>;
}

/**
 * The worker registered, from the site's root as a module, and the state told as it changes. A failure is told and never
 * thrown: the game is playing by then, and a worker that could not be had is a page that plays as it did before there was one.
 */
export function registerWorker(container: WorkerContainer, told: (state: WorkerState) => void): void {
  told('registering');
  container.register('./sw.js', { type: 'module' }).then(
    () => told('ready'),
    (error: unknown) => {
      // eslint-disable-next-line no-console -- a worker that fails to register is told to whoever opens the console; the game plays on without it
      console.error('The service worker could not be registered.', error);
      told('failed');
    },
  );
}

/** The browser's deferred install prompt, as `beforeinstallprompt` hands it. */
export interface InstallPrompt {
  preventDefault(): void;
  prompt(): Promise<unknown>;
}

/** What the offer needs of the window: the two events a browser tells an installable page of. */
export interface OfferTarget {
  addEventListener(type: 'beforeinstallprompt', listener: (event: InstallPrompt) => void): void;
  addEventListener(type: 'appinstalled', listener: () => void): void;
}

/**
 * The browser's offer to install, held until the player takes it. Chrome, Edge and Android fire `beforeinstallprompt` when
 * a page may be installed; the event is kept and its own prompt stopped, so the page asks when the player presses Install
 * and not when the browser likes. `changed` is told whenever the offer comes or goes: taken, or the app installed any way.
 * Safari and iOS fire nothing, and the button is never shown there.
 */
export class InstallOffer {
  private deferred: InstallPrompt | null = null;

  constructor(
    target: OfferTarget,
    private readonly changed: (offered: boolean) => void,
  ) {
    target.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      this.deferred = event;
      changed(true);
    });
    target.addEventListener('appinstalled', () => this.clear());
  }

  /** Whether the browser has offered and the player not yet asked. */
  get offered(): boolean {
    return this.deferred !== null;
  }

  /** The player asked: the browser's prompt is shown, once per offer. False when there is none to show. */
  prompt(): boolean {
    const deferred = this.deferred;
    if (!deferred) return false;
    this.clear();
    void deferred.prompt();
    return true;
  }

  private clear() {
    if (!this.deferred) return;
    this.deferred = null;
    this.changed(false);
  }
}
