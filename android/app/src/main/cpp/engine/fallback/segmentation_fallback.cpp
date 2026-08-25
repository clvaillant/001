#include "segmentation_fallback.h"
#include "../common/connected_components.h"
#include <algorithm>

namespace unflatten {
namespace fallback {

namespace {

struct ColorStat {
    double meanR = 0, meanG = 0, meanB = 0;
    double varR = 25, varG = 25, varB = 25; // floor variance avoids div-by-zero on flat borders
};

std::vector<RGBA8> collectBorderSamples(const PixelBuffer& img, int32_t band) {
    std::vector<RGBA8> samples;
    int32_t w = img.width(), h = img.height();
    for (int32_t y = 0; y < h; ++y) {
        bool topOrBottom = y < band || y >= h - band;
        for (int32_t x = 0; x < w; ++x) {
            if (topOrBottom || x < band || x >= w - band) samples.push_back(img.at(x, y));
        }
    }
    return samples;
}

ColorStat computeStat(const std::vector<RGBA8>& samples) {
    ColorStat s;
    if (samples.empty()) return s;
    double n = static_cast<double>(samples.size());
    double sr = 0, sg = 0, sb = 0;
    for (auto& p : samples) { sr += p.r; sg += p.g; sb += p.b; }
    s.meanR = sr / n; s.meanG = sg / n; s.meanB = sb / n;
    double vr = 0, vg = 0, vb = 0;
    for (auto& p : samples) {
        vr += (p.r - s.meanR) * (p.r - s.meanR);
        vg += (p.g - s.meanG) * (p.g - s.meanG);
        vb += (p.b - s.meanB) * (p.b - s.meanB);
    }
    s.varR = std::max(vr / n, 25.0);
    s.varG = std::max(vg / n, 25.0);
    s.varB = std::max(vb / n, 25.0);
    return s;
}

// Simple binary morphology: erosion then dilation (an "opening"), 4-neighbor,
// one pass each, to remove isolated speckle pixels from the raw threshold.
std::vector<uint8_t> morphOpen(const std::vector<uint8_t>& mask, int32_t w, int32_t h) {
    auto get = [&](const std::vector<uint8_t>& m, int32_t xx, int32_t yy) -> uint8_t {
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) return 0;
        return m[static_cast<size_t>(yy) * w + xx];
    };
    std::vector<uint8_t> eroded(mask.size(), 0);
    for (int32_t y = 0; y < h; ++y)
        for (int32_t x = 0; x < w; ++x)
            eroded[static_cast<size_t>(y) * w + x] =
                (get(mask, x, y) && get(mask, x - 1, y) && get(mask, x + 1, y) &&
                 get(mask, x, y - 1) && get(mask, x, y + 1)) ? 255 : 0;

    std::vector<uint8_t> dilated(mask.size(), 0);
    for (int32_t y = 0; y < h; ++y)
        for (int32_t x = 0; x < w; ++x)
            dilated[static_cast<size_t>(y) * w + x] =
                (get(eroded, x, y) || get(eroded, x - 1, y) || get(eroded, x + 1, y) ||
                 get(eroded, x, y - 1) || get(eroded, x, y + 1)) ? 255 : 0;
    return dilated;
}

} // namespace

std::vector<FallbackInstance> segmentForegroundInstances(const PixelBuffer& image,
                                                           int32_t minComponentAreaPx,
                                                           int32_t borderBandPx) {
    int32_t w = image.width(), h = image.height();
    std::vector<FallbackInstance> instances;
    if (w <= 0 || h <= 0) return instances;

    ColorStat model = computeStat(collectBorderSamples(image, std::max(1, borderBandPx)));

    // Foreground threshold: squared per-channel distance from the border
    // model, normalized by that channel's border variance (a diagonal-
    // covariance Mahalanobis-style distance). A pixel far in color from the
    // sampled border statistics is classified foreground.
    constexpr double kThreshold = 6.0; // ~ combined 2.4 sigma across 3 channels
    std::vector<uint8_t> rawMask(static_cast<size_t>(w) * h, 0);
    for (int32_t y = 0; y < h; ++y) {
        for (int32_t x = 0; x < w; ++x) {
            const RGBA8& p = image.at(x, y);
            double dr = (p.r - model.meanR); double dg = (p.g - model.meanG); double db = (p.b - model.meanB);
            double dist = (dr * dr) / model.varR + (dg * dg) / model.varG + (db * db) / model.varB;
            rawMask[static_cast<size_t>(y) * w + x] = (dist > kThreshold) ? 255 : 0;
        }
    }

    std::vector<uint8_t> cleaned = morphOpen(rawMask, w, h);
    auto components = findConnectedComponents(cleaned, w, h, minComponentAreaPx);

    instances.reserve(components.size());
    for (auto& c : components) {
        FallbackInstance inst;
        inst.bounds = c.bounds;
        inst.alphaMask = std::move(c.mask);
        instances.push_back(std::move(inst));
    }

    // Largest first: in the absence of semantic priority, size is the only
    // available signal for "probably the main subject" ordering.
    std::sort(instances.begin(), instances.end(), [](const FallbackInstance& a, const FallbackInstance& b) {
        return (static_cast<int64_t>(a.bounds.w) * a.bounds.h) > (static_cast<int64_t>(b.bounds.w) * b.bounds.h);
    });
    return instances;
}

} // namespace fallback
} // namespace unflatten
