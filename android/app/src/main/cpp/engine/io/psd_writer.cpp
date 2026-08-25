#include "psd_writer.h"
#include "big_endian_io.h"
#include <cstring>
#include <algorithm>

namespace unflatten {

namespace {

const char* blendModeKey(BlendMode b) {
    switch (b) {
        case BlendMode::Normal: return "norm";
        case BlendMode::Multiply: return "mul ";
        case BlendMode::Screen: return "scrn";
        case BlendMode::Darken: return "dark";
        case BlendMode::Lighten: return "lite";
    }
    return "norm";
}

struct LayerChannel {
    int16_t id; // 0=R, 1=G, 2=B, -1=alpha
    std::vector<uint8_t> plane; // one byte per pixel, row-major
};

} // namespace

std::vector<uint8_t> encodePsd(const Project& project) {
    BigEndianWriter out;

    Rect canvas = project.sourceObservation.canvasBounds;
    int32_t docW = std::max(canvas.w, 1);
    int32_t docH = std::max(canvas.h, 1);

    // --- File Header Section (26 bytes, fixed) ---
    out.ascii("8BPS", 4);
    out.u16(1);                 // version 1 = PSD (not PSB)
    for (int i = 0; i < 6; ++i) out.u8(0); // reserved
    out.u16(3);                 // channels in the composite/merged image: R,G,B
    out.u32(static_cast<uint32_t>(docH));
    out.u32(static_cast<uint32_t>(docW));
    out.u16(8);                 // 8 bits/channel
    out.u16(3);                 // color mode: RGB

    // --- Color Mode Data Section (empty: not indexed/duotone) ---
    out.u32(0);

    // --- Image Resources Section (empty) ---
    out.u32(0);

    // --- Layer and Mask Information Section ---
    size_t layerMaskInfoLenPos = out.size();
    out.u32(0); // placeholder, patched below
    size_t layerMaskInfoStart = out.size();

    size_t layerInfoLenPos = out.size();
    out.u32(0); // placeholder
    size_t layerInfoStart = out.size();

    auto drawOrder = project.drawOrder(); // back-to-front
    // PSD layer records are listed bottom-to-top in the same order the
    // Layers panel stacks them visually front-to-back reading top-down;
    // "bottom of stack first" in the record list corresponds to our
    // back-to-front draw order directly.
    out.i16(static_cast<int16_t>(drawOrder.size()));

    struct PreparedLayer {
        const Layer* layer;
        Rect rect; // document-space, canvas origin (0,0) at top-left
        std::vector<LayerChannel> channels;
    };
    std::vector<PreparedLayer> prepared;
    prepared.reserve(drawOrder.size());

    for (const auto& id : drawOrder) {
        const Layer* layer = project.findLayer(id);
        if (!layer) continue;
        PixelBuffer content = layer->rgba.toDenseBuffer();
        Rect b = layer->rgba.bounds();
        int32_t left = b.x + static_cast<int32_t>(layer->offsetX) - canvas.x;
        int32_t top = b.y + static_cast<int32_t>(layer->offsetY) - canvas.y;
        int32_t w = content.width(), h = content.height();

        PreparedLayer pl;
        pl.layer = layer;
        pl.rect = Rect{left, top, w, h};

        LayerChannel r{0, {}}, g{1, {}}, bch{2, {}}, a{-1, {}};
        size_t n = static_cast<size_t>(w) * h;
        r.plane.resize(n); g.plane.resize(n); bch.plane.resize(n); a.plane.resize(n);
        for (int32_t y = 0; y < h; ++y) {
            for (int32_t x = 0; x < w; ++x) {
                const RGBA8& p = content.at(x, y);
                size_t i = static_cast<size_t>(y) * w + x;
                r.plane[i] = p.r; g.plane[i] = p.g; bch.plane[i] = p.b; a.plane[i] = p.a;
            }
        }
        pl.channels = {r, g, bch, a};
        prepared.push_back(std::move(pl));
    }

    for (const auto& pl : prepared) {
        out.i32(pl.rect.y);              // top
        out.i32(pl.rect.x);              // left
        out.i32(pl.rect.y + pl.rect.h);  // bottom
        out.i32(pl.rect.x + pl.rect.w);  // right
        out.u16(static_cast<uint16_t>(pl.channels.size()));
        for (const auto& ch : pl.channels) {
            out.i16(ch.id);
            // channel data length = 2 (compression method u16) + raw plane bytes
            out.u32(static_cast<uint32_t>(2 + ch.plane.size()));
        }
        out.ascii("8BIM", 4);
        out.ascii(blendModeKey(pl.layer->blendMode), 4);
        out.u8(static_cast<uint8_t>(std::clamp(pl.layer->opacity, 0.0f, 1.0f) * 255.0f + 0.5f));
        out.u8(0); // clipping: base
        // Flags bit0=transparency protected(0), bit1=hidden(1 if not visible).
        // See psd_writer.h for the "bit1=visible" spec-text vs. de-facto
        // "bit1=hidden" implementation note.
        uint8_t flags = pl.layer->visible ? 0x00 : 0x02;
        out.u8(flags);
        out.u8(0); // filler

        size_t extraLenPos = out.size();
        out.u32(0); // placeholder for "length of extra data"
        size_t extraStart = out.size();

        out.u32(0); // layer mask data length: none
        out.u32(0); // layer blending ranges length: none
        out.pascalString(pl.layer->name.empty() ? "Layer" : pl.layer->name);

        uint32_t extraLen = static_cast<uint32_t>(out.size() - extraStart);
        out.patchU32(extraLenPos, extraLen);
    }

    // Channel image data, in the same layer order, same channel order as declared above.
    for (const auto& pl : prepared) {
        for (const auto& ch : pl.channels) {
            out.u16(0); // compression method: 0 = raw
            out.bytes(ch.plane);
        }
    }

    if ((out.size() - layerInfoStart) % 2 != 0) out.u8(0); // even-pad layer info section
    uint32_t layerInfoLen = static_cast<uint32_t>(out.size() - layerInfoStart);
    out.patchU32(layerInfoLenPos, layerInfoLen);

    out.u32(0); // global layer mask info: none

    if ((out.size() - layerMaskInfoStart) % 2 != 0) out.u8(0);
    uint32_t layerMaskInfoLen = static_cast<uint32_t>(out.size() - layerMaskInfoStart);
    out.patchU32(layerMaskInfoLenPos, layerMaskInfoLen);

    // --- Image Data Section: flattened RGB merged preview (required) ---
    PixelBuffer merged = project.compositeAll();
    out.u16(0); // compression: raw
    size_t n = static_cast<size_t>(docW) * docH;
    std::vector<uint8_t> rPlane(n), gPlane(n), bPlane(n);
    for (int32_t y = 0; y < docH; ++y) {
        for (int32_t x = 0; x < docW; ++x) {
            RGBA8 p = (x < merged.width() && y < merged.height()) ? merged.at(x, y) : RGBA8{0, 0, 0, 0};
            size_t i = static_cast<size_t>(y) * docW + x;
            // Composite over opaque white so the merged preview (which has
            // no alpha channel declared in the header, per psd_writer.h) is
            // not a transparency-multiplied color underneath viewers that
            // ignore alpha.
            float a = p.a / 255.0f;
            rPlane[i] = static_cast<uint8_t>(p.r * a + 255 * (1 - a));
            gPlane[i] = static_cast<uint8_t>(p.g * a + 255 * (1 - a));
            bPlane[i] = static_cast<uint8_t>(p.b * a + 255 * (1 - a));
        }
    }
    out.bytes(rPlane);
    out.bytes(gPlane);
    out.bytes(bPlane);

    return out.take();
}

} // namespace unflatten
