#pragma once
#include <vector>
#include "../common/types.h"

namespace unflatten {

// Dense per-pixel provenance classification over one layer's compact
// bounds (brief §25). Deliberately dense rather than tiled/sparse: layer
// bounds are already cropped to the object's extent, so a 1-byte-per-pixel
// buffer over that crop is small, and RLE-compresses trivially at
// serialization time (see uf7p_format.cpp) because provenance is highly
// spatially coherent (whole regions are OBSERVED or whole regions are
// FALLBACK_HEURISTIC).
class ProvenanceMap {
public:
    ProvenanceMap() = default;
    ProvenanceMap(int32_t w, int32_t h, Provenance fill)
        : w_(w), h_(h), data_(static_cast<size_t>(w) * h, static_cast<uint8_t>(fill)) {}

    int32_t width() const { return w_; }
    int32_t height() const { return h_; }

    Provenance at(int32_t x, int32_t y) const {
        return static_cast<Provenance>(data_[static_cast<size_t>(y) * w_ + x]);
    }
    void set(int32_t x, int32_t y, Provenance p) {
        data_[static_cast<size_t>(y) * w_ + x] = static_cast<uint8_t>(p);
    }

    const std::vector<uint8_t>& raw() const { return data_; }
    std::vector<uint8_t>& raw() { return data_; }

    // Fraction of pixels (within `alphaMask`, an RGBA buffer whose alpha
    // channel selects "counts") that are not OBSERVED. Used by QC (§49) and
    // the editor's provenance summary badge.
    double inferredOrManualFraction() const {
        if (data_.empty()) return 0.0;
        size_t nonObserved = 0;
        for (uint8_t v : data_) {
            if (static_cast<Provenance>(v) != Provenance::Observed) ++nonObserved;
        }
        return static_cast<double>(nonObserved) / static_cast<double>(data_.size());
    }

private:
    int32_t w_ = 0, h_ = 0;
    std::vector<uint8_t> data_;
};

} // namespace unflatten
