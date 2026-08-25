#include "inpaint_fallback.h"
#include <algorithm>

namespace unflatten {
namespace fallback {

void inpaintFallback(PixelBuffer& image, const std::vector<uint8_t>& holeMask, int32_t iterations) {
    int32_t w = image.width(), h = image.height();
    if (w <= 0 || h <= 0) return;

    struct Acc { float r, g, b; bool known; };
    std::vector<Acc> cur(static_cast<size_t>(w) * h);
    for (int32_t y = 0; y < h; ++y) {
        for (int32_t x = 0; x < w; ++x) {
            size_t i = static_cast<size_t>(y) * w + x;
            bool isHole = holeMask[i] != 0;
            const RGBA8& p = image.at(x, y);
            cur[i] = Acc{static_cast<float>(p.r), static_cast<float>(p.g), static_cast<float>(p.b), !isHole};
        }
    }

    std::vector<Acc> next = cur;
    static const int32_t dx[8] = {-1, 0, 1, -1, 1, -1, 0, 1};
    static const int32_t dy[8] = {-1, -1, -1, 0, 0, 1, 1, 1};

    for (int32_t iter = 0; iter < iterations; ++iter) {
        bool anyHoleRemaining = false;
        for (int32_t y = 0; y < h; ++y) {
            for (int32_t x = 0; x < w; ++x) {
                size_t i = static_cast<size_t>(y) * w + x;
                if (cur[i].known) { next[i] = cur[i]; continue; }
                anyHoleRemaining = true;
                float sr = 0, sg = 0, sb = 0;
                int32_t n = 0;
                for (int k = 0; k < 8; ++k) {
                    int32_t nx = x + dx[k], ny = y + dy[k];
                    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                    size_t ni = static_cast<size_t>(ny) * w + nx;
                    // Use a neighbor's contribution if it's already known,
                    // or if it has *some* accumulated estimate from a prior
                    // pass (bootstrap: on iteration 0 unknown neighbors
                    // contribute nothing, so the fill grows in one-pixel
                    // rings from the hole boundary inward).
                    if (cur[ni].known || iter > 0) {
                        sr += cur[ni].r; sg += cur[ni].g; sb += cur[ni].b; ++n;
                    }
                }
                if (n > 0) {
                    next[i] = Acc{sr / n, sg / n, sb / n, false};
                } else {
                    next[i] = cur[i];
                }
            }
        }
        std::swap(cur, next);
        if (!anyHoleRemaining) break;
    }

    for (int32_t y = 0; y < h; ++y) {
        for (int32_t x = 0; x < w; ++x) {
            size_t i = static_cast<size_t>(y) * w + x;
            if (holeMask[i] == 0) continue;
            const Acc& a = cur[i];
            image.at(x, y) = RGBA8{
                static_cast<uint8_t>(std::clamp(a.r, 0.0f, 255.0f)),
                static_cast<uint8_t>(std::clamp(a.g, 0.0f, 255.0f)),
                static_cast<uint8_t>(std::clamp(a.b, 0.0f, 255.0f)),
                255};
        }
    }
}

} // namespace fallback
} // namespace unflatten
