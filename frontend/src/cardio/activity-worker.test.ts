import './activity-deps-lazy';

import { strToU8, zipSync } from 'fflate';
import { afterEach, expect, test, vi } from 'vitest';

import { parseDeferred, readActivityFile } from './activity-file';
import { readActivityFiles } from './activity-reader';
import { readInWorker, type WorkerMessage } from './activity-worker-core';
import ride from './fixtures/garmin-ride.gpx?raw';
import run from './fixtures/garmin-run.tcx?raw';

// #387: unzipping runs in a Web Worker; the worker hands TCX and GPX text back because only the
// page has DOMParser, and the page reads reading progress and Cancel.
afterEach(() => vi.unstubAllGlobals());

const zipFile = (name = 'account.zip') =>
  new File(
    [
      zipSync({
        'a/ride.gpx': strToU8(ride),
        'a/run.tcx': strToU8(run),
        'a/notes.json': strToU8('{}'),
      }).slice(),
    ],
    name,
    { type: 'application/zip' },
  );

test('the worker side unzips, reports progress and leaves the XML for the page to parse', async () => {
  const messages: WorkerMessage[] = [];
  await readInWorker(zipFile(), (m) => messages.push(m));
  expect(messages.filter((m) => m.type === 'progress')).toEqual([
    { type: 'progress', done: 1, total: 2 },
    { type: 'progress', done: 2, total: 2 },
  ]);
  const done = messages.at(-1)!;
  expect(done.type).toBe('done');
  if (done.type !== 'done') return;
  // No activity yet: DOMParser is not there in a worker.
  expect(done.result.activities).toEqual([]);
  expect(done.result.deferred?.map((d) => d.file)).toEqual([
    'account.zip › ride.gpx',
    'account.zip › run.tcx',
  ]);
  const read = done.result.deferred!.map((d) => parseDeferred(d));
  expect(read.flatMap((r) => r.activities.map((a) => a.format)).sort()).toEqual(['gpx', 'tcx']);
  // The same file read on the page gives the same activities.
  const direct = await readActivityFile(
    'account.zip',
    new Uint8Array(await zipFile().arrayBuffer()),
  );
  expect(direct.activities).toHaveLength(2);
});

test('a file that cannot be opened is reported like the page reports it', async () => {
  const file = zipFile('gone.zip');
  file.arrayBuffer = () => Promise.reject(new Error('gone'));
  const messages: WorkerMessage[] = [];
  await readInWorker(file, (m) => messages.push(m));
  expect(messages).toEqual([
    {
      type: 'done',
      result: {
        activities: [],
        problems: ['gone.zip: Could not open the file. Choose it again.'],
        skipped: 0,
      },
    },
  ]);
});

test('an unreadable deferred file is reported by name', () => {
  expect(parseDeferred({ file: 'x.gpx', text: '<gpx' }).problem).toMatch(/^x\.gpx: /);
});

class FakeWorker {
  static all: FakeWorker[] = [];
  onmessage: ((event: { data: WorkerMessage }) => void) | null = null;
  onerror: (() => void) | null = null;
  terminated = false;
  constructor() {
    FakeWorker.all.push(this);
  }
  postMessage({ file }: { file: File }) {
    // Answers like the real worker, on its own schedule.
    void readInWorker(file, (data) => this.onmessage?.({ data }));
  }
  terminate() {
    this.terminated = true;
  }
}

test('the page reads each file in a worker with progress, then parses the XML itself', async () => {
  FakeWorker.all = [];
  vi.stubGlobal('Worker', FakeWorker);
  const progress: string[] = [];
  const reading = readActivityFiles([zipFile('one.zip'), zipFile('two.zip')], (p) =>
    progress.push(`${p.index + 1}/${p.count} ${p.file} ${p.done}/${p.total}`),
  );
  const result = await reading.promise;
  expect(result.canceled).toBe(false);
  expect(result.activities).toHaveLength(4);
  expect(result.problems).toEqual([]);
  expect(progress).toContain('1/2 one.zip 2/2');
  expect(progress).toContain('2/2 two.zip 2/2');
  expect(FakeWorker.all).toHaveLength(2);
  expect(FakeWorker.all.every((w) => w.terminated)).toBe(true);
});

test('Cancel stops the worker and the read ends without activities', async () => {
  FakeWorker.all = [];
  class Silent extends FakeWorker {
    postMessage() {
      // Never answers: a long unzip.
    }
  }
  vi.stubGlobal('Worker', Silent);
  const reading = readActivityFiles([zipFile()]);
  reading.cancel();
  const result = await reading.promise;
  expect(result.canceled).toBe(true);
  expect(result.activities).toEqual([]);
  expect(FakeWorker.all[0]?.terminated ?? true).toBe(true);
});
