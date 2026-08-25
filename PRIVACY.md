# PRIVACY.md — Unflatten Offline

## Summary

Unflatten Offline processes your photographs entirely on your device. It
has no networking code, no analytics, no telemetry, no crash-reporting
service, no account system, and no server of any kind to send data to even
if it wanted to.

## Verified, not just claimed

- The packaged app has **no `android.permission.INTERNET`** and no other
  networking permission. Verified by `aapt dump badging` against the
  actual built APK (not the source manifest) — see `SECURITY.md`. Without
  this permission, Android itself blocks the app from opening any network
  socket; this is an OS-enforced capability boundary, not a policy this
  document merely asserts.
- `scripts/security_audit.sh` scans the built APK's DEX bytecode,
  resources, and assets for URL schemes and telemetry/analytics-SDK
  string markers. Every hit found was investigated and is a compiled-in
  XML namespace URI or a third-party library's own internal bug-report
  string literal — see `BUILD_REPORT.md` §5 and `SECURITY.md` for the
  full accounting. No analytics or telemetry SDK is integrated.
- `android/app/src/main/res/xml/data_extraction_rules.xml` excludes all
  app data from Android's cloud backup and device-transfer mechanisms, so
  your photos and projects don't leave the device via those platform
  channels either.
- No account, sign-in, or cloud sync of any kind exists in this app.

## What the app stores, and where

- **Your imported photo and the project it becomes**: stored locally as a
  `.uf7p` project file, either at a location you choose (via the system's
  file picker/Storage Access Framework) or auto-saved to this app's
  private storage (`autosave.uf7p`, not accessible to other apps) so you
  don't lose work if the app is killed by the system.
- **Exports** (PNG layer stack, PSD, project file, diagnostics JSON): only
  written when you explicitly export, to a folder under `Downloads/
  Unflatten/` (via Android's MediaStore, on Android 10+) that you can see
  and manage in your Files app like any other download.
- **Nothing** is cached, logged, or written anywhere outside your device's
  local storage.

## Diagnostics

The app can export a device-diagnostics JSON file (device model, Android
version, screen size, memory figures, current project's pipeline stage)
for your own troubleshooting use. This file is written to local storage
only when you explicitly trigger it, and is never transmitted anywhere —
see `DeviceDiagnostics.kt`.

## Permissions this app requests

None, beyond what Android's build tooling auto-injects for its own
internal hardening (a self-scoped
`DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`, unrelated to data access — see
`SECURITY.md`). Import uses the system Photo Picker and export uses
MediaStore's scoped-storage APIs, neither of which requires a runtime
storage permission grant on this app's target Android versions.
