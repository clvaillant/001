#pragma once
#include <vector>
#include <algorithm>
#include "../common/types.h"

namespace unflatten {

// Dense RGBA8 buffer for a single rectangular region. This is the unit that
// tiles, layer-local crops, and composite outputs all share.
class PixelBuffer {
public:
    PixelBuffer() = default;
    PixelBuffer(int32_t w, int32_t h) : w_(w), h_(h), data_(static_cast<size_t>(w) * h) {}

    int32_t width() const { return w_; }
    int32_t height() const { return h_; }
    bool empty() const { return w_ <= 0 || h_ <= 0; }

    RGBA8& at(int32_t x, int32_t y) { return data_[static_cast<size_t>(y) * w_ + x]; }
    const RGBA8& at(int32_t x, int32_t y) const { return data_[static_cast<size_t>(y) * w_ + x]; }

    std::vector<RGBA8>& raw() { return data_; }
    const std::vector<RGBA8>& raw() const { return data_; }

    void fill(RGBA8 color) { std::fill(data_.begin(), data_.end(), color); }

    // Alpha-composites `src` onto this buffer at (dstX, dstY), using
    // straight (non-premultiplied) alpha, standard "over" operator.
    void blitOver(const PixelBuffer& src, int32_t dstX, int32_t dstY) {
        for (int32_t sy = 0; sy < src.h_; ++sy) {
            int32_t dy = dstY + sy;
            if (dy < 0 || dy >= h_) continue;
            for (int32_t sx = 0; sx < src.w_; ++sx) {
                int32_t dx = dstX + sx;
                if (dx < 0 || dx >= w_) continue;
                const RGBA8& s = src.at(sx, sy);
                if (s.a == 0) continue;
                RGBA8& d = at(dx, dy);
                if (s.a == 255 || d.a == 0) {
                    d = s;
                    continue;
                }
                float sa = s.a / 255.0f;
                float da = d.a / 255.0f;
                float oa = sa + da * (1.0f - sa);
                if (oa <= 0.0f) { d = RGBA8{0, 0, 0, 0}; continue; }
                auto mix = [&](uint8_t sc, uint8_t dc) -> uint8_t {
                    float out = (sc * sa + dc * da * (1.0f - sa)) / oa;
                    return static_cast<uint8_t>(std::clamp(out, 0.0f, 255.0f));
                };
                d = RGBA8{mix(s.r, d.r), mix(s.g, d.g), mix(s.b, d.b),
                          static_cast<uint8_t>(std::clamp(oa * 255.0f, 0.0f, 255.0f))};
            }
        }
    }

private:
    int32_t w_ = 0, h_ = 0;
    std::vector<RGBA8> data_;
};

} // namespace unflatten
