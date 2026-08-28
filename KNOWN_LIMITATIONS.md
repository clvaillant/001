# KNOWN_LIMITATIONS.md — Unflatten Offline

Consolidated from notes scattered across `BUILD_REPORT.md`,
`DECISIONS.md`, `ARCHITECTURE.md`, and `TEST_REPORT.md`. If a limitation
is documented there with more detail, this entry links to it rather than
repeating everything.

## Capability gaps (see `BUILD_REPORT.md` §2 for the full itemized list)

- No learned segmentation, amodal completion, appearance completion,
  depth estimation, text/OCR, shadow/reflection/transparency handling, or
  source-boundary outpainting. All of these are the deterministic-fallback-
  only or explicit-no-op stages described in `MODEL_CARD.md` and
  `BUILD_REPORT.md`.
- Recursive scene peeling (brief §17) runs exactly one non-recursive pass;
  newly-revealed background is never re-inventoried for further nested
  objects.
- Depth ordering is a pixel-area heuristic (larger detected component =
  assumed nearer), not learned monocular depth.
- The occlusion graph is never populated by this build's pipeline (no
  heuristic for inferring occluder/occluded relationships without a
  learned model was judged reliable enough to fabricate); draw order falls
  back to `depthIndex` for every project this build produces.

## Editor/engine implementation shortcuts (real, working, but simplified)

- **Mask brush provenance precision**: a brush stroke marks the layer's
  *entire* provenance map `Manual`, not just the touched pixels — doing
  this precisely would require threading provenance through
  `TiledImage`'s bounds-growth logic pixel-by-pixel. The chosen behavior
  never *under*-reports a manual edit, only over-reports one on pixels
  that already had non-Manual provenance elsewhere in the same layer. See
  `session.cpp`'s `maskBrushStroke`.
- **Merge preserves only Normal blending**: `mergeLayers` flattens the
  selected layers with straight alpha-over compositing; individual blend
  modes of the merged-away layers are not preserved in the result.
- **Undo/redo is whole-project-snapshot based**, not command/diff based —
  simple and always-correct, at the cost of memory proportional to
  snapshot size × up to 20 retained snapshots (`EngineSession::kMaxUndo`).
  Not measured against real memory limits on any device (no device
  available).
- **No image pyramid** is persisted as a distinct structure (brief §27
  suggests one for preview-resolution inference and lazy tile loading);
  compositing and export operate on tiled full-resolution layers directly.
  At this build's working-resolution cap (6000px long edge, see
  DECISIONS.md #5) this is a real, working design; it has not been
  performance-validated at that cap on any device.
- **Full canvas re-composite on every edit**: `EditorViewModel` re-pulls
  the entire composited bitmap from native on every mutation rather than
  incrementally updating just the changed region. Simple and always
  correct; not measured for interactive-editing performance at scale on
  any device (no device available to measure on).
- **PSD channel data is uncompressed** (compression method 0, not PackBits
  RLE) — spec-legal, simpler to get right without a device/real-Photoshop
  test loop to catch RLE bugs against, at the cost of larger PSD file
  size.

## Testing gaps (see `TEST_REPORT.md` §5-7)

- No physical device or emulator testing at all (see
  `DEVICE_VALIDATION_CHECKLIST.md` — every item unverified).
- No PSD interoperability test against real Photoshop/Photopea/Affinity/
  Krita (none available in this environment); verified instead by an
  independent from-scratch parser test PLUS two independent third-party
  Python PSD parsers (psd-tools, Pillow), both of which successfully open,
  parse, and composite a real PSD from this pipeline
  (`scripts/validate_psd_with_python.sh`) — real signal, not a substitute
  for the named target software.
- ASan/UBSan/LeakSanitizer *was* run this session and found+fixed a real
  heap-use-after-free (see `SECURITY.md`, `TEST_REPORT.md` §5). No
  dedicated fuzzing harness (e.g. libFuzzer) exists yet for the UF7P/PSD/
  PNG parsers (time budget, not inapplicability — the bounds-checked
  reader design makes this straightforward to add).
- No amodal-reconstruction benchmark (brief §36) — no amodal model exists
  in this build to benchmark.
- `org.robolectric:robolectric` and the `androidTest` dependencies
  (Espresso, AndroidX Test) are declared in `build.gradle.kts` but this
  session's actual unit tests are plain JUnit (no Android-framework
  shadowing needed for what they test) and no instrumented test was run
  (no device). See `SBOM.json`.

## Process/environment limitations specific to this build session

- No GPU, no ML framework installed, no dataset, no completed license
  review of any pretrained checkpoint — see `DECISIONS.md` §1 for why no
  model, training, distillation, or quantization work could happen here.
- No production signing key exists in this repository; the release APK is
  development-signed only (`BUILD_REPORT.md` §5).
