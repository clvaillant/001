#pragma once
#include <vector>
#include <cstdint>
#include "types.h"

namespace unflatten {

struct ConnectedComponent {
    Rect bounds;
    std::vector<uint8_t> mask; // bounds.w * bounds.h, 0 or 255, row-major
};

// 4-connected component labeling over a binary mask (nonzero = foreground).
// Shared by the fallback segmentation pass (over the whole image) and the
// editor's "split layer" operation (over one layer's own alpha mask) so the
// same, once-tested algorithm backs both (brief §29 "split layer").
std::vector<ConnectedComponent> findConnectedComponents(const std::vector<uint8_t>& binaryMask,
                                                          int32_t w, int32_t h,
                                                          int32_t minAreaPx);

} // namespace unflatten
