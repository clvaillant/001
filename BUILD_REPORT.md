# BUILD_REPORT.md — Unflatten Offline

Per the project brief's own rule (§47): this report keeps **IMPLEMENTED**,
**TESTED**, **DEVICE-TESTED**, and **NOT IMPLEMENTED** strictly separate.
Nothing here is merged into a vaguer "done."

Build environment used for everything below: a cloud sandbox container with
no Android device, no emulator (no KVM), and no GPU. Android SDK
(platform 35, build-tools 35.0.0), NDK r27c, and CMake 3.22.1 were
provisioned at session start from `dl.google.com` (reachable). See
`DECISIONS.md` for the full environment inventory.

## 1. Core document engine (C++, `android/app/src/main/cpp/engine/`)

- **Implemented:** tiled RGBA pixel storage (512×512 tiles, sparse
  allocation), per-layer compact bounds, provenance map (OBSERVED /
  MODEL_INFERRED / FALLBACK_HEURISTIC / MANUAL), occlusion graph with cycle
  detection and topological draw ordering, back-to-front alpha compositor
  with opacity/blend modes (Normal/Multiply/Screen/Darken/Lighten), the
  UF7P chunked project file format (magic+version header, per-chunk CRC32,
  manifest with per-chunk offset/length, footer-referenced manifest so a
  truncated file is detected immediately).
- **Tested:** yes — 35 automated native test cases (`android/native_host_tests/`,
  compiled and run directly on the host Linux container with plain g++/CMake,
  since no Android device is available; the engine sources have zero
  Android-specific code, so this is the same logic that ships in the .so,
  not a reimplementation). All 35 pass. Coverage includes: tiled
  read/write round trips, negative-coordinate tiles (needed for future
  outpainting), dense-buffer round trips, alpha-compositing math,
  depth-order and occlusion-graph cycle/topological-sort correctness,
  full UF7P serialize→deserialize round trips (all fields), corrupt-magic
  and truncated-file fatal-error handling, single-corrupted-chunk
  non-fatal skip-and-continue handling.
- **Device-tested:** no device available (see DECISIONS.md). The identical
  C++ sources were additionally compiled for `arm64-v8a` by the real
  Android NDK toolchain via Gradle's `buildCMakeDebug[arm64-v8a]` /
  `buildCMakeRelWithDebInfo[arm64-v8a]` tasks, both of which succeeded and
  produced `libunflatten_engine.so` — so the exact code that passed the 35
  host tests is confirmed to cross-compile cleanly for the target ABI. It
  has not been *run* on that ABI.
