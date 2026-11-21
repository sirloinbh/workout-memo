import { RequestError, requestJson } from '../lib/api';

// #109: the request never reached an answer from the app server (offline, server down behind the
// proxy or the 15 s deadline), as opposed to an error the API returned. Its message replaces the
// browser's "Failed to fetch".
export class Unreachable extends Error {}
const GENERIC_FAILURE = 'Could not process the request';
export async function api<T>(
  path: string,
  method = 'GET',
  body?: unknown,
  key?: string,
): Promise<T> {
  try {
    return await requestJson<T>('/api' + path, {
      method,
      body,
      timeoutMs: 15000,
      headers: key ? { 'Idempotency-Key': key } : undefined,
    });
  } catch (cause) {
    if (!(cause instanceof RequestError)) throw cause;
    if (cause.kind === 'timeout')
      throw new Unreachable('The server did not answer within 15 seconds.', { cause });
    if (cause.kind === 'network')
      throw new Unreachable('Cannot reach the server. Check your connection.', { cause });
    // A non-JSON 5xx is the proxy's page (for example 502 while the API restarts). Other
    // non-JSON errors (such as a 401 page) did reach a server, so they are not Unreachable.
    if (cause.kind === 'http' && cause.message === GENERIC_FAILURE && cause.status !== undefined) {
      if (cause.status >= 500)
        throw new Unreachable(`The server is not answering (HTTP ${cause.status}).`, { cause });
      throw Error(`The request failed (HTTP ${cause.status}).`, { cause });
    }
    throw cause;
  }
}
