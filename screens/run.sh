#!/bin/bash
# Harness only (scratchpad). Usage: run.sh before|after
set -u
PH=$1; H=/tmp/claude-0/-home-user-MathmatiCore/67c3169d-0f15-5660-b671-c80adb8a4d80/scratchpad/harness
if [ $PH = before ]; then R=/tmp/claude-0/-home-user-MathmatiCore/67c3169d-0f15-5660-b671-c80adb8a4d80/scratchpad/before-wt; else R=/home/user/MathmatiCore; fi
cd $H
firebase emulators:start --config $H/firebase.$PH.json --project demo-mathmaticore --only auth,firestore,database > $H/emu.$PH.log 2>&1 &
EMU=$!
for i in $(seq 1 90); do curl -s -o /dev/null http://127.0.0.1:9099/ && curl -s -o /dev/null http://127.0.0.1:9000/.json?ns=demo-mathmaticore-default-rtdb && curl -s -o /dev/null http://127.0.0.1:8080/ && break; sleep 1; done
# The real RTDB rules of this checkout, loaded straight into the emulator.
curl -s -X PUT -H "Authorization: Bearer owner" --data-binary @$R/database.rules.json "http://127.0.0.1:9000/.settings/rules.json?ns=demo-mathmaticore-default-rtdb"; echo
PHASE=$PH HEARTBEAT=1 node $H/seed.mjs > $H/seed.$PH.log 2>&1 &
SEED=$!
for i in $(seq 1 30); do [ -f $H/tokens.json ] && grep -q seeded $H/seed.$PH.log && break; sleep 1; done
(cd $R/react-ts-version && APP_ROOT=$R/react-ts-version PORT=5173 ./node_modules/.bin/vite --config $H/vite.harness.config.mjs > $H/vite.$PH.log 2>&1) &
VITE=$!
for i in $(seq 1 60); do curl -s -o /dev/null http://127.0.0.1:5173/ && break; sleep 1; done
PHASE=$PH node $H/shoot.mjs > $H/shoot.$PH.log 2>&1; echo shoot-exit=$?
pkill -f "node_modules/.bin/vite --config"; kill $SEED; kill $EMU; wait $EMU 2>/dev/null
rm -f $H/tokens.json
