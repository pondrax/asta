import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { globTs } from './utils';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, 'data');

async function main() {
  const [, , ...args] = process.argv;
  const scripts = await globTs<{ default: () => Promise<void> }>(dataDir);
  const actions = Object.entries(scripts)
    .map(([key, action]) => ({ key, action }))

  if (!args.length) {
    return console.error(`Usage: bun run db:seed -- [${actions.map(action => action.key).join(' | ')}]\n\n`);
  }
  for (const { key, action } of actions) {
    if (args.includes(key) || args.includes('all')) {
      await (action as { default: () => Promise<void> }).default();
    }
  }
  process.exit(0);
}

main().catch(console.error);