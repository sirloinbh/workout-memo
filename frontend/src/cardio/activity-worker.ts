import * as fit from '@garmin/fitsdk';
import * as fflate from 'fflate';

import { deps } from './activity-deps';
import { readInWorker, type WorkerRequest } from './activity-worker-core';

// #387: the Web Worker entry. One request is one chosen file; the page may stop it with
// worker.terminate() (Cancel). The libraries are imported statically here (see activity-deps.ts).
deps.fflate = () => Promise.resolve(fflate);
deps.fit = () => Promise.resolve(fit);
self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  void readInWorker(event.data.file, (message) => self.postMessage(message));
});
