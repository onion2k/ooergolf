/**
 * Whether the GPU is the smoke test's own while it times a frame. A frame's cost is the GPU's time, and another process
 * drawing at the same moment (another session's headless browser, an image generator) takes its share of it: Home Waters'
 * tee read 4.1 to 4.3 ms alone and 9.9 to 11.7 ms beside a second headless game on 18 October 2026, with the CPU's part
 * 0.22 ms either way. The load average never shows it, so a shared figure read as a slower game, and a frame test failed
 * now and then for nothing.
 *
 * The GPU's overall use cannot tell us from anyone else: our own page, paused and drawing nothing for the test, keeps it at
 * 84 %, and timing alone or shared it reads 100 % both ways. macOS keeps GPU time for each process, though: every
 * `AGXDeviceUserClient` in `ioreg` has its creator's pid and the nanoseconds of GPU it has used. Read either side of a
 * timing and summed over everyone but our own browser, the others took about 40 ms of it a second alone and 560 beside a
 * second game. That is what `alone` holds a timing to.
 */
import { execFileSync } from 'node:child_process';

/** Every GPU client by its id in `ioreg`: whose it is, and the nanoseconds of GPU it has used since it was made. */
export type Usage = Map<string, { pid: number; name: string; ns: number }>;

/** What everyone but us took of the GPU over a window, in ms a second, the busiest of them, and how many clients went before its end. */
export interface Share {
  msPerSecond: number;
  top: { pid: number; name: string; ms: number }[];
  leftOut: number;
}

/**
 * The others' share past which a frame's figure is not the game's: a fifth of the GPU. At rest the desktop takes 40 to 76
 * ms of it a second here (WindowServer drawing two 6K screens, Safari, the notifications), and one more headless game 560.
 */
export const SHARED_MS = 200;
/** How long a look at the GPU before timing lasts, and how long the GPU is waited for to go quiet before a test fails. */
const LOOK_MS = 2000,
  WAIT_MS = 120_000;

/**
 * The GPU's clients from `ioreg -r -c AGXDeviceUserClient -l -w 0`, read entry by entry. `ioreg` prints a client's
 * `AppUsage` before its `IOUserClientCreator`, so a reader that goes line by line books each client's time to the one
 * before it.
 */
export function parseUsage(text: string): Usage {
  const usage: Usage = new Map();
  for (const entry of text.split('+-o ').slice(1)) {
    const id = /AGXDeviceUserClient\b.*?\bid (0x[0-9a-f]+)/.exec(entry);
    const creator = /"IOUserClientCreator" = "pid (\d+), ([^"]*)"/.exec(entry);
    if (!id || !creator) continue;
    let ns = 0;
    for (const m of entry.matchAll(/"accumulatedGPUTime"=(\d+)/g)) ns += Number(m[1]);
    usage.set(id[1], { pid: Number(creator[1]), name: creator[2], ns });
  }
  return usage;
}

/** `root` and every process under it, from `ps -Ao pid=,ppid=`: the Playwright worker, its browser and the browser's helpers. */
export function descendants(ps: string, root: number): Set<number> {
  const children = new Map<number, number[]>();
  for (const line of ps.split('\n')) {
    const [pid, ppid] = line.trim().split(/\s+/).map(Number);
    if (!Number.isFinite(pid) || !Number.isFinite(ppid)) continue;
    children.set(ppid, [...(children.get(ppid) ?? []), pid]);
  }
  const ours = new Set([root]);
  const queue = [root];
  while (queue.length)
    for (const child of children.get(queue.pop()!) ?? []) {
      if (ours.has(child)) continue;
      ours.add(child);
      queue.push(child);
    }
  return ours;
}

/**
 * What everyone but `ours` took of the GPU between two reads `seconds` apart. A client made inside the window counts in
 * full, since all its time is inside it; one gone by the end cannot be read, and is counted as left out.
 */
export function othersRate(before: Usage, after: Usage, seconds: number, ours: Set<number>): Share {
  const byProcess = new Map<string, { pid: number; name: string; ns: number }>();
  for (const [id, now] of after) {
    if (ours.has(now.pid)) continue;
    const used = now.ns - (before.get(id)?.ns ?? 0);
    if (used <= 0) continue;
    const key = `${now.pid} ${now.name}`;
    const seen = byProcess.get(key) ?? { pid: now.pid, name: now.name, ns: 0 };
    seen.ns += used;
    byProcess.set(key, seen);
  }
  const perSecond = (ns: number) => ns / 1e6 / Math.max(seconds, 1e-3);
  const top = [...byProcess.values()]
    .sort((a, b) => b.ns - a.ns)
    .map((p) => ({ pid: p.pid, name: p.name, ms: perSecond(p.ns) }));
  return {
    msPerSecond: top.reduce((sum, p) => sum + p.ms, 0),
    top,
    leftOut: [...before.keys()].filter((id) => !after.has(id) && !ours.has(before.get(id)!.pid)).length,
  };
}

