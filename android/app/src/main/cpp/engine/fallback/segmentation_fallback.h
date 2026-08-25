#pragma once
#include <vector>
#include <cstdint>
#include "../common/types.h"
#include "../tiling/pixel_buffer.h"

namespace unflatten {
namespace fallback {

struct FallbackInstance {
    Rect bounds;
    std::vector<uint8_t> alphaMask; // bounds.w * bounds.h, 0 or 255, row-major
};

// Deterministic, non-learned foreground/background separation:
//  1. samples a color statistical model from a thin band around the image
//     border (assumes, as a heuristic prior only, that border pixels are
//     more likely background -- a common, simple, explainable assumption,
//     not a learned one);
//  2. classifies each pixel foreground/background by per-channel
//     variance-normalized distance from that border model;
//  3. removes speckle noise with a binary erode-then-dilate pass;
//  4. splits the foreground mask into 4-connected components, keeping only
//     components at or above `minComponentAreaPx`, each becoming one
//     candidate instance.
//
// This is classical heuristic segmentation. It is NOT semantic or instance-
// aware: it cannot distinguish "two overlapping people" from "one blob", it
// carries no class labels, and it has no concept of amodal/hidden extent.
// It exists solely as the deterministic fallback tier required by brief
// §18, and is the ONLY segmentation this build ships, because no learned
// segmenter is bundled (see DECISIONS.md, MODEL_MANIFEST.json). Every
// FallbackInstance this function returns must be tagged
// Provenance::FallbackHeuristic by the caller -- never presented as ML.
std::vector<FallbackInstance> segmentForegroundInstances(const PixelBuffer& image,
                                                           int32_t minComponentAreaPx = 400,
                                                           int32_t borderBandPx = 12);

} // namespace fallback
} // namespace unflatten
