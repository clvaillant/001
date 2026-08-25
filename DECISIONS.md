# DECISIONS.md — Unflatten Offline

This document records binding engineering decisions and the environment
constraints that shaped them. It is updated as work progresses; nothing here
is retroactively softened to make the project look more complete than it is.

## 0. Starting state of this repository

The repository `clvaillant/001` on branch `main` contained an unrelated
scaffold project ("RGEmergence", a Vite + three.js starter) with no relation
to Unflatten. There was no prior Unflatten source tree anywhere in this
repository or its branches. This build starts fresh. The pre-existing
`package.json` / Vite scaffold is left untouched at the repo root; all
Unflatten work lives under `android/`.

## 1. Build environment — what this session actually has

Verified by direct inspection at session start (2026-08-25), not assumed:

| Component | Status |
|---|---|
| OpenJDK | 21.0.10, present |
| Gradle | 8.14.3, present at `/opt/gradle` |
| Android SDK | **absent** — no `ANDROID_HOME`, no cached SDK. `dl.google.com` is reachable (HTTP 200), so cmdline-tools/platform/build-tools/NDK can be provisioned at dev time. |
| Android NDK | absent; provisioned alongside the SDK (see above) |
| `adb` / emulator | **absent**, and no KVM/virtualization is available in this container — an emulator cannot be brought up here even if the system-image package is downloaded |
| Physical Android device | **not available** — this is a headless cloud container, not a workstation with USB access |
| GPU / CUDA | **absent** — CPU-only container |
| PyTorch / TensorFlow / ONNX / ExecuTorch | **not installed**; installable via pip (PyPI is reachable) but with no GPU, any training or heavyweight conversion work would run at CPU speed only |

### Consequences (stated up front, not discovered later)

1. **No physical-device or emulator validation is possible in this session.**
   Per the master prompt's own §39 and §55, this must be *disclosed*, not
   worked around by "assuming it would work." `DEVICE_VALIDATION_CHECKLIST.md`
   marks every item unverified. This affects target device optimization
   claims (Snapdragon 8 Elite / QNN / Hexagon HTP): those backends cannot be
   exercised or benchmarked here at all. The architecture is built to allow
   them to be plugged in later (see §6 below), but no QNN/HTP code is written
   that we cannot test, because untested "optimization" code is just as
   likely to be wrong as helpful.
