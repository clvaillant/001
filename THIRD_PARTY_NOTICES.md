# THIRD_PARTY_NOTICES.md — Unflatten Offline

This application is built with the following third-party software. No
trained ML model weights are bundled (see `MODEL_LICENSES.md`).

## Runtime dependencies (ship inside the APK)

| Component | License | Notes |
|---|---|---|
| AndroidX Core KTX, Lifecycle, Activity Compose, Compose UI/Material3, ExifInterface | Apache License 2.0 | Google/AndroidX Jetpack libraries. |
| Kotlin standard library | Apache License 2.0 | JetBrains. |
| zlib | zlib License | Provided by the Android NDK sysroot (`libz.so`), used by the native engine for chunk/tile compression and by the PNG writer's DEFLATE stream. Not bundled as source; linked against the NDK-provided shared library. |
| org.json (`org.json.JSONObject`/`JSONArray`) | Provided by the Android platform (AOSP), not a bundled dependency | Used for `metadata.json` / diagnostics JSON construction. |

## Build/test-only dependencies (do NOT ship inside the APK)

| Component | License | Scope |
|---|---|---|
| JUnit 4 | Eclipse Public License 1.0 | `testImplementation` only. |
| Google Truth | Apache License 2.0 | `testImplementation` only. |
| Robolectric | MIT License | `testImplementation` only (declared; this build's actual unit tests are plain JUnit and do not require Robolectric's Android-framework shadowing, so it is a declared-but-currently-unexercised test dependency — see `TEST_REPORT.md`). |
| AndroidX Test (core, ext:junit, Espresso) | Apache License 2.0 | `androidTestImplementation` only; no instrumented tests were run in this build session (no device/emulator — see `DEVICE_VALIDATION_CHECKLIST.md`), but the dependency and directory (`app/src/androidTest/`) are present for when one is available. |
| Android Gradle Plugin, Android SDK, Android NDK, CMake | Android Software Development Kit License / Apache 2.0 | Build tooling only, not distributed with the app. |
| Gradle | Apache License 2.0 | Build tooling only. |

## Full license texts

Apache License 2.0: https://www.apache.org/licenses/LICENSE-2.0 (text
not reproduced here for brevity; this is the standard, unmodified Apache
2.0 license used by all AndroidX/Kotlin/Google components above).

zlib License: standard, unmodified zlib/libpng license as shipped with
zlib itself (see the NDK's `sysroot/usr/include/zlib.h` header comment for
the canonical text).

Eclipse Public License 1.0 and MIT License: standard, unmodified texts for
JUnit 4 and Robolectric respectively.

## Machine-readable version

See `SBOM.json` for a structured component/version/license listing.
