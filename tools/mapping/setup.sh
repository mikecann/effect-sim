#!/bin/sh
# Sets up the camera mapping tool (README "Setup"): the Python venv for the
# image work and the Swift camera helper. Safe to run again.
set -e
cd "$(dirname "$0")"
if command -v uv >/dev/null 2>&1; then
  [ -x .venv/bin/python ] || uv venv -q --python 3.12 .venv
  uv pip install -q --python .venv/bin/python -r requirements.txt
else
  [ -x .venv/bin/python ] || python3 -m venv .venv
  .venv/bin/python -I -m pip install -q -r requirements.txt
fi
.venv/bin/python -I -c "import cv2, numpy; print('Python ready: OpenCV', cv2.__version__, 'numpy', numpy.__version__)"
mkdir -p .bin
if command -v swiftc >/dev/null 2>&1; then
  taskpolicy -b swiftc -O -o .bin/snap camera/snap.swift \
    -Xlinker -sectcreate -Xlinker __TEXT -Xlinker __info_plist -Xlinker camera/Info.plist
  echo "Camera helper built: .bin/snap"
  .bin/snap --list
else
  echo "No swiftc (install Xcode's command line tools): use --camera ffmpeg:<index> or manual instead."
fi
