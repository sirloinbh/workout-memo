import './activity-deps-lazy';

import { parseDeferred, readActivityFile, type ReadResult } from './activity-file';
import type { WorkerMessage } from './activity-worker-core';

// #387: reads the chosen files one after another. Unzipping and FIT parsing run in a Web Worker
// so a whole-account export does not freeze the page, with progress and Cancel. Where there is no
// Worker (the unit tests' jsdom) the same work runs on the page.
export type ReadProgress = {
  file: string;
  index: number;
  count: number;
  done: number;
  total: number;
};

export type Reading = {
  promise: Promise<ReadResult & { canceled: boolean }>;
  cancel: () => void;
};

// The page parses the TCX and GPX text the worker handed back, a few files at a time so the page
// stays responsive between them.
async function parseDeferredFiles(result: ReadResult) {
  const out: ReadResult = {
    activities: [...result.activities],
    problems: [...result.problems],
    skipped: 0,
  };
  let n = 0;
  for (const item of result.deferred ?? []) {
    const parsed = parseDeferred(item);
    out.activities.push(...parsed.activities);
    if (parsed.problem) out.problems.push(parsed.problem);
    if (++n % 20 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return out;
}

export function readActivityFiles(
  files: readonly File[],
  onProgress?: (progress: ReadProgress) => void,
): Reading {
  let canceled = false;
  let worker: Worker | null = null;
  // Settles the file being read when Cancel stops its worker, which sends nothing more.
  let abort: (() => void) | null = null;
  const readOne = (file: File, index: number): Promise<ReadResult> => {
    const report = (done: number, total: number) =>
      onProgress?.({ file: file.name, index, count: files.length, done, total });
    report(0, 0);
    if (typeof Worker === 'undefined') {
      return file.arrayBuffer().then(
        (buffer) => readActivityFile(file.name, new Uint8Array(buffer)),
        () => ({
          activities: [],
          problems: [`${file.name}: Could not open the file. Choose it again.`],
          skipped: 0,
        }),
      );
    }
    return new Promise<ReadResult>((resolve, reject) => {
      const own = new Worker(new URL('./activity-worker.ts', import.meta.url), { type: 'module' });
      worker = own;
      abort = () => reject(new Error('canceled'));
      own.onmessage = (event: MessageEvent<WorkerMessage>) => {
        if (event.data.type === 'progress') report(event.data.done, event.data.total);
        else {
          own.terminate();
          resolve(parseDeferredFiles(event.data.result));
        }
      };
      own.onerror = () => {
        own.terminate();
        reject(new Error(`${file.name}: Could not read the file.`));
      };
      own.postMessage({ file });
    });
  };
  const promise = (async () => {
    const out: ReadResult = { activities: [], problems: [], skipped: 0 };
    for (const [index, file] of files.entries()) {
      if (canceled) break;
      try {
        const read = await readOne(file, index);
        if (canceled) break;
        out.activities.push(...read.activities);
        out.problems.push(...read.problems);
      } catch (e) {
        if (canceled) break;
        out.problems.push((e as Error).message);
      }
    }
    return { ...out, canceled };
  })();
  return {
    promise,
    cancel: () => {
      canceled = true;
      worker?.terminate();
      abort?.();
    },
  };
}