- **Bugs found and fixed during this build (not merely "tested, none
  found"):** the test suite caught three real defects before any commit —
  (1) `Project::drawOrder()` trusted an empty occlusion graph's trivial
  "topological order" (= plain insertion order) instead of falling back to
  `depthIndex`, which silently drew every newly-created Background layer
  on top of every Object layer, hiding all detected objects; (2) the
  structural-edit renumbering logic (`EngineSession::renumberDepthIndices`)
  assumed layer-vector order already matched intended depth order, which
  wasn't true immediately after decomposition, so the first edit after
  import would have reintroduced bug (1); (3) a heap-use-after-free in
  `EngineSession::mergeLayers`, caught immediately by an AddressSanitizer
  run of the same test suite (see TEST_REPORT.md §5) — the function
  re-dereferenced a raw `Layer*` after the layer it pointed to had already
  been deleted. All three are fixed, with regression tests
  (`Session_StructuralEditDoesNotInvertDrawOrder`) and a clean
  ASan+UBSan+LeakSanitizer run guarding them. See inline comments in
  `project.h`, `api.cpp`, `session.cpp` for detail.

## 2. Deterministic CV fallback pipeline

- **Implemented:** border-color-prior heuristic foreground/background
  segmentation with 4-connected-component instance splitting
  (`fallback/segmentation_fallback.cpp`), diffusion-based hole inpainting
  for background completion (`fallback/inpaint_fallback.cpp`), a
  cycle-consistency QC metric comparing the recomposited canvas to the
  source over non-generated regions (brief §23). Wired end-to-end through
  the full named pipeline state machine from brief §6
  (`api::runFallbackDecomposition`), with every stage that has no real
  implementation in this build explicitly marked `NOT IMPLEMENTED` in a
  per-run note (`Project.stageNotes`), not silently skipped.
- **Tested:** yes, 12 of the 35 native test cases target this pipeline
  specifically (segmentation on synthetic single/multi-blob/uniform
  images, inpainting on uniform/gradient backgrounds, full end-to-end
  fallback decomposition, cycle-consistency error assertion, clean-failure
  on a degenerate uniform input with zero fabricated layers).
- **Device-tested:** no.
- **NOT IMPLEMENTED (this is the honest core of this report):**
  - Learned instance/semantic segmentation (any SAM/MobileSAM/EfficientSAM-
    class model) — §9. No model is bundled; see MODEL_MANIFEST.json.
  - Amodal mask prediction (hidden/occluded object extent) — §11. Every
    layer's `amodalMask` is a direct copy of its `visibleMask`; hidden
    extent is never inferred, never fabricated.
  - Generative appearance completion for hidden/occluded object pixels —
    §12. No RGB pixel this build produces is synthesized; every non-
    transparent object pixel is copied verbatim from the source image.
  - Learned background inpainting — §13. Diffusion fallback only.
  - Shadow/reflection/transparency detection and separation — §14.
  - Text detection, OCR, font-property inference — §15.
  - Source-boundary outpainting — §16. The canvas-vs-source-bounds
    distinction exists in the schema (`SourceObservation`) but no stage
    grows the canvas or generates content beyond the imported image.
  - Recursive re-inventory of newly-revealed background — §17 "PEEL(1..N)"
    runs exactly one non-recursive pass in this build.
  - Domain classification (photo/illustration/poster/etc.) — §7.
  - Monocular depth estimation — §10; `depthIndex` is assigned purely by
    detected-component pixel area (larger = assumed nearer), an explicit,
    documented heuristic, not a depth model.
  - QNN/Hexagon HTP, XNNPACK, Vulkan-accelerated inference — §19/§27. No
    ML runtime (ExecuTorch, ONNX Runtime Mobile) is linked into this
    build at all; there is no model for one to run, and linking an unused
    runtime "for the record" would itself be the "stub JNI calls
    described as native inference" pattern brief §52 explicitly forbids.
  - Quantization, teacher-student distillation, synthetic training-data
    generation, amodal benchmark against known ground truth (§20-22, §36)
    — all require either a trainable model or a GPU training loop, neither
    of which exists in this session (no GPU, no dataset, no pretrained
    checkpoint sourced and license-cleared within session scope).
  - Multiple-hypothesis completion candidates (§24) — moot without a
    generative completion model to produce hypotheses from.

## 3. Export

- **Implemented:** lossless alpha-preserving PNG encoder written directly
  against zlib (no external PNG library dependency) — composite, source,
  and per-layer RGBA/visible-mask/amodal-mask/provenance-overlay PNGs, plus
  `metadata.json`. Real layered PSD writer (RGB 8-bit document, one PSD
  layer per Unflatten layer with name/bounds/alpha/opacity/blend
  mode/visibility, uncompressed channel data, flattened RGB merged
  preview).
- **Tested:** yes. `PngWriter_OutputHasValidSignatureAndStructure`
  independently re-parses the PNG byte stream (signature, IHDR fields,
  decompressed scanline content) against what was requested. Two PSD
  tests (`PsdWriter_IndependentParse_HeaderAndLayersMatchProject`,
  `PsdWriter_LayerChannelPixelData_MatchesSourceExactly`) implement a
  from-scratch independent PSD parser (not reusing the writer's own code)
  that validates header fields, per-layer rect/channel-count/name, and
  round-trips actual pixel bytes.
- **Device-tested:** no.
- **Additionally verified:** `scripts/validate_psd_with_python.sh` opens a
  real PSD produced by the actual fallback pipeline with two independent
  third-party parsers unrelated to this project — `psd-tools` and
  Pillow's built-in PSD plugin. Both open it, correctly enumerate all
  layers with correct names/bounds, decode pixel data, and composite it
  correctly (see TEST_REPORT.md §6). This is real, reproducible
  cross-validation from tooling this project doesn't control.
- **NOT verified:** opening the exported PSD in real Photoshop-family
  software (Adobe Photoshop, Photopea, Affinity Photo, Krita) as brief §30
  explicitly asks for — none of those tools are available in this
  environment. This is stated plainly rather than claimed; the
  independent-parser validation above is real evidence but not a
  substitute for it. See `KNOWN_LIMITATIONS.md`.
- **Confidence maps:** brief §30 asks for a per-layer `confidence.png`. No
  model in this build produces a numeric per-pixel confidence score (there
  is no model at all — see above), so exporting one would be fabrication
  under §52. The export instead writes a `provenance_overlay.png` per
  layer (color-coded observed/fallback/manual), which is the real signal
  this build has, honestly named as what it is.

## 4. Android application shell

- **Implemented:** Kotlin + Jetpack Compose UI (import via system Photo
  Picker + "share to app", pinch-zoom/pan composite canvas, layer panel
  with visibility/opacity/rename/reorder/delete, mask add/subtract brush
  painting directly into the native engine, undo/redo, provenance overlay
  toggle, merge/split layer, restore-original, regenerate-background,
  PNG+PSD+UF7P export bundle via MediaStore (no storage permission
  requested), autosave-on-every-edit to app-private storage for
  process-death/relaunch recovery, "open project file" via SAF,
  EXIF-orientation-aware import with automatic downsampling to the
  6000px-long-edge working cap, offline device-diagnostics JSON export
  (brief §34), zero networking code anywhere.
- **Tested:** 11 JVM unit tests (`app/src/test/`) covering the
  little-endian wire format shared with the native `encodeLayersMeta`
  output and the Kotlin/C++ enum-ordinal contract (Provenance, BlendMode,
  LayerType, PipelineStage — these cross the JNI boundary as raw integers
  with no name lookup, so a silent reordering on either side would corrupt
  every layer's metadata at runtime; this is exactly the kind of bug a
  real device run would catch instantly and this environment cannot, so
  it is pinned by an explicit ordinal test instead).
- **Device-tested:** no. **This is the single largest gap in this build.**
  The Compose UI, gesture handling, MediaStore export, Photo Picker
  integration, and JNI marshaling have never been exercised inside a
  running Android process. They have been build-verified (the app
  compiles, links, dexes, and packages against the real Android SDK/NDK)
  and code-reviewed, not runtime-verified. See
  `DEVICE_VALIDATION_CHECKLIST.md`.

## 5. Build/release

- **Implemented and verified by actually running the build, not assumed:**
  - `./gradlew assembleDebug` — succeeds (see `TEST_REPORT.md` for the
    full task log). Produces an installable, debug-signed APK.
  - `./gradlew assembleRelease` — succeeds, including R8 minification,
    resource shrinking, and `lintVitalRelease`. Produces a 2.6MB
    debug-signed release APK (11.7MB unminified debug APK for
    comparison).
  - Native CMake/NDK cross-compilation for `arm64-v8a` succeeds in both
    build types.
  - APK manifest scan (via `aapt dump badging` against the actual packaged
    APK, not the source manifest) confirms **zero** `INTERNET` permission
    and **zero** other real permissions — the only `uses-permission`
    entry present is `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`, which AGP
    auto-injects for apps targeting API 33+ as a self-scoped
    receiver-export hardening measure; it grants no capability to any
    other app and is unrelated to networking.
  - `scripts/security_audit.sh` scans every string in the packaged
    APK (DEX, resources, assets) for `http://`, `https://`, `ws://`,
    `wss://`, `Bearer`, `Authorization`, `API_KEY`, `telemetry`,
    `analytics`. Every hit found was investigated (brief §35's explicit
    instruction) and is one of: the standard `schemas.android.com` XML
    namespace URI (present in every Android app's compiled resources), the
    Adobe XMP namespace URI (compiled into androidx.exifinterface), the
    SVG XML namespace URI, developer-facing bug-report URLs embedded as
    string literals inside AndroidX Compose's and Kotlin's own internal
    assertion-failure messages (not reachable at runtime without the
    INTERNET permission this APK doesn't have), and a `.analytics`
    top-level-domain entry inside a compiled-in URL-validation regex
    (matching valid TLDs, not calling any analytics service). Zero hits
    for `Bearer`, `Authorization`, `API_KEY`, `ws://`, or `wss://`
    anywhere in the APK. Full output preserved in this repository's build
    logs (not committed by default; reproducible via the script).
  - Signature verified with `apksigner verify --print-certs`: signed by
    `CN=Android Debug` — genuinely development-signed, not a fabricated
    "production" claim (brief §45).
- **NOT IMPLEMENTED:** a production signing key. None was generated or
  supplied; per brief §45, a private key must never be embedded in a
  delivered source archive, and no production Play/enterprise signing
  credentials exist in this session. `Unflatten-Offline.apk` in this
  release is explicitly labeled development-signed.

## 6. Documentation / process artifacts

- Implemented and present in this repository: `DECISIONS.md`,
  `ARCHITECTURE.md`, `README.md`, `INSTALL.md`, `TEST_REPORT.md`,
  `MODEL_CARD.md`, `MODEL_MANIFEST.json`, `MODEL_LICENSES.md`,
  `INFERENCE_CARD.md`, `PRIVACY.md`, `SECURITY.md`,
  `THIRD_PARTY_NOTICES.md`, `SBOM.json`, `DEVICE_VALIDATION_CHECKLIST.md`,
  `KNOWN_LIMITATIONS.md`.
