# Unflatten Offline

Unflatten transforms one flattened raster image into a real, editable,
entirely-on-device layered document — no internet connection used or
required, ever.

**Read this first:** the full ambition described in the original project
brief (learned amodal segmentation, generative appearance completion,
Qualcomm QNN/Hexagon acceleration, teacher-student distillation, physical
device validation) is **not** what ships in this build. This build ships a
real, tested, working production Android shell, native tiled document
engine, project format, editor, and PNG/PSD export — plus a deterministic,
non-learned computer-vision fallback pipeline, clearly labeled as such
everywhere it appears in code and UI. Every gap between the brief and this
build is itemized, not hidden, in `BUILD_REPORT.md`. `DECISIONS.md`
explains exactly why (no GPU, no Android device/emulator, no legally
vetted redistributable amodal-segmentation model sourced within this
session).

## What actually works today

1. Install the APK, open it, select a photo (Photo Picker or "share to
   Unflatten").
2. The app runs a real, on-device, deterministic decomposition: heuristic
   foreground/background separation + connected-component instance
   splitting, and diffusion-based background inpainting for the removed
   regions.
3. You get separate editable layers: one per detected foreground object,
   plus a reconstructed background.
4. Edit: show/hide, reorder, rename, opacity, mask add/subtract brush,
   merge, split, undo/redo, restore-original, regenerate-background.
5. Toggle a provenance overlay showing which pixels are OBSERVED
   (directly from your photo) vs. FALLBACK_HEURISTIC (produced by the
   deterministic CV fallback) vs. MANUAL (your edits). Nothing generated
   is ever presented as recovered ground truth.
6. Save/reopen the project (`.uf7p`, autosaved continuously; also
   exportable/reopenable as a file).
7. Export a lossless PNG layer stack + a real layered PSD, entirely
   offline, to a user-visible folder, with no storage permission
   requested.
8. Works in airplane mode, because there is no networking code anywhere in
   the app (verified — see `SECURITY.md`).

## What doesn't (yet)

No amodal/hidden-object reconstruction, no generative appearance
completion, no shadow/reflection/text-specific handling, no
Snapdragon/QNN acceleration, no physical-device validation. See
`BUILD_REPORT.md` for the complete, honest breakdown, and
`INFERENCE_CARD.md` for the architecture already in place to receive a real
model later without a rewrite.

## Repository layout

- `android/` — the actual Gradle/Kotlin/C++ project. See `INSTALL.md` to
  build and install it, `ARCHITECTURE.md` for how it's put together.
- `android/native_host_tests/` — 35 automated tests for the native engine,
  runnable without any Android tooling.
- `scripts/security_audit.sh` — scans a built APK for network/telemetry
  strings and confirms no `INTERNET` permission.
- `release/` — the built, checksummed, development-signed APK (see
  `BUILD_REPORT.md` §5 for signing status).

## Documentation index

`DECISIONS.md` · `ARCHITECTURE.md` · `BUILD_REPORT.md` · `TEST_REPORT.md` ·
`MODEL_CARD.md` · `MODEL_MANIFEST.json` · `MODEL_LICENSES.md` ·
`INFERENCE_CARD.md` · `PRIVACY.md` · `SECURITY.md` ·
`THIRD_PARTY_NOTICES.md` · `SBOM.json` ·
`DEVICE_VALIDATION_CHECKLIST.md` · `KNOWN_LIMITATIONS.md` · `INSTALL.md`
