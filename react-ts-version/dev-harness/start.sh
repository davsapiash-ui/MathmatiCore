#!/usr/bin/env bash
# DEV ONLY. Starts the emulators (demo project, the repository's real rules) and
# the frontend pointed at them. Needs firebase-tools (FIREBASE_BIN) and Java.
set -euo pipefail
cd "$(dirname "$0")"
# The emulators only read rules inside this folder: copy the real ones fresh.
mkdir -p .rules && cp ../../database.rules.json ../../firestore.rules .rules/
FIREBASE_BIN="${FIREBASE_BIN:-npx firebase}"
$FIREBASE_BIN emulators:start --project demo-mathmaticore --config firebase.harness.json --only auth,database,firestore > emulators.log 2>&1 &
export VITE_FIREBASE_PROJECT_ID=demo-mathmaticore
export VITE_FIREBASE_API_KEY=demo-key
export VITE_FIREBASE_AUTH_DOMAIN=demo-mathmaticore.firebaseapp.com
export VITE_FIREBASE_DATABASE_URL="http://127.0.0.1:9000?ns=demo-mathmaticore-default-rtdb"
export VITE_FIREBASE_STORAGE_BUCKET=demo-mathmaticore.appspot.com
(cd .. && npx vite --config dev-harness/vite.harness.config.ts > dev-harness/vite.log 2>&1) &
wait
