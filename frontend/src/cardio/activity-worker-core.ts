import { readActivityFile, type ReadResult } from './activity-file';

// #387: the part of reading an activity file that runs inside the Web Worker (activity-worker.ts):
// opening the file, unzipping a ZIP and reading FIT files, which can freeze the page for a
// whole-account export. It talks to the page with these messages.
export type WorkerRequest = { file: File };
export type WorkerMessage =
  { type: 'progress'; done: number; total: number } | { type: 'done'; result: ReadResult };

export async function readInWorker(file: File, post: (message: WorkerMessage) => void) {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    // E.g. the file was moved or deleted after it was chosen.
    post({
      type: 'done',
      result: {
        activities: [],
        problems: [`${file.name}: Could not open the file. Choose it again.`],
        skipped: 0,
      },
    });
    return;
  }
  // TCX and GPX need DOMParser, which a worker does not have: their text goes back to the page.
  const result = await readActivityFile(file.name, bytes, 0, {
    xml: 'defer',
    onProgress: (done, total) => post({ type: 'progress', done, total }),
  });
  post({ type: 'done', result });
}
