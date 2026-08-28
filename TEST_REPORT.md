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

## 5. Memory-safety verification (ASan/UBSan/LeakSanitizer)

```
cd android/native_host_tests
mkdir -p build-asan && cd build-asan
cmake .. -DCMAKE_BUILD_TYPE=Debug -DCMAKE_CXX_COMPILER=g++ \
  -DCMAKE_CXX_FLAGS="-fsanitize=address,undefined -fno-omit-frame-pointer -g -fno-sanitize-recover=all" \
  -DCMAKE_EXE_LINKER_FLAGS="-fsanitize=address,undefined"
make -j4
ASAN_OPTIONS=detect_leaks=1 ./unflatten_engine_tests
```

(Clang's ASan runtime (`libclang_rt.asan*`) is not installed in this
environment; GCC 13's built-in `-fsanitize=address,undefined` works and was
used instead.)

**First run found a real heap-use-after-free** in
`EngineSession::mergeLayers` (`session.cpp`): after removing the merged-away
layers from the project (which deletes the underlying `Layer` objects), the
code re-dereferenced `targets.back()` — a raw pointer into one of the
just-deleted objects — to compute where to reinsert the new merged layer.
ASan caught it immediately and precisely (allocation site, free site, and
the exact use-after-free read, all with full stack traces). Fixed by
capturing the needed `depthIndex` into a local variable before the deletion
loop, since it was already safely available at that point in the function.
**Result after the fix: all 35 tests pass under ASan+UBSan+LeakSanitizer,
zero errors, zero leaks.**

This is the second and third real bug this test infrastructure has caught
in this codebase (after the two draw-order bugs in §1) — all three were
found and fixed before being represented as "tested" anywhere in this
repository's documentation.

## 6. PSD interoperability — independent third-party parser validation

```
./scripts/validate_psd_with_python.sh
```

Requires `pip install psd-tools pillow` (both installed and used in this
session; not bundled with the app — dev-time verification tooling only).

This script builds a small fixture program that runs the real fallback
pipeline end-to-end and writes a real multi-layer PSD via
`engine/io/psd_writer.cpp`, then opens that exact file with two independent
third-party Python libraries that share no code with this project:

- **psd-tools 1.18.0**: opens the file, reports the correct document size
  and color mode, enumerates all 3 layers (Background + 2 detected
  objects) with correct names and bounding boxes, decodes each layer's
  pixel data, and renders a correct composite.
- **Pillow 12.3.0**'s built-in PSD plugin: opens the file, recognizes it as
  format `PSD`, and flattens it successfully.

**Both succeeded.** This is real, reproducible evidence of PSD spec
conformance from tooling this project doesn't control — meaningfully
stronger than only the self-authored `PsdWriterTest` parser, though still
**not** a substitute for opening the file in actual Photoshop-family
software (Photoshop, Photopea, Affinity Photo, Krita), none of which is
available in this environment. See `psd_writer.h` for the precise,
non-overclaiming statement of what is and isn't verified.

## 7. What was NOT tested (stated directly, not omitted)

- **No physical Android device or emulator exists in this environment**
  (no KVM for an emulator, no USB device). Nothing in the Compose UI, the
  JNI marshaling layer, MediaStore export, Photo Picker integration, or
  on-screen gesture handling has been runtime-verified. See
  `DEVICE_VALIDATION_CHECKLIST.md` for the itemized list of what remains
  unverified and why.
- **No PSD interoperability test against real Photoshop-family software**
  (Photoshop, Photopea, Affinity Photo, Krita) -- none available in this
  environment. §6 above covers what real, independent verification *was*
  done instead (two third-party Python parsers), which is stronger than
  only the self-authored parser test but still not a substitute for the
  named target software.
- **No fuzzing run.** ASan/UBSan/leak-detection *was* run this session
  (§5 above, and it found and fixed a real bug), but a dedicated fuzzing
  harness (e.g. libFuzzer) for the UF7P/PSD/PNG parsers, requested by
  brief §35 and §43, was not set up -- time budget, not inapplicability;
  the parsers' bounds-checked-read design (`ByteReader`/`BigEndianReader`
  validate length before every read) makes this straightforward to add
  later (see `KNOWN_LIMITATIONS.md`). The corruption-handling tests that
  do exist (`UF7P_CorruptedLayerChunk_IsSkippedNotFatal`,
  `UF7P_TruncatedFile_IsFatalNotCrash`, `UF7P_BadMagic_IsFatal`) are
  targeted unit tests, not a fuzzer.
- **No amodal-reconstruction benchmark** (brief §36) -- there is no amodal
  model in this build to benchmark (see BUILD_REPORT.md §2).
