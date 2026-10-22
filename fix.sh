#!/bin/bash

if [ -f "build/server/index.js" ]; then
    sed -i.bak.js 's/request_origin !== url.origin/!request_origin.includes(url.host)/g' build/server/index.js
fi

# Stamp the service worker with a per-build version. A browser only reinstalls
# a service worker when its bytes change, so without this the worker (and the
# cache it controls) would survive every deployment and keep serving the
# previous release.
BUILD_VERSION="$(git rev-parse --short HEAD 2>/dev/null || echo nogit)-$(date +%s)"

for SW in build/client/sw.js build/static/sw.js; do
    if [ -f "$SW" ]; then
        sed -i.bak.js "s/__ASTA_BUILD_VERSION__/${BUILD_VERSION}/g" "$SW"
        rm -f "${SW}.bak.js"
    fi
done
