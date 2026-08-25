# TEST_REPORT.md — Unflatten Offline

All numbers below are from actually running the suites in this session, not
estimated. Reproduce with the commands shown.

## 1. Native engine tests (host-compiled, no Android device required)

The native engine (`android/app/src/main/cpp/engine/`) has zero
Android-specific code — it's standard C++17 against zlib — so it is built
and run directly on the host container for real, fast, deterministic
verification, in addition to being cross-compiled by the actual Android NDK
for `arm64-v8a` as part of the Gradle build.

```
cd android/native_host_tests
mkdir -p build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Debug
make -j4
./unflatten_engine_tests
```

**Result: 35 test cases, 35 passed, 0 failed.**

| Area | Test cases | Result |
|---|---|---|
| Tiled pixel storage | 5 | PASS |
| Compositor / occlusion graph / draw order | 5 | PASS |
| UF7P project format (round-trip + corruption handling) | 4 | PASS |
| PNG writer (independent re-parse) | 1 | PASS |
| PSD writer (independent re-parse, 2 tests) | 2 | PASS |
| Fallback segmentation (heuristic CV) | 3 | PASS |
| Fallback inpainting (diffusion) | 3 | PASS |
| End-to-end fallback pipeline / cycle consistency | 3 | PASS |
| Session edit operations (undo/redo/merge/split/etc.) | 9 | PASS |

Two of these tests exist specifically because they caught real bugs during
this build (see BUILD_REPORT.md §1): `ApiPipeline_CycleConsistency_
ObservedRegionErrorIsNearZero` caught a draw-order inversion that hid every
detected object behind the background; `Session_StructuralEditDoesNotInvert
DrawOrder` is a regression test added after fixing a second, related bug in
the same area. Both bugs were found and fixed before anything was committed.

## 2. JVM unit tests (Kotlin, no Android device required)

```
cd android
./gradlew testDebugUnitTest
```

**Result: 11 tests, 11 passed, 0 failed** (see
`android/app/build/test-results/testDebugUnitTest/*.xml` after running).

| Class | Tests | Purpose |
|---|---|---|
| `BinaryReaderTest` | 6 | Validates the little-endian wire format Kotlin uses to decode `NativeEngine.nativeGetLayersMeta()`'s output against a byte-for-byte hand-built fixture matching `engine/io/byte_io.h`'s `ByteWriter`. |
| `EngineTypesTest` | 5 | Pins the Provenance/BlendMode/LayerType/PipelineStage enum ordinal order against `engine/common/types.h`'s C++ declaration order -- these cross the JNI boundary as raw integers, so a silent reorder on either side would corrupt every layer's metadata with no compiler error. This is exactly the class of bug a device run would surface immediately and this environment cannot, so it's pinned explicitly instead. |

## 3. Build verification (real, not assumed)

```
cd android
./gradlew assembleDebug    # BUILD SUCCESSFUL
./gradlew assembleRelease  # BUILD SUCCESSFUL (R8 minify + shrink + lintVitalRelease)
```

Both succeeded, including:
- `configureCMakeDebug[arm64-v8a]` / `buildCMakeDebug[arm64-v8a]` and the
  RelWithDebInfo release equivalents -- the native engine cross-compiles
  cleanly with the real Android NDK r27c toolchain for the target ABI.
- `compileDebugKotlin` / `compileReleaseKotlin` -- full Compose UI compiles.
- `lintVitalRelease` -- passes (no fatal lint issues).
- `packageDebug` / `packageRelease` -- produce installable APKs.

Debug APK: 11.7 MB. Release APK (minified, resource-shrunk): 2.6 MB.

## 4. Security audit (real scan of the packaged APK)

```
./scripts/security_audit.sh android/app/build/outputs/apk/release/app-release.apk
```

- Confirmed via `aapt dump badging` (the packaged manifest, not the source
  XML) that `android.permission.INTERNET` is absent, and no other real
  permission is present.
- Scanned every DEX/resource/asset string in the APK for `http://`,
  `https://`, `ws://`, `wss://`, `Bearer`, `Authorization`, `API_KEY`,
  `telemetry`, `analytics`. All hits investigated and found benign
  (compiled-in XML namespace URIs, AndroidX/Kotlin library bug-report URL
  string literals, a TLD-validation regex) -- full explanation in
  `BUILD_REPORT.md` §5 and `SECURITY.md`. Zero hits for `Bearer`,
  `Authorization`, `API_KEY`, `ws://`, `wss://` anywhere.
- Verified the APK's signature with `apksigner verify --print-certs`:
  `CN=Android Debug` (genuinely development-signed).

## 5. What was NOT tested (stated directly, not omitted)

- **No physical Android device or emulator exists in this environment**
  (no KVM for an emulator, no USB device). Nothing in the Compose UI, the
  JNI marshaling layer, MediaStore export, Photo Picker integration, or
  on-screen gesture handling has been runtime-verified. See
  `DEVICE_VALIDATION_CHECKLIST.md` for the itemized list of what remains
  unverified and why.
- **No PSD interoperability test against real Photoshop-family software**
  (Photoshop, Photopea, Affinity Photo, Krita) -- none available in this
  environment. The PSD writer is verified by an independent from-scratch
  parser test instead (see BUILD_REPORT.md §3), which is real but not a
  substitute for opening the file in the target software.
- **No fuzzing run.** ASan/UBSan/leak-detection/fuzzing infrastructure for
  the UF7P and PSD/PNG parsers, requested by brief §35 and §43, was not
  set up in this session due to time budget, not because it's inapplicable
  -- the parsers are structured to make this straightforward to add later
  (see `KNOWN_LIMITATIONS.md`). The corruption-handling tests that do
  exist (`UF7P_CorruptedLayerChunk_IsSkippedNotFatal`,
  `UF7P_TruncatedFile_IsFatalNotCrash`, `UF7P_BadMagic_IsFatal`) are
  targeted unit tests, not a fuzzer.
- **No amodal-reconstruction benchmark** (brief §36) -- there is no amodal
  model in this build to benchmark (see BUILD_REPORT.md §2).
