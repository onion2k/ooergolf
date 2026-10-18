/**
 * The smoke tests' check that the GPU is theirs while they time a frame (`smoke/gpu.ts`): what it reads from `ioreg` and
 * `ps`, what it makes of the two reads either side of a timing, and what `alone` does with a quiet GPU, a shared one and
 * one it cannot read. Without these, a fault in the middle of it would say nothing: a test would pass on a shared GPU, or
 * fail on a quiet one, and either would read as the game.
 */
import { describe, expect, it } from 'vitest';
import { SHARED_MS, alone, descendants, othersRate, parseUsage, verdict, type Reader, type Usage } from '../smoke/gpu';

/** `ioreg -r -c AGXDeviceUserClient -l -w 0` in the shape it has on this machine (18 October 2026), cut to four clients. */
const IOREG = `+-o AGXDeviceUserClient  <class AGXDeviceUserClient, id 0x1000011ab, !registered, !matched, active, busy 0, retain 5>
    {
      "AppUsage" = ()
      "IOUserClientCreator" = "pid 419, WindowServer"
    }


+-o AGXDeviceUserClient  <class AGXDeviceUserClient, id 0x1000011ac, !registered, !matched, active, busy 0, retain 5>
    {
      "AppUsage" = ({"API"="Metal","lastSubmittedTime"=607659089036875,"accumulatedGPUTime"=6000000000},{"API"="Metal","lastSubmittedTime"=601169134733166,"accumulatedGPUTime"=250000000})
      "IOUserClientCreator" = "pid 419, WindowServer"
      "CommandQueueCount" = 3
    }


+-o AGXDeviceUserClient  <class AGXDeviceUserClient, id 0x1000020aa, !registered, !matched, active, busy 0, retain 5>
    {
      "AppUsage" = ({"API"="Metal","lastSubmittedTime"=607659089036875,"accumulatedGPUTime"=4000000000})
      "IOUserClientCreator" = "pid 93192, Google Chrome fo"
    }


+-o AGXDeviceUserClient  <class AGXDeviceUserClient, id 0x1000020ab, !registered, !matched, active, busy 0, retain 5>
    {
      "AppUsage" = ({"API"="Metal","lastSubmittedTime"=607659089036875,"accumulatedGPUTime"=1000000000})
      "IOUserClientCreator" = "pid 757, NotificationCent"
    }
`;

/** A client of the given pid and name with so many nanoseconds of GPU, for building reads by hand. */
const client = (pid: number, name: string, ns: number) => ({ pid, name, ns });

describe('reading ioreg', () => {
  it('reads each client by its own entry, so its time is booked to its own creator and not the one before', () => {
    const usage = parseUsage(IOREG);
    expect([...usage.keys()].sort()).toEqual(['0x1000011ab', '0x1000011ac', '0x1000020aa', '0x1000020ab']);
    expect(usage.get('0x1000011ab')).toEqual(client(419, 'WindowServer', 0));
    // two records of one client summed
    expect(usage.get('0x1000011ac')).toEqual(client(419, 'WindowServer', 6_250_000_000));
    expect(usage.get('0x1000020aa')).toEqual(client(93192, 'Google Chrome fo', 4_000_000_000));
    expect(usage.get('0x1000020ab')).toEqual(client(757, 'NotificationCent', 1_000_000_000));
  });

  it('gives no clients for text with none', () => {
    expect(parseUsage('').size).toBe(0);
    expect(parseUsage('+-o IOService  <class IOService>\n').size).toBe(0);
  });
});

describe('our processes', () => {
  // pid, ppid as `ps -Ao pid=,ppid=` gives them: the worker 900, its browser 901, the browser's GPU helper 902 and a
  // renderer 903, and someone else's browser 950 with its helper 951
  const PS = [
    '    1     0',
    '  900     1',
    '  901   900',
    '  902   901',
    '  903   901',
    '  950     1',
    '  951   950',
    '',
  ].join('\n');

  it('are the worker and everything under it, grandchildren too', () => {
    expect([...descendants(PS, 900)].sort()).toEqual([900, 901, 902, 903]);
  });

  it('are nothing of anyone else', () => {
    expect(descendants(PS, 950).has(902)).toBe(false);
    expect([...descendants(PS, 4242)]).toEqual([4242]);
  });
});

