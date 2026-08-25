#pragma once
#include <unordered_map>
#include <utility>
#include "pixel_buffer.h"

namespace unflatten {

// Brief §27 suggests 256 or 512; DECISIONS.md #4 picks 512 for the 12GB-RAM
// target device (fewer tiles -> less per-tile compression/CRC overhead).
constexpr int32_t kTileSize = 512;

struct TileKey {
    int32_t tx = 0, ty = 0;
    bool operator==(const TileKey& o) const { return tx == o.tx && ty == o.ty; }
};
struct TileKeyHash {
    size_t operator()(const TileKey& k) const {
        return (static_cast<uint64_t>(static_cast<uint32_t>(k.tx)) << 32) ^
               static_cast<uint32_t>(k.ty);
    }
};

// Sparse tiled RGBA8 store backing one layer's compact bounds. Only tiles
// that have been written are allocated (brief §26 "compact bounds", §27
// "tiled storage; lazy loading"). Two layers of the same document each own
// an independent TiledImage restricted to their own bounds, not the full
// canvas -- this is what keeps memory bounded for documents with dozens of
// layers on a bitmap-sized canvas (§27).
class TiledImage {
public:
    Rect bounds() const { return bounds_; }

    RGBA8 getPixel(int32_t x, int32_t y) const {
        if (!bounds_.contains(x, y)) return RGBA8{0, 0, 0, 0};
        auto it = tiles_.find(tileKeyFor(x, y));
        if (it == tiles_.end()) return RGBA8{0, 0, 0, 0};
        auto [lx, ly] = localCoord(x, y);
        return it->second.at(lx, ly);
    }

    void setPixel(int32_t x, int32_t y, RGBA8 color) {
        bounds_ = bounds_.unionWith(Rect{x, y, 1, 1});
        TileKey key = tileKeyFor(x, y);
        auto it = tiles_.find(key);
        if (it == tiles_.end()) {
            it = tiles_.emplace(key, PixelBuffer(kTileSize, kTileSize)).first;
        }
        auto [lx, ly] = localCoord(x, y);
        it->second.at(lx, ly) = color;
    }

    // Materializes `bounds()` as one dense buffer. Used for compositing and
    // export, where the caller already restricted the region of interest to
    // a layer-local crop rather than the full canvas (§12 "object-local
    // crops").
    PixelBuffer toDenseBuffer() const {
        PixelBuffer out(std::max(bounds_.w, 0), std::max(bounds_.h, 0));
        if (out.empty()) return out;
        for (int32_t y = 0; y < bounds_.h; ++y) {
            for (int32_t x = 0; x < bounds_.w; ++x) {
                out.at(x, y) = getPixel(bounds_.x + x, bounds_.y + y);
            }
        }
        return out;
    }

    static TiledImage fromDenseBuffer(const PixelBuffer& buf, int32_t originX, int32_t originY) {
        TiledImage img;
        for (int32_t y = 0; y < buf.height(); ++y) {
            for (int32_t x = 0; x < buf.width(); ++x) {
                RGBA8 c = buf.at(x, y);
                if (c.a != 0) img.setPixel(originX + x, originY + y, c);
            }
        }
        img.bounds_ = img.bounds_.unionWith(Rect{originX, originY, buf.width(), buf.height()});
        return img;
    }

    const std::unordered_map<TileKey, PixelBuffer, TileKeyHash>& tilesMap() const { return tiles_; }
    std::unordered_map<TileKey, PixelBuffer, TileKeyHash>& tilesMap() { return tiles_; }

    void setExplicitBounds(Rect r) { bounds_ = r; }

private:
    static int32_t floorDiv(int32_t a, int32_t b) {
        int32_t q = a / b;
        int32_t r = a % b;
        if (r != 0 && ((r < 0) != (b < 0))) --q;
        return q;
    }
    static TileKey tileKeyFor(int32_t x, int32_t y) {
        return TileKey{floorDiv(x, kTileSize), floorDiv(y, kTileSize)};
    }
    static std::pair<int32_t, int32_t> localCoord(int32_t x, int32_t y) {
        return {x - floorDiv(x, kTileSize) * kTileSize, y - floorDiv(y, kTileSize) * kTileSize};
    }

    Rect bounds_{};
    std::unordered_map<TileKey, PixelBuffer, TileKeyHash> tiles_;
};

} // namespace unflatten
