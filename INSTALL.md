# INSTALL.md

## Installing the pre-built APK

The release APK is at `release/Unflatten-Offline.apk`
(`release/Unflatten-Offline.apk.sha256` has its checksum). It is
**development-signed** (`CN=Android Debug`) — not a production Play/
enterprise release key (see `BUILD_REPORT.md` §5).

Verify the checksum before installing:

```
sha256sum -c release/Unflatten-Offline.apk.sha256
```

Install with `adb` (requires a device with Developer Options / USB
debugging enabled, or Play Protect's "install unknown apps" allowed for
your file manager):

```
adb install release/Unflatten-Offline.apk
```

minSdk 26 (Android 8.0), targetSdk 35 (Android 15), `arm64-v8a` only (see
DECISIONS.md #2). **This has not been installed on or run against a real
device or emulator in this build session** — no Android device or
emulator was available in the environment this was built in (see
DECISIONS.md #1, `DEVICE_VALIDATION_CHECKLIST.md`). It has been fully
build-verified: compiled, dexed, resource-packaged, and signed by the real
Android SDK/NDK toolchain.

## Building from source

Requires: JDK 17+, Android SDK (platform 35, build-tools 35.0.0), Android
NDK r27c, CMake 3.22.1. All of these are pinned in
`android/app/build.gradle.kts` / `android/local.properties`.

```
cd android
./gradlew assembleDebug     # -> app/build/outputs/apk/debug/app-debug.apk
./gradlew assembleRelease   # -> app/build/outputs/apk/release/app-release.apk
```

`local.properties` (not committed — machine-specific) needs:

```
sdk.dir=/path/to/your/android-sdk
```

## Running the native engine's own test suite (no Android tooling needed)

```
cd android/native_host_tests
mkdir -p build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Debug
make -j4
./unflatten_engine_tests
```

## Running the Kotlin/JVM unit tests

```
cd android
./gradlew testDebugUnitTest
```

## Running the security audit against a built APK

```
./scripts/security_audit.sh android/app/build/outputs/apk/release/app-release.apk
```
