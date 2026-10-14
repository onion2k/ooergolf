/**
 * The page as an app, with no page: when the worker is registered, and the install offer kept and taken. A worker
 * registered in the dev server would hand every smoke test a cached build; an offer shown with none to take would be a
 * button that does nothing.
 */
import { describe, expect, it, vi } from 'vitest';
import { InstallOffer, registerWorker, shouldRegister, type InstallPrompt, type OfferTarget } from '../src/install';

describe('whether the worker is registered', () => {
  it('is only on a built page, in a browser with workers, that did not ask for none', () => {
    expect(shouldRegister({ prod: true, search: '', supported: true })).toBe(true);
    expect(shouldRegister({ prod: true, search: '?title=0&seed=3', supported: true })).toBe(true);
    expect(shouldRegister({ prod: false, search: '', supported: true })).toBe(false);
    expect(shouldRegister({ prod: true, search: '', supported: false })).toBe(false);
    expect(shouldRegister({ prod: true, search: '?sw=0', supported: true })).toBe(false);
    expect(shouldRegister({ prod: true, search: '?title=0&sw=0', supported: true })).toBe(false);
  });
});

describe('the registration', () => {
  it('asks for sw.js at the root as a module, and says when it is ready', async () => {
    const register = vi.fn(() => Promise.resolve({}));
    const states: string[] = [];
    registerWorker({ register }, (s) => states.push(s));
    expect(register).toHaveBeenCalledWith('./sw.js', { type: 'module' });
    await Promise.resolve();
    expect(states).toEqual(['registering', 'ready']);
  });

  it('says it failed, and throws nothing, when the browser refuses', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const states: string[] = [];
    registerWorker({ register: () => Promise.reject(new Error('no')) }, (s) => states.push(s));
    await new Promise((done) => setTimeout(done, 0));
    expect(states).toEqual(['registering', 'failed']);
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });
});

/** A window that keeps the listeners, for the test to fire the events on. */
function fakeWindow() {
  const listeners: Record<string, ((e?: unknown) => void)[]> = {};
  const target: OfferTarget = {
    addEventListener(type: string, listener: (e?: unknown) => void) {
      (listeners[type] ??= []).push(listener);
    },
  } as OfferTarget;
  const fire = (type: string, event?: unknown) => (listeners[type] ?? []).forEach((l) => l(event));
  return { target, fire };
}

const fakePrompt = (): InstallPrompt & { prompted: number; stopped: number } => {
  const p = {
    prompted: 0,
    stopped: 0,
    preventDefault: () => {
      p.stopped++;
    },
    prompt: () => {
      p.prompted++;
      return Promise.resolve();
    },
  };
  return p;
};

describe('the install offer', () => {
  it('is none until the browser offers, then one, and the prompt is shown once when taken', () => {
    const { target, fire } = fakeWindow();
    const changes: boolean[] = [];
    const offer = new InstallOffer(target, (on) => changes.push(on));
    expect(offer.offered).toBe(false);
    expect(offer.prompt()).toBe(false);
    const event = fakePrompt();
    fire('beforeinstallprompt', event);
    expect(event.stopped).toBe(1);
    expect(offer.offered).toBe(true);
    expect(changes).toEqual([true]);
    expect(offer.prompt()).toBe(true);
    expect(event.prompted).toBe(1);
    expect(offer.offered).toBe(false);
    expect(offer.prompt()).toBe(false);
    expect(event.prompted).toBe(1);
    expect(changes).toEqual([true, false]);
  });

  it('is withdrawn when the app is installed any other way', () => {
    const { target, fire } = fakeWindow();
    const changes: boolean[] = [];
    const offer = new InstallOffer(target, (on) => changes.push(on));
    fire('beforeinstallprompt', fakePrompt());
    fire('appinstalled');
    expect(offer.offered).toBe(false);
    expect(changes).toEqual([true, false]);
    // and said once: an install with no offer standing changes nothing
    fire('appinstalled');
    expect(changes).toEqual([true, false]);
  });
});
