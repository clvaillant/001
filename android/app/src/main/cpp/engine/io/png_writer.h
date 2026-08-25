#pragma once
#include <vector>
#include <cstdint>
#include "../tiling/pixel_buffer.h"

namespace unflatten {

// Encodes an RGBA8 buffer as a standard, lossless, alpha-preserving PNG
// (8-bit depth, color type 6). Brief §30 requires the PNG export stack to
// be lossless with alpha, which rules out relying on a lossy re-encode; we
// write PNG ourselves (against zlib, which the NDK guarantees) rather than
// adding an external PNG library dependency for a format this simple to
// emit correctly.
std::vector<uint8_t> encodePng(const PixelBuffer& image);

} // namespace unflatten
