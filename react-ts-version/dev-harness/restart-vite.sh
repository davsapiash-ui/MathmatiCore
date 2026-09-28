#!/usr/bin/env bash
# DEV ONLY. Runs only the frontend of the harness (the emulators keep running).
set -euo pipefail
cd "$(dirname "$0")/.."
export VITE_FIREBASE_PROJECT_ID=demo-mathmaticore
export VITE_FIREBASE_API_KEY=demo-key
export VITE_FIREBASE_AUTH_DOMAIN=demo-mathmaticore.firebaseapp.com
export VITE_FIREBASE_DATABASE_URL="http://127.0.0.1:9000?ns=demo-mathmaticore-default-rtdb"
export VITE_FIREBASE_STORAGE_BUCKET=demo-mathmaticore.appspot.com
exec npx vite --config dev-harness/vite.harness.config.ts "$@"
