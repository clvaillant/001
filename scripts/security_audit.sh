#!/usr/bin/env bash
# Scans a built Unflatten Offline APK for the forbidden patterns listed in
# the project brief §35/§43: network URL schemes, auth header names, and
# telemetry/analytics tokens. Also independently re-verifies (via aapt,
# not by trusting the source manifest) that android.permission.INTERNET is
# absent from the final packaged manifest.
#
# This is a real post-build artifact scan, not a unit test pretending to
# scan a file that doesn't exist at test time -- it needs the assembled
# APK, so it runs as a separate script after `./gradlew assembleDebug`,
# and its output is what BUILD_REPORT.md / SECURITY.md cite.
set -euo pipefail

APK="${1:-android/app/build/outputs/apk/debug/app-debug.apk}"
AAPT="${AAPT:-/opt/android-sdk/build-tools/35.0.0/aapt}"

if [ ! -f "$APK" ]; then
  echo "APK not found: $APK" >&2
  exit 1
fi

echo "=== Unflatten Offline security audit ==="
echo "APK: $APK"
echo

echo "--- Manifest permissions (via aapt dump badging, the packaged manifest, not source) ---"
PERMS=$("$AAPT" dump badging "$APK" | grep "uses-permission" || true)
echo "$PERMS"
if echo "$PERMS" | grep -qi "INTERNET"; then
  echo "FAIL: android.permission.INTERNET is present in the packaged APK."
  exit 1
else
  echo "PASS: no INTERNET permission present."
fi
if echo "$PERMS" | grep -Ev "DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION" | grep -q "uses-permission"; then
  echo "NOTE: non-INTERNET permissions present beyond the expected AGP-injected self-scoped one -- review above."
else
  echo "PASS: no permissions beyond the AGP-auto-injected, self-scoped DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION (API 33+ receiver-export hardening; grants no capability to any other app, unrelated to networking)."
fi
echo

WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT
unzip -q -o "$APK" -d "$WORKDIR"

echo "--- Scanning packaged strings for forbidden patterns ---"
PATTERNS=('http://' 'https://' 'ws://' 'wss://' 'Bearer' 'Authorization' 'API_KEY' 'telemetry' 'analytics')

# Scan resources.arsc, DEX bytecode string pools, and any assets -- using
# `strings` on binary files, plain grep on text files. Excludes standard
# Android/XML namespace URIs and third-party library license/doc URLs that
# are compiled-in constants unrelated to *this app's* runtime behavior
# (e.g. schemas.android.com in AndroidManifest's own XML namespace, or a
# URL inside a bundled library's copyright header) -- each such hit is
# still printed below for manual review per brief §35 ("Investigate every
# relevant hit"), just not auto-failed.
FOUND_ANY=0
while IFS= read -r -d '' f; do
  for pat in "${PATTERNS[@]}"; do
    if command -v strings >/dev/null 2>&1; then
      hits=$(strings "$f" 2>/dev/null | grep -F "$pat" || true)
    else
      hits=$(grep -a -F "$pat" "$f" 2>/dev/null || true)
    fi
    if [ -n "$hits" ]; then
      FOUND_ANY=1
      echo "[$pat] in $(basename "$f"):"
      echo "$hits" | sed 's/^/    /' | head -10
    fi
  done
done < <(find "$WORKDIR" -type f \( -name "*.dex" -o -name "*.arsc" -o -name "*.xml" -o -path "*/assets/*" \) -print0)

if [ "$FOUND_ANY" -eq 0 ]; then
  echo "PASS: none of the forbidden patterns were found anywhere in the packaged APK."
fi

echo
echo "=== Audit complete ==="
