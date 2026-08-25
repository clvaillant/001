#pragma once
#include <vector>
#include <cstdint>
#include "../tiling/pixel_buffer.h"

namespace unflatten {
namespace fallback {

// Deterministic diffusion inpainting: repeatedly replaces each hole pixel
// with the average color of its 8-neighbors (using already-known pixels or
// the previous pass's estimate for neighbors that are themselves holes),
// propagating information inward from the hole boundary one ring per pass.
//
// This is a classical, non-learned technique. It produces smooth, plausible
// fill for holes over roughly uniform or gently-varying backgrounds. It
// does NOT hallucinate texture, structure, or semantically consistent
// content the way a generative/learned inpainting model would -- e.g. it
// cannot regenerate a patterned floor or continue an object occluded by the
// removed foreground. It is the deterministic fallback tier required by
// brief §13/§18, and is the ONLY background-completion method this build
// ships (see DECISIONS.md, MODEL_MANIFEST.json). The caller must tag every
// touched pixel Provenance::FallbackHeuristic, never ModelInferred.
//
// `holeMask` is sized image.width()*image.height(); a nonzero value marks a
// pixel to be filled. Filled pixels are written with full opacity.
void inpaintFallback(PixelBuffer& image, const std::vector<uint8_t>& holeMask, int32_t iterations = 300);

} // namespace fallback
} // namespace unflatten
