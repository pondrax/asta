const scripts = import.meta.glob('./data/*.ts', { eager: true });

async function main() {
  const [, , ...args] = process.argv;
  const actions = Object.entries(scripts)
    .map(([key, action]) => ({ key: key.replace('./data/', '').replace('.ts', ''), action }))

  if (!args.length) {
    return console.error(`Usage: pnpm db:seed -- [${actions.map(action => action.key).join(' | ')}]\n\n`);
  }
  for (const { key, action } of actions) {
    if (args.includes(key) || args.includes('all')) {
      await (action as { default: () => Promise<void> }).default();
    }
  }
  process.exit(0);
}

main().catch(console.error);