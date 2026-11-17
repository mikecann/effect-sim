#!/bin/zsh
# Build Lights for a real iPhone, install it and launch it.
# Signs with automatic provisioning through the App Store Connect API key in
# ~/.config/poddle (the same key Poddle uses), so no Xcode account is needed.
#
#   ios/scripts/install-phone.sh                 build, install, launch
#   BUILD_ONLY=1 ios/scripts/install-phone.sh    just build
#   DEVICE=<udid> CONFIG=Release ...             another phone or config
set -euo pipefail
cd "$(dirname "$0")/.."
CONFIG=${CONFIG:-Debug}
DEVICE=${DEVICE:-00008130-001939C80483401C}   # Mike's 15 Pro Max
DD=${DD:-/tmp/lights-dd-device}
ASC_KEY_ID=${ASC_KEY_ID:-7SS6J9F98P}
ASC_ISSUER_ID=${ASC_ISSUER_ID:-69a6de6f-a06e-47e3-e053-5b8c7c11a4d1}
ASC_KEY=${ASC_KEY:-$HOME/.config/poddle/AuthKey_$ASC_KEY_ID.p8}
extra=(-allowProvisioningUpdates -allowProvisioningDeviceRegistration)
[[ -f "$ASC_KEY" ]] && extra+=(-authenticationKeyPath "$ASC_KEY" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID")
taskpolicy -b xcodebuild -project Lights.xcodeproj -scheme Lights -configuration "$CONFIG" \
  -destination 'generic/platform=iOS' -derivedDataPath "$DD" "${extra[@]}" build | grep -E " error:|BUILD (SUCCEEDED|FAILED)"
APP="$DD/Build/Products/$CONFIG-iphoneos/Lights.app"
[[ "${BUILD_ONLY:-0}" == 1 ]] && { echo "Built $APP"; exit 0; }
# Away from home the phone's link to the Mac comes and goes, so keep trying
# (TRIES, 30 s apart) rather than giving up on the first "unavailable".
TRIES=${TRIES:-20}
for i in $(seq 1 "$TRIES"); do
  if xcrun devicectl device install app --device "$DEVICE" "$APP"; then
    xcrun devicectl device process launch --device "$DEVICE" --terminate-existing com.mikecann.lights || true
    exit 0
  fi
  echo "Install try $i of $TRIES failed, retrying in 30 s..."
  sleep 30
done
exit 1
