#include "project.h"

namespace unflatten {

namespace {
// Applies opacity and blend mode, then over-composites the layer's content
// onto `dst`. `originShiftX/Y` translates from the layer's own canvas-space
// bounds into `dst`'s local [0,w)x[0,h) coordinate space (needed because the
// canvas can have a negative-origin outpainted region, §16).
void compositeLayer(PixelBuffer& dst, const Layer& layer, int32_t originShiftX, int32_t originShiftY) {
    if (!layer.visible || layer.opacity <= 0.0f) return;

    PixelBuffer content = layer.rgba.toDenseBuffer();
    if (content.empty()) return;

    Rect b = layer.rgba.bounds();
    int32_t ox = b.x + static_cast<int32_t>(layer.offsetX) + originShiftX;
    int32_t oy = b.y + static_cast<int32_t>(layer.offsetY) + originShiftY;

    if (layer.opacity < 1.0f || layer.blendMode != BlendMode::Normal) {
        for (int32_t y = 0; y < content.height(); ++y) {
            for (int32_t x = 0; x < content.width(); ++x) {
                RGBA8& p = content.at(x, y);
                if (p.a == 0) continue;
                if (layer.blendMode != BlendMode::Normal) {
                    int32_t dx = ox + x, dy = oy + y;
                    if (dx >= 0 && dy >= 0 && dx < dst.width() && dy < dst.height()) {
                        RGBA8 under = dst.at(dx, dy);
                        auto blend = [&](uint8_t s, uint8_t d) -> uint8_t {
                            switch (layer.blendMode) {
                                case BlendMode::Multiply:
                                    return static_cast<uint8_t>((s * d) / 255);
                                case BlendMode::Screen:
                                    return static_cast<uint8_t>(255 - ((255 - s) * (255 - d)) / 255);
                                case BlendMode::Darken:
                                    return std::min(s, d);
                                case BlendMode::Lighten:
                                    return std::max(s, d);
                                default:
                                    return s;
                            }
                        };
                        p.r = blend(p.r, under.r);
                        p.g = blend(p.g, under.g);
                        p.b = blend(p.b, under.b);
                    }
                }
                p.a = static_cast<uint8_t>(p.a * layer.opacity);
            }
        }
    }
    dst.blitOver(content, ox, oy);
}
} // namespace

PixelBuffer Project::compositeAll() const {
    Rect cb = sourceObservation.canvasBounds;
    PixelBuffer out(std::max(cb.w, 1), std::max(cb.h, 1));
    out.fill(RGBA8{0, 0, 0, 0});

    for (const LayerId& id : drawOrder()) {
        const Layer* layer = findLayer(id);
        if (!layer) continue;
        compositeLayer(out, *layer, -cb.x, -cb.y);
    }
    return out;
}

} // namespace unflatten
