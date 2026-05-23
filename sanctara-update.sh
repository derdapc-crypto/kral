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
git fetch origin "${REMOTE_BRANCH}"
git pull --rebase --autostash origin "${REMOTE_BRANCH}"
# Set upstream so future plain `git pull` works
git branch --set-upstream-to="origin/${REMOTE_BRANCH}" "${BRANCH}" 2>/dev/null || true

echo ""
echo "═══ 2. APK'ları frontend/build'e kopyala ═══"
mkdir -p frontend/build
if [ -f frontend/public/sanctara-light.apk ]; then
    cp -f frontend/public/sanctara-light.apk frontend/build/sanctara-light.apk
    echo "✓ Light APK güncellendi ($(stat -c%s frontend/build/sanctara-light.apk) bytes)"
fi
if [ -f frontend/public/sanctara-node-pro.apk ]; then
    cp -f frontend/public/sanctara-node-pro.apk frontend/build/sanctara-node-pro.apk
    echo "✓ Node Pro APK güncellendi ($(stat -c%s frontend/build/sanctara-node-pro.apk) bytes)"
fi
chmod 644 frontend/build/sanctara-*.apk 2>/dev/null
chown -R caddy:caddy frontend/build 2>/dev/null || chown -R www-data:www-data frontend/build 2>/dev/null

echo ""
echo "═══ 3. Caddy + Backend reload ═══"
systemctl reload caddy
# Don't restart backend unless server.py changed
if git diff HEAD@{1} HEAD --name-only 2>/dev/null | grep -q "backend/"; then
    echo "Backend kodu değişti → restart"
    systemctl restart sanctara-backend
fi

echo ""
echo "═══ 4. Canlı URL testi ═══"
curl -sI https://sanctara.io/sanctara-light.apk    | head -1
curl -sI https://sanctara.io/sanctara-node-pro.apk | head -1

echo ""
echo "╔════════════════════════════════════╗"
echo "║  ✅ GÜNCELLEME TAMAMLANDI         ║"
echo "║  https://sanctara.io artık güncel ║"
echo "╚════════════════════════════════════╝"
