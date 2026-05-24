#!/bin/bash
# Sanctara VPS auto-update script
# Usage: bash /root/sanctara-update.sh
#
# What it does:
#   1. Pulls latest code from GitHub (including freshly-built APKs)
#   2. Copies APKs into Caddy-served frontend/build/
#   3. Reloads Caddy + backend
#   4. Verifies APK URLs are live

set -e
cd /root/sanctara

echo "═══ 1. git pull (kod + APK indir) ═══"
# Always pull explicitly from origin/<current-branch> so it works even when
# the local branch has no upstream tracking configured (common on fresh VPS clones).
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)"
if [ "$BRANCH" = "HEAD" ] || [ -z "$BRANCH" ]; then BRANCH="main"; fi
# Try origin/<branch>, fall back to main, then master
if git ls-remote --exit-code --heads origin "$BRANCH" >/dev/null 2>&1; then
    REMOTE_BRANCH="$BRANCH"
elif git ls-remote --exit-code --heads origin main >/dev/null 2>&1; then
    REMOTE_BRANCH="main"
else
    REMOTE_BRANCH="master"
fi
echo "→ Pulling origin/${REMOTE_BRANCH} (local branch: ${BRANCH})"
# Discard runtime-only files the backend rewrites every tick — never blocks the pull.
git checkout -- backend/miner/randomx_status.json 2>/dev/null || true
git checkout -- backend/miner/status.json 2>/dev/null || true
# Stash anything else the user touched locally so the pull never aborts.
STASHED=0
if ! git diff --quiet || ! git diff --cached --quiet; then
    git stash push -u -m "sanctara-update-autostash-$(date +%s)" >/dev/null 2>&1 && STASHED=1 || true
fi
git fetch origin "${REMOTE_BRANCH}"
git pull --rebase origin "${REMOTE_BRANCH}"
# Set upstream so future plain `git pull` works
git branch --set-upstream-to="origin/${REMOTE_BRANCH}" "${BRANCH}" 2>/dev/null || true
# Restore any genuine local edits (best-effort; conflicts are surfaced).
if [ "$STASHED" = "1" ]; then
    git stash pop 2>/dev/null || echo "⚠ stash pop conflicted — your edits are still in 'git stash list'"
fi

echo ""
echo "═══ 2. Frontend yeniden derle (yarn build) ═══"
# v1.8.2 — re-build the React app so newly pulled JSX/CSS actually reaches the
# served bundle. Without this step Caddy keeps serving the previous build
# while git pull only updated the source files.
cd frontend
if [ -f yarn.lock ]; then
    yarn install --frozen-lockfile --silent 2>&1 | tail -3 || yarn install --silent 2>&1 | tail -3
    yarn build 2>&1 | tail -5
else
    npm ci --silent 2>&1 | tail -3 || npm install --silent 2>&1 | tail -3
    npm run build 2>&1 | tail -5
fi
cd ..

echo ""
echo "═══ 3. APK'ları GitHub Releases'tan indir (tag: latest) ═══"
mkdir -p frontend/build frontend/public
# Repo is hardcoded here so the script doesn't depend on git remote parsing.
REPO="derdapc-crypto/kral"
REL_BASE="https://github.com/${REPO}/releases/latest/download"

download_apk () {
    local name="$1"
    local url="${REL_BASE}/${name}"
    local tmp="frontend/build/${name}.tmp"
    local final="frontend/build/${name}"
    echo "→ ${url}"
    # Follow redirects; fail loudly on 404 so we don't silently keep stale files.
    if curl -fSL --retry 3 --retry-delay 2 -o "${tmp}" "${url}"; then
        local size
        size=$(stat -c%s "${tmp}")
        # Sanity-check: APKs are always at least 30 KB. Anything smaller is an
        # HTML error page we ignored.
        if [ "${size}" -lt 30000 ]; then
            echo "⚠ ${name} indirilen dosya çok küçük (${size} bytes) — atlandı"
            rm -f "${tmp}"
            return 1
        fi
        mv -f "${tmp}" "${final}"
        # Mirror to /public so /api/apk/version's disk-read can compute sha256.
        cp -f "${final}" "frontend/public/${name}"
        echo "✓ ${name} güncellendi (${size} bytes)"
    else
        echo "⚠ ${name} indirilemedi — Release yok veya erişilemez"
        rm -f "${tmp}"
        return 1
    fi
}

download_apk sanctara-light.apk    || true
download_apk sanctara-node-pro.apk || true

chmod 644 frontend/build/sanctara-*.apk 2>/dev/null || true
chown -R caddy:caddy frontend/build 2>/dev/null || chown -R www-data:www-data frontend/build 2>/dev/null || true

echo ""
echo "═══ 4. Caddy + Backend reload ═══"
systemctl reload caddy 2>/dev/null || true
# Always restart backend since we don't reliably know if backend/* changed
# after a rebase. Restart is cheap (<2s) and avoids stale-code drift.
systemctl restart sanctara-backend 2>/dev/null || true
sleep 2

echo ""
echo "═══ 5. Canlı URL testi ═══"
curl -sI https://sanctara.io/sanctara-light.apk    | head -1
curl -sI https://sanctara.io/sanctara-node-pro.apk | head -1

echo ""
echo "╔════════════════════════════════════╗"
echo "║  ✅ GÜNCELLEME TAMAMLANDI         ║"
echo "║  https://sanctara.io artık güncel ║"
echo "╚════════════════════════════════════╝"
