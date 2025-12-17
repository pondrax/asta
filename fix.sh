#!/bin/bash

sed -i.bak.js 's/request_origin !== url.origin/!request_origin.includes(url.host)/g' build/server/index.js