# INFERENCE_CARD.md — Unflatten Offline

## Current state: no inference runtime, no model

This build performs no machine-learning inference of any kind. There is no
ExecuTorch, ONNX Runtime Mobile, TFLite, or QNN SDK linked into the native
library, and no model file anywhere in the APK (`MODEL_MANIFEST.json` is
empty by design). Every pipeline stage that the brief describes as
model-driven is either a documented no-op or backed by the deterministic,
non-learned CV code described in `MODEL_CARD.md`.

This is a deliberate choice, not an oversight: linking a real ML runtime
with nothing for it to run would be dead weight and would misleadingly
suggest on-device inference is happening. See `DECISIONS.md` §3.

## Where a real model would plug in

The pipeline is a single, named, persisted state machine
(`PipelineStage` in `android/app/src/main/cpp/engine/common/types.h`, 22
states matching brief §6 exactly) driven by one function,
`api::runFallbackDecomposition()` (`engine/api.cpp`). Each stage transition
in that function currently either does real deterministic work (INVENTORY,
MODAL_SEGMENT, BACKGROUND_COMPLETE, GLOBAL_QC) or appends a `NOT
IMPLEMENTED` note to `project.stageNotes` and moves on (DOMAIN_CLASSIFY,
TEXT_DETECT, LAYER_DEPTH, OCCLUSION_GRAPH, PREDICT_AMODAL_MASK,
COMPLETE_OBJECT_APPEARANCE, ASSOCIATE_SHADOWS_EFFECTS).

Adding a real learned segmenter, for example, means:

1. Convert/quantize the chosen model (e.g. a MobileSAM-class checkpoint)
   to a mobile-deployable format, license-cleared for redistribution.
2. Add it, its SHA-256, license, and runtime backend as a real entry in
   `MODEL_MANIFEST.json`, and add the runtime dependency it actually needs
   (ExecuTorch or ONNX Runtime Mobile, per whichever the eventual
   benchmarking in brief §9/§19 favors) to `app/build.gradle.kts` and
   `CMakeLists.txt` **at that point**, not speculatively now.
3. Write the inference call as a new function in
   `engine/inference/` (a directory that does not exist yet — it should
   be created when there is a real model to put in it, not before).
4. In `api::runFallbackDecomposition()`, replace the MODAL_SEGMENT stage's
   call to `fallback::segmentForegroundInstances()` with: try the learned
   model first; on failure/OOM/unsupported-operator, fall back to the
   existing `fallback::segmentForegroundInstances()` unchanged (this is
   exactly the hybrid-inference policy brief §18 describes, and the
   fallback tier to fall back *to* already exists and is tested).
5. Tag every mask/pixel that model produces `Provenance::ModelInferred`
   (the enum value already exists in `types.h` and in the Kotlin mirror;
   no code currently writes it, and no format migration would be needed
   when some does).
6. Add the model-specific benchmark harness (mask IoU, latency, memory —
   brief §9/§36) once there's a model to measure.

The same shape applies to amodal mask prediction (§11, replaces the
PREDICT_AMODAL_MASK no-op) and appearance completion (§12, replaces
COMPLETE_OBJECT_APPEARANCE).

## Why no runtime benchmarking happened in this session

Brief §19-20 ask for empirical benchmarking across ExecuTorch/ONNX Runtime
Mobile, QNN/XNNPACK/Vulkan backends, and multiple quantization levels. All
of that requires (a) a candidate model to benchmark and (b) the target
hardware class (Snapdragon 8 Elite / Hexagon HTP) or at minimum a
comparable device/emulator to run inference latency and memory
measurements on. This session's environment has neither (see
`DECISIONS.md` §1) — so no such benchmarking was performed, and none of
its numbers are fabricated here or anywhere else in this repository.
