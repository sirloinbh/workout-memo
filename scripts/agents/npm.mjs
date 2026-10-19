import fs from 'node:fs';
import path from 'node:path';

export function npmCommand(config = {}, platform = process.platform, node = process.execPath) {
  if (!config.npmCli && platform !== 'win32') return ['npm', []];
  const cli = config.npmCli || path.join(path.dirname(node), 'node_modules/npm/bin/npm-cli.js');
  if (!fs.existsSync(cli))
    throw new Error(
      'Set npmCli in local config to the npm-cli.js matching your Node installation.',
    );
  return [node, [cli]];
}
