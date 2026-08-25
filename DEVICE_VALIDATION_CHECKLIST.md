# DEVICE_VALIDATION_CHECKLIST.md — Unflatten Offline

**No physical Android device or emulator was available in this build's
environment** (no USB device access; no KVM/virtualization support for an
emulator — see `DECISIONS.md` §1). Every item below is therefore
**UNVERIFIED**, stated explicitly rather than assumed or silently
omitted, per brief §39's instruction never to substitute static APK
inspection for actual device testing.

What *was* verified is build-level, not runtime-level: the app compiles,
links (including the native `arm64-v8a` NDK build), dexes, resource-
packages, and signs successfully via the real Android SDK/NDK toolchain
(see `TEST_REPORT.md` §3), and the native engine's logic is verified by 35
passing host-compiled tests (same source, cross-compiled for the target
ABI, but not executed there).

| # | Item (brief §39) | Status | Notes |
|---|---|---|---|
| 1 | Install the APK | UNVERIFIED | `adb install` was never run against a real device in this session. |
| 2 | Launch it | UNVERIFIED | |
| 3 | Import images | UNVERIFIED | Photo Picker integration, EXIF-orientation handling, and downsampling logic are code-complete and reviewed, not runtime-exercised. |
| 4 | Run decomposition | UNVERIFIED | The identical decomposition logic passes 35 host-compiled tests (`TEST_REPORT.md`), but has never run inside an Android process via JNI. |
| 5 | Interact with layers | UNVERIFIED | Compose gesture handling (pinch-zoom/pan, mask brush drag) is implemented but untested on a touchscreen or in an emulator. |
| 6 | Background/foreground the app | UNVERIFIED | |
| 7 | Rotate | UNVERIFIED | `configChanges` is set so the Activity should survive rotation without recreation; never confirmed on-device. |
| 8 | Process recreation | UNVERIFIED | Autosave-on-edit + "Resume last project" is implemented as the intended recovery path (see `ARCHITECTURE.md`); never confirmed to actually survive an OS-triggered process kill. |
| 9 | Export PSD/PNG | UNVERIFIED on-device. The encoders themselves are unit-tested by independent re-parsers (`TEST_REPORT.md`), and the MediaStore write path is implemented per Android's documented API, but never executed on a device. |
| 10 | Inspect logs | UNVERIFIED — no `logcat` session possible without a device. |
| 11 | Measure inference time | UNVERIFIED — no timing data exists for this app on any device. Do not trust any latency number for this app that isn't in this checklist as UNVERIFIED, because none was measured. |
| 12 | Measure memory | UNVERIFIED | |
| 13 | Inspect thermal behavior | UNVERIFIED — moot in any case, since this build performs no sustained GPU/NPU inference load. |
| 14 | Airplane mode | UNVERIFIED on-device, though the *reason* it should work (no INTERNET permission, verified by static APK scan — see `SECURITY.md`) is independently confirmed. |
| 15 | Repeat full workflow in airplane mode | UNVERIFIED | |

## Primary target device (brief §39: Galaxy S25 Ultra)

Not tested. No such device, nor any Snapdragon 8 Elite device, nor any
Android emulator, was reachable from this build environment.

## What would need to change to complete this checklist

Access to either (a) a physical Android device (ideally the Galaxy S25
Ultra per the brief's target) with USB debugging, or (b) an environment
with hardware virtualization (KVM) available so the Android Emulator can
run. Given either, the build artifacts already produced in this repository
(`release/Unflatten-Offline.apk`) are ready to install and exercise
against this exact checklist.
