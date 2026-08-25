# MODEL_CARD.md — Unflatten Offline

**This app ships zero trained machine-learning models.** This document
exists (as the brief requires one) to state that plainly, and to describe
the deterministic, non-learned computer-vision code that stands in for the
model-shaped stages of the pipeline in this build, so nothing is mistaken
for a model that isn't one.

## Why no model ships

Building, evaluating, quantizing, and license-clearing even one of the
model classes the brief calls for (mobile instance segmentation, amodal
mask prediction, generative appearance completion) is a multi-week effort
requiring GPU compute, curated/synthetic training data, and legal review of
redistribution rights for any pretrained checkpoint used as a starting
point or teacher. This build's environment has no GPU, no dataset, and no
completed license review for any specific candidate checkpoint within
session scope (see `DECISIONS.md` §1). Shipping an untrained network, a
randomly initialized network, or a desktop research checkpoint too large to
plausibly run on-device, and calling any of that "the model," would be
exactly the fabrication the brief's own §52 prohibits. So none of that
happened; the gap is documented instead.

## What runs instead: "heuristic segmentation (fallback)"

`android/app/src/main/cpp/engine/fallback/segmentation_fallback.cpp`

1. Sample a color statistical model (mean + variance per RGB channel) from
   a thin band around the image border.
2. Classify each pixel foreground/background by variance-normalized color
   distance from that model (a diagonal-covariance Mahalanobis-style
   distance) against a fixed threshold.
3. Remove speckle noise with a binary erode-then-dilate pass (morphological
   opening).
4. Label 4-connected components in the cleaned mask; components at or
   above a minimum pixel area become candidate object instances.

This is classical, fully explainable, deterministic image processing. It
has **no** notion of object class, cannot separate two overlapping objects
of similar color into two instances, and has **no** notion of amodal/hidden
extent — a partially occluded object's mask is exactly its visible pixels,
nothing more. It is not SAM, not GrabCut's iterative graph-cut energy
minimization, not any learned segmenter. It is named accurately in code,
UI strings, and every document in this repository as "heuristic
segmentation (fallback)."

## What runs instead: "diffusion inpainting (fallback)"

`android/app/src/main/cpp/engine/fallback/inpaint_fallback.cpp`

Iterative 8-neighbor averaging: each hole pixel is repeatedly replaced by
the mean of its neighbors (using already-known pixels or the previous
pass's estimate), propagating inward one ring per pass from the hole's
boundary. This produces smooth, plausible fill for holes over roughly
uniform or gently-varying backgrounds. It cannot regenerate texture,
pattern, or structure (a tiled floor, a repeating fabric print, a
continuation of an object the removed foreground was occluding) — those
require a generative model this build doesn't have.

## What runs instead: heuristic depth ordering

`depthIndex` is assigned purely from detected-component pixel area (larger
= assumed nearer, drawn later/on top). This is an explicit, size-based
heuristic, not monocular depth estimation, and is documented as such in
`api.cpp`'s pipeline notes (visible to the user via `Project.stageNotes`).

## Provenance is always honest about all of the above

Every pixel this build produces or classifies carries a
`Provenance` tag: `OBSERVED` (copied verbatim from the imported photo),
`FALLBACK_HEURISTIC` (the deterministic CV code above decided this pixel's
membership or fill value), or `MANUAL` (the user painted it). The
`MODEL_INFERRED` tag exists in the schema for forward compatibility but no
code path in this build ever writes it — there is no model to infer
anything. The editor's provenance overlay shows this distinction visually;
`metadata.json` in every export bundle states it in writing.

## If/when a real model is added later

See `INFERENCE_CARD.md` for exactly where a real model plugs into the
existing `PipelineStage` state machine, and `MODEL_MANIFEST.json` for what
a real model entry (name, version, SHA-256, license, precision, runtime
backend) would need to add.
