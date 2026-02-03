import { execSync } from 'node:child_process';

const BASE_URL = process.env.TEST_URL;
console.log('baseUrl:', BASE_URL)
execSync(`k6 run --env BASE_URL=${BASE_URL} web/tests/load.js --out csv=web/tests/results/${Date.now()}.csv`, {
  stdio: 'inherit'
});
