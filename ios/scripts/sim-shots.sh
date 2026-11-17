#!/bin/zsh
# Screenshots of the main screen on sample data (-mockState, no backend and
# no real lights) into ios/screenshots, on a simulator of its own ("Lights",
# cloned from an iPhone 17 Pro on first use) that it shuts down afterwards.
#
#   ios/scripts/sim-shots.sh [dir]
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=${1:-screenshots}
mkdir -p "$OUT"
SIM_NAME=${SIM_NAME:-Lights}
SIM=$(xcrun simctl list devices available | grep -F "    $SIM_NAME (" | grep -oE "[0-9A-F-]{36}" | head -1 || true)
if [[ -z "$SIM" ]]; then
  BASE=$(xcrun simctl list devices available | grep -E "iPhone [0-9]+ Pro \(" | grep -oE "[0-9A-F-]{36}" | head -1)
  SIM=$(xcrun simctl clone "$BASE" "$SIM_NAME")
fi
if [[ $(xcrun simctl list devices booted | grep -c Booted || true) -ge 2 ]]; then
  echo "Two simulators are already booted; Mike wants no more than that." >&2
  exit 1
fi
trap 'xcrun simctl shutdown "$SIM" 2>/dev/null || true' EXIT
xcrun simctl boot "$SIM" 2>/dev/null || true
xcrun simctl bootstatus "$SIM" -b >/dev/null
DD=/tmp/lights-dd-sim
taskpolicy -b xcodebuild -project Lights.xcodeproj -scheme Lights -configuration Debug -destination "id=$SIM" \
  -derivedDataPath "$DD" build | grep -E " error:|BUILD (SUCCEEDED|FAILED)"
xcrun simctl status_bar "$SIM" override --time 9:41 --batteryLevel 100 --batteryState charged --cellularBars 4
xcrun simctl install "$SIM" "$DD/Build/Products/Debug-iphonesimulator/Lights.app"
for state in on off applying offline; do
  xcrun simctl launch --terminate-running-process "$SIM" com.mikecann.lights -mockState "$state" >/dev/null
  sleep 3
  xcrun simctl io "$SIM" screenshot "$OUT/$state.png" >/dev/null 2>&1
  echo "$OUT/$state.png"
done
