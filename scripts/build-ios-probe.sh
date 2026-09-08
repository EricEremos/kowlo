#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
probe_dir="$PWD/.native-build/KowloLibraryProbe.app"
mkdir -p "$probe_dir"
probe_sdk="$(xcrun --sdk iphonesimulator --show-sdk-path)"
xcrun --sdk iphonesimulator swiftc -swift-version 5 -warnings-as-errors -sdk "$probe_sdk" \
  -target arm64-apple-ios17.0-simulator -module-name KowloLibraryProbe \
  native/ios/PhotoLibrary.swift native/ios/ProbeChecks.swift native/ios/Probe.swift -o "$probe_dir/KowloLibraryProbe"
/usr/bin/python3 - "$probe_dir" <<'PY'
import plistlib, sys
from pathlib import Path
p = Path(sys.argv[1])
with (p / 'Info.plist').open('wb') as f:
    plistlib.dump({
        'CFBundleIdentifier': 'dev.kowlo.library-probe',
        'CFBundleName': 'KOWLO Library Probe',
        'CFBundleExecutable': 'KowloLibraryProbe',
        'CFBundlePackageType': 'APPL',
        'CFBundleVersion': '1',
        'CFBundleShortVersionString': '0.1',
        'MinimumOSVersion': '17.0',
        'UIDeviceFamily': [1, 2],
        'UILaunchScreen': {},
        'NSPhotoLibraryUsageDescription': 'KOWLO reads saved photo locations to build your private atlas. Original photos are not uploaded.',
        'PHPhotoLibraryPreventAutomaticLimitedAccessAlert': True,
    }, f)
PY
codesign --force --sign - "$probe_dir"
printf '%s\n' "$probe_dir"
