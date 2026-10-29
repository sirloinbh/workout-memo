// `npm run openapi`: regenerates docs/openapi.json from the routes and schemas.
import { readFile, writeFile } from 'node:fs/promises';

import type { Pool } from 'pg';

import { createApp } from './app.js';
import { buildOpenApi, routeDescriptions } from './openapi.js';

const docs = new URL('../../docs/', import.meta.url);
const markdown = await readFile(new URL('api.md', docs), 'utf8');
// Routes are only registered, never called, so no database connection is opened.
const spec = buildOpenApi(createApp({} as Pool), routeDescriptions(markdown));
await writeFile(new URL('openapi.json', docs), JSON.stringify(spec, null, 2) + '\n');
console.log(`docs/openapi.json: ${Object.keys(spec.paths).length} paths`);