describe('the others, over a window', () => {
  const before: Usage = new Map([
    ['a', client(419, 'WindowServer', 1_000_000_000)],
    ['b', client(902, 'Google Chrome fo', 5_000_000_000)],
    ['c', client(757, 'NotificationCent', 100_000_000)],
    ['gone', client(600, 'Draw Things', 9_000_000_000)],
  ]);
  const after: Usage = new Map([
    // 48 ms over two seconds
    ['a', client(419, 'WindowServer', 1_048_000_000)],
    // ours: two seconds of it, left out
    ['b', client(902, 'Google Chrome fo', 7_000_000_000)],
    ['c', client(757, 'NotificationCent', 100_000_000)],
    // a second game begun inside the window: all of it counted
    ['new', client(4468, 'Google Chrome fo', 900_000_000)],
  ]);

  it('is the GPU everyone but us took, in ms a second, each of them too, with a client begun inside it counted in full', () => {
    const share = othersRate(before, after, 2, new Set([900, 901, 902]));
    expect(share.msPerSecond).toBeCloseTo((48 + 900) / 2);
    expect(share.top).toEqual([
      { pid: 4468, name: 'Google Chrome fo', ms: 450 },
      { pid: 419, name: 'WindowServer', ms: 24 },
    ]);
  });

  it('leaves out a client gone by the end, and says how many', () => {
    expect(othersRate(before, after, 2, new Set([902])).leftOut).toBe(1);
  });

  it('counts our own drawing as someone else’s when we are not left out', () => {
    expect(othersRate(before, after, 2, new Set()).msPerSecond).toBeCloseTo((48 + 2000 + 900) / 2);
  });
});

describe('the verdict', () => {
  const share = (msPerSecond: number) => ({
    msPerSecond,
    leftOut: 0,
    top: [
      { pid: 4468, name: 'Google Chrome fo', ms: 900 },
      { pid: 419, name: 'WindowServer', ms: 48 },
      { pid: 757, name: 'NotificationCent', ms: 20 },
      { pid: 10169, name: 'Claude Helper', ms: 8 },
    ],
  });

  it('is quiet below the threshold and shared at it', () => {
    expect(verdict(share(SHARED_MS - 1)).shared).toBe(false);
    expect(verdict(share(SHARED_MS)).shared).toBe(true);
  });

  it('names the three biggest others', () => {
    const says = verdict(share(480)).says;
    expect(says).toContain('480 ms of it a second');
    expect(says).toContain('4468 Google Chrome fo');
    expect(says).toContain('757 NotificationCent');
    expect(says).not.toContain('Claude Helper');
  });
});

/**
 * A machine of the test's own: a clock that moves only when slept or worked, and a GPU whose others take `others()` ms a
 * second of it, read as `ioreg` would be, cumulatively.
 */
function machine(others: (at: number) => number, ours: Set<number> | null = new Set([902])) {
  let now = 0;
  let theirs = 0;
  const said: string[] = [];
  const advance = (ms: number) => {
    // the others' GPU time grows at their rate over the time passed, read at its start
    theirs += (others(now) * ms) / 1000;
    now += ms;
  };
  const reader: Reader = {
    usage: () => new Map([['x', client(4468, 'Google Chrome fo', Math.round(theirs * 1e6))]]),
    ours: () => ours,
    now: () => now,
    sleep: (ms) => Promise.resolve(advance(ms)),
    say: (text) => said.push(text),
  };
  /** A timing that takes `ms` of the machine's clock and gives `value`. */
  const timing =
    <T>(ms: number, value: T) =>
    () => {
      advance(ms);
      return Promise.resolve(value);
    };
  return { reader, advance, said, timing };
}

describe('alone', () => {
  it('runs the work and gives back what it gave, on a quiet GPU', async () => {
    const m = machine(() => 40);
    await expect(alone(m.timing(5000, 4.2), m.reader)).resolves.toBe(4.2);
    // and says what it read, so a pass is seen to have looked
    expect(m.said).toEqual([expect.stringMatching(/the test's own while timing: others took 40 ms of it a second/)]);
  });

  it('fails a timing the GPU was shared for, and says by whom, without the figure', async () => {
    // quiet while it looks first, and a second game begun as the work starts
    const m = machine((at) => (at < 2000 ? 40 : 560));
    const run = alone(m.timing(5000, 9.97), m.reader);
    await expect(run).rejects.toThrow(/shared while timing.*560 ms of it a second.*4468 Google Chrome fo/);
    await expect(run).rejects.not.toThrow(/9\.97/);
  });

  it('waits for a busy GPU to go quiet before it times', async () => {
    const m = machine((at) => (at < 30_000 ? 560 : 40));
    let began = -1;
    await alone(() => {
      began = m.reader.now();
      return m.timing(5000, null)();
    }, m.reader);
    expect(began).toBeGreaterThanOrEqual(30_000);
  });

  it('fails, and never times, on a GPU busy for longer than it waits', async () => {
    const m = machine(() => 560);
    let ran = false;
    await expect(alone(() => Promise.resolve(void (ran = true)), m.reader)).rejects.toThrow(
      /GPU is busy.*560 ms of it a second/,
    );
    expect(ran).toBe(false);
    expect(m.reader.now()).toBeGreaterThanOrEqual(120_000);
  });

  it('runs the work and says it could not look, where the GPU cannot be read', async () => {
    const m = machine(() => 560, null);
    await expect(alone(() => Promise.resolve(4.2), m.reader)).resolves.toBe(4.2);
    expect(m.said.join(' ')).toMatch(/cannot tell whether the GPU is shared/);
  });
});
