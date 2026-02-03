

import http from 'k6/http';
import { sleep, check } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5173/healthcheck';

export const options = {
  vus: 20,          // number of virtual users
  duration: '10s', // how long to run the test
};

export default function () {
  const res = http.get(BASE_URL);
  check(res, {
    'status is 200': (r) => r.status === 200,
  });
  sleep(1);
}
