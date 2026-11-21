import { createServer, type RequestListener, type Server } from 'node:http';

import { listenLocally } from './standard/api.js';

/**
 * Starts `app` on 127.0.0.1 and returns the server once it is listening (#447). The port is never one fetch refuses
 * ("bad port"), unlike a plain `app.listen(0)`. The server has no wait for the `listening` event left to do.
 */
export async function listenApp(app: RequestListener): Promise<Server> {
  const server = createServer(app);
  await listenLocally(server);
  return server;
}