2. **No model training or distillation is possible here.** There is no GPU,
   no existing checkpoint cache, and no realistic way to legally source,
   license-check, and distill a mobile-sized amodal-segmentation /
   generative-completion model to a redistributable, quality-verified state
   within this session. Claiming otherwise, or shipping an untrained/
   randomly-initialized network and calling it "the amodal model," would be
   exactly the kind of fabrication §52 of the brief prohibits
   ("placeholder model files," "hard-coded examples described as model
   inference," "stub JNI calls described as native inference").
3. **Decision:** ship the full production document/editor/export engine
   (Phase 1, real and tested), implement the ML pipeline as a set of
   concrete, versioned interfaces (`InferenceStage`, `SegmentationModel`,
   `AmodalModel`, `CompletionModel`) with a working **deterministic
   computer-vision fallback** wired end-to-end through the real pipeline
   states described in §6 of the brief, and leave the neural stages
   `NOT IMPLEMENTED` with the exact swap-in points documented. The fallback
   is never mislabeled as ML in code, UI, or docs — every fallback layer
   is tagged `provenance = FALLBACK_HEURISTIC` and the editor's provenance
   overlay shows this to the user distinctly from `MODEL_INFERRED`.
4. Corollary of (2): §21 (teacher-student distillation), §22 (synthetic
   training data generation), §36 (amodal benchmark against ground truth)
   and most of §37 require either trained models or a GPU training loop.
   These are documented as NOT IMPLEMENTED with the harness/format built to
   receive results later (the benchmark harness itself — the code that
   *would* compute IoU/PSNR/SSIM/LPIPS given a model — is implemented and
   unit-tested against synthetic fixtures, since that part requires no GPU).

## 2. Target platform

- `minSdk = 26` (Android 8.0). Chosen because it's the lowest level with
  `BitmapRegionDecoder` hardening, `ImageDecoder`-adjacent behavior, and
  scoped-storage-compatible `MediaStore` APIs without needing 20+ SDK-level
  branches in the storage code. We are not targeting low-end devices (§4 of
  the brief), so we don't pay for old-API affordances beyond this floor.
- `targetSdk = 35` (Android 15), current at session time.
- `compileSdk = 35`.
- Single ABI: `arm64-v8a` only (per brief §4 — Galaxy S25 Ultra / Snapdragon
  8 Elite is arm64). No `armeabi-v7a`, no `x86_64` — this halves native
  binary size and matches the explicit "single APK acceptable" instruction.
- No `android.permission.INTERNET` in the manifest. Verified by an automated
  manifest-scan test (`SecurityAuditTest`), not by eyeballing — see §9.

## 3. Language / framework choices

- **Kotlin + Jetpack Compose** for the app shell, navigation, ViewModel/
  SavedStateHandle state, Photo Picker, MediaStore export, WorkManager for
  cancellable background processing. This is the "normal maintainable
  Android architecture" the brief asks for in §5, explicitly preferring it
  over a hand-rolled NativeActivity.
- **C++17 via CMake/JNI** for: tiled document engine, project format
  (de)serialization with CRC32 per chunk, compositor, PSD writer, PNG
  writer/reader, and the deterministic CV fallback pipeline. This is where
  the brief says native code has clear value (§5) — pixel-tiled memory
  management, binary format I/O, and per-pixel compositing are all
  legitimately faster and more memory-controllable in C++ than in Kotlin/JVM
  for large bitmaps.
- No third-party native ML runtime (ExecuTorch / ONNX Runtime Mobile / QNN
  SDK) is linked in this build. Reasoning: linking a runtime with no model
  to run it, purely to say "the runtime is present," would be exactly the
  "stub JNI calls described as native inference" pattern §52 forbids. No
  speculative `InferenceStage`/model-interface class hierarchy is built
  either, for the same reason the brief itself warns against elsewhere:
  an abstraction with a single, non-learned implementation and no second
  caller is premature, not preparation. The real extension point is the
  named `PipelineStage` enum (`engine/common/types.h`) and the single
  `api::runFallbackDecomposition()` entry point that walks it
  (`engine/api.cpp`) -- a future learned stage is a new function that
  replaces one stage's no-op branch, called from the same place. See
  `INFERENCE_CARD.md` for exactly what that would look like.

## 4. Project file format — "UF7P"

Custom chunked binary format, versioned, little-endian, documented fully in
`ARCHITECTURE.md`. Summary of decisions:

- Magic `UF7P` + format version (currently `1`).
- Manifest chunk (JSON, CRC32-checked) lists all other chunks, their type,
  byte offset/length, and a CRC32 of their contents — corruption in one
  chunk is detected without needing to parse the whole file, and does not
  block loading of unaffected layers (§28, §35 "project corruption
  detection").
- Tiled pixel storage, 512×512 tiles, each independently zlib-compressed and
  CRC32-checked (§27's suggested tile size; 512 chosen over 256 as the
  better memory/overhead tradeoff for a 12GB-RAM flagship target — fewer,
  larger tiles means less per-tile compression/checksum overhead for the
  image sizes this app targets).
- Every generated (non-observed) pixel region is required to carry a
  provenance chunk (`OBSERVED` / `FALLBACK_HEURISTIC` / `MANUAL`); the
  brief's `MODEL_INFERRED` state exists in the schema and is unused until a
  real model ships (§25).

## 5. Maximum supported image dimensions / memory strategy

- Import decode target: long-edge capped at 6000px (typical S25 Ultra
  photos are far larger; we downsample the working copy on import while
  retaining the original bytes verbatim in the project's immutable source
  slot, satisfying §50's source-preservation rule).
- Canvas/document working resolution cap: 8192×8192 logical pixels (allows
  outpainting growth beyond a 6000px-edge source per §16).
- Tiles are loaded lazily from the memory-mapped project file; only tiles
  intersecting the current viewport + a 1-tile margin are decompressed into
  RAM. This bounds peak memory independent of canvas size, per §27.

## 6. Pipeline state machine

Implemented as a persisted Kotlin sealed-state enum matching brief §6
exactly (`INGEST → NORMALIZE → DOMAIN_CLASSIFY → PYRAMID → INVENTORY →
MODAL_SEGMENT → TEXT_DETECT → LAYER_DEPTH → OCCLUSION_GRAPH → PEEL(1..N) →
BACKGROUND_COMPLETE → REINVENTORY → RECOMPOSE → GLOBAL_QC → EDIT →
DONE|FAILED`), persisted to the project file after each stage transition so
it survives process death (§6, §33). Each state currently runs either a real
deterministic algorithm (documented per-stage in `ARCHITECTURE.md`) or is a
documented no-op pass-through where no model exists yet — never a fabricated
result. `DOMAIN_CLASSIFY`, `TEXT_DETECT` OCR, `LAYER_DEPTH`, amodal mask
prediction, and appearance completion are the stages without a learned model
in this build; each is marked `NOT IMPLEMENTED` in `BUILD_REPORT.md` and each
has a coded `StageResult.Skipped(reason)` path rather than silently
succeeding with fake output.

## 7. What "MODAL_SEGMENT" actually does in this build

Deterministic fallback only (§18's fallback tier, reached immediately since
no learned segmenter is bundled): a border-color statistical prior
classifies each pixel foreground/background by variance-normalized color
distance from a model sampled off the image border, a binary open
(erode+dilate) removes speckle, and 4-connected-component labeling splits
the foreground mask into candidate instances above a minimum area
(`engine/fallback/segmentation_fallback.cpp`). Background completion for
removed regions uses iterative 8-neighbor diffusion inpainting
(`engine/fallback/inpaint_fallback.cpp`) — it propagates plausible-looking
smooth fill inward from a hole's boundary but cannot hallucinate texture or
structure the way a learned model would. Neither is GrabCut, SAM, or any
learned model; both are classical, explainable, deterministic CV, and the
code, UI strings, and docs all call this "heuristic segmentation (fallback)"
/ "diffusion inpainting (fallback)" — never "AI segmentation" or "generative
inpainting" — per §52's explicit prohibition on this exact substitution.

## 8. Signing

No production signing key exists or is generated by this session (private
keys are never to be embedded in a delivered repo). Debug-signed build only,
clearly labeled as development-signed in `BUILD_REPORT.md` and
`RELEASE_NOTES`, per §45.

## 9. Security/privacy verification method

`SecurityAuditTest` (JVM test, runs on the built AAR/manifest and on a
decompiled APK's resources) programmatically greps the merged manifest for
`INTERNET`/network permissions and greps all packaged assets/strings for
`http://`, `https://`, `ws://`, `Bearer`, `Authorization`, `API_KEY` and
similar tokens, failing the build if any are found outside an explicit
allowlist (e.g. XML namespace URIs). This replaces "we manually checked" with
an automated, re-runnable, CI-shaped check (§35, §43).