/** Whether the others' share is enough to be another process drawing, and the share in words, with the busiest three. */
export function verdict(share: Share): { shared: boolean; says: string } {
  const who = share.top
    .slice(0, 3)
    .map((p) => `${p.pid} ${p.name} ${Math.round(p.ms)}`)
    .join(', ');
  const gone = share.leftOut
    ? `; ${share.leftOut} client${share.leftOut > 1 ? 's' : ''} gone before the end, not counted`
    : '';
  return {
    shared: share.msPerSecond >= SHARED_MS,
    says: `others took ${Math.round(share.msPerSecond)} ms of it a second (${who || 'none'}${gone})`,
  };
}

/** What `alone` reads the machine through: handed in, so its working parts are tested on a machine of the test's own. */
export interface Reader {
  /** The GPU's clients now, or null where they cannot be read. */
  usage(): Usage | null;
  /** Our own processes now, or null where they cannot be found. */
  ours(): Set<number> | null;
  now(): number;
  sleep(ms: number): Promise<void>;
  say(text: string): void;
}

/** This machine: `ioreg` and `ps` on macOS, and nothing to read anywhere else. */
function thisMachine(): Reader {
  const run = (command: string, args: string[]) =>
    execFileSync(command, args, { encoding: 'utf8', maxBuffer: 64 << 20 });
  return {
    usage() {
      if (process.platform !== 'darwin') return null;
      try {
        const usage = parseUsage(run('ioreg', ['-r', '-c', 'AGXDeviceUserClient', '-l', '-w', '0']));
        return usage.size ? usage : null;
      } catch {
        return null;
      }
    },
    ours() {
      try {
        const ours = descendants(run('ps', ['-Ao', 'pid=,ppid=']), process.pid);
        // the worker alone is not our browser: without one under it, nothing of ours can be told apart
        return ours.size > 1 ? ours : null;
      } catch {
        return null;
      }
    },
    now: () => performance.now(),
    sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
    say: (text) => console.log(text),
  };
}

/** Readers that have said they cannot look, so a run says it once and not for every test. */
const toldBlind = new WeakSet<Reader>();
const machine = thisMachine();

/**
 * `work`, a timing of frames, run while the GPU is the test's own. Before it, the GPU is looked at for two seconds at a
 * time until the others are quiet, for up to two minutes; then the work is run; then the others' share over the work's
 * whole window is read, and a timing the GPU was shared for fails, so its figure is never reported. Where the GPU cannot
 * be read, it says so and runs the work as it was always run.
 */
export async function alone<T>(work: () => Promise<T>, reader: Reader = machine): Promise<T> {
  const blind = () => {
    if (!toldBlind.has(reader))
      reader.say('gpu: cannot tell whether the GPU is shared here, so frame figures are taken as they come');
    toldBlind.add(reader);
    return work();
  };
  // the others over a window: null where the window could not be read
  const read = () => {
    const usage = reader.usage();
    return usage && { usage, at: reader.now() };
  };
  const over = (from: { usage: Usage; at: number }) => {
    const to = read();
    const ours = reader.ours();
    if (!to || !ours) return null;
    return verdict(othersRate(from.usage, to.usage, (to.at - from.at) / 1000, ours));
  };

  const began = reader.now();
  for (;;) {
    const from = read();
    if (!from || !reader.ours()) return blind();
    await reader.sleep(LOOK_MS);
    const looked = over(from);
    if (!looked) return blind();
    if (!looked.shared) break;
    if (reader.now() - began >= WAIT_MS)
      throw new Error(`gpu: the GPU is busy: ${looked.says}, for ${Math.round(WAIT_MS / 1000)} s`);
  }
  const from = read();
  if (!from) return blind();
  const result = await work();
  const timed = over(from);
  // a window that could not be read at its end is said, as one that never looked would be
  if (!timed)
    reader.say('gpu: the GPU could not be read at the end of the timing, so whether it was shared is not known');
  else if (timed.shared)
    throw new Error(`gpu: the GPU was shared while timing: ${timed.says}, so the frame figure is not reported`);
  // a check that passes in silence cannot be told from one that never looked: what it read is said each time
  else reader.say(`gpu: the GPU was the test's own while timing: ${timed.says}`);
  return result;
}
