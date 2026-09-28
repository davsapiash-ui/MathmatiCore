#!/usr/bin/env bash
# DEV ONLY. Starts the Firebase Emulator Suite (Auth, Firestore, RTDB) for the
# demo project "demo-mathmaticore" with the repository's real security rules.
# No real project, no credentials. The rules are copied here because the CLI
# only reads files inside the config's directory; the copies are gitignored.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p .rules
cp ../../firestore.rules .rules/firestore.rules
cp ../../database.rules.json .rules/database.rules.json
# The CLI talks to the emulators on localhost; a proxy in the environment must
# not carry those calls.
exec env -u HTTP_PROXY -u http_proxy -u HTTPS_PROXY -u https_proxy \
  -u GLOBAL_AGENT_HTTP_PROXY -u GLOBAL_AGENT_HTTPS_PROXY -u npm_config_https_proxy \
  npx -y firebase-tools@15.31.0 emulators:start --config firebase.emulators.json --project demo-mathmaticore
