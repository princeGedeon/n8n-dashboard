#!/usr/bin/env bash
# Met à jour l'app depuis Git puis la redémarre.
# Usage (sur le serveur) : sudo /opt/lapland/formulaires/deploy/update.sh
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REPO_DIR="$(cd "$APP_DIR/.." && pwd)"
as_app() { sudo -u formulaires -H bash -c "$1"; }

as_app "cd '$REPO_DIR' && git pull --ff-only"
as_app "cd '$APP_DIR' && npm ci && npm run build"
systemctl restart formulaires
sleep 2
systemctl --no-pager --lines=5 status formulaires
curl -fsS -o /dev/null -w "Vérification : HTTP %{http_code}\n" http://127.0.0.1:4321/admin/login
