#!/bin/bash
# Production pnpm auto-deploy with smart install

LOG_FILE="deploy.log"
cd "$(dirname "$0")"

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

log "🔍 Checking for updates..."

OLD_HASH=$(git rev-parse HEAD)
git fetch origin

if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
    log "🔄 Pulling updates..."
    git pull origin main
    
    # Store new hash
    NEW_HASH=$(git rev-parse HEAD)
    
    # Check package changes
    OLD_PACKAGE_HASH=$(git show "$OLD_HASH:package.json" 2>/dev/null | md5sum)
    NEW_PACKAGE_HASH=$(git show "$NEW_HASH:package.json" 2>/dev/null | md5sum)
    
    if [ "$OLD_PACKAGE_HASH" != "$NEW_PACKAGE_HASH" ]; then
        log "📦 Packages changed, installing..."
        pnpm install --frozen-lockfile
    else
        log "✅ Packages unchanged"
    fi
    
    log "🔨 Building..."
    pnpm run build
    
    # Restart with PM2 or similar
    log "🚀 Restarting application..."
    pnpm serve
    
    log "✅ Deploy complete"
else
    log "✅ Already up to date"
fi