#!/usr/bin/env bash
# DEV-ONLY. Starts auth, Firestore and RTDB emulators for the demo project with
# the repo's REAL security rules. No real credentials are involved.
# Firestore rules are copied next to this config (the emulator refuses paths
# outside its project dir). RTDB rules are PUT by seed.mjs after start: the
# CLI's own upload of them goes through the outbound proxy in some sandboxes.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p .rules
cp ../../firestore.rules .rules/
exec ${FIREBASE_BIN:-npx firebase-tools} emulators:start --project demo-mathmaticore --config firebase.harness.json
