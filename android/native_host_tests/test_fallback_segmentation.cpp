#include "test_framework.h"
#include "../app/src/main/cpp/engine/fallback/segmentation_fallback.h"
#include "../app/src/main/cpp/engine/fallback/inpaint_fallback.h"
#include <cstdlib>

using namespace unflatten;

namespace {
PixelBuffer makeUniformWithBlob(int32_t w, int32_t h, RGBA8 bg, RGBA8 fg, Rect blob) {
    PixelBuffer img(w, h);
    img.fill(bg);
    for (int32_t y = blob.y; y < blob.bottom(); ++y)
        for (int32_t x = blob.x; x < blob.right(); ++x)
            img.at(x, y) = fg;
    return img;
}
} // namespace

TEST_CASE(FallbackSegmentation_FindsSingleHighContrastBlob) {
    PixelBuffer img = makeUniformWithBlob(100, 100, RGBA8{240, 240, 240, 255}, RGBA8{10, 10, 200, 255},
                                           Rect{30, 30, 40, 40});
    auto instances = fallback::segmentForegroundInstances(img, /*minComponentAreaPx=*/50);
    CHECK_EQ(instances.size(), static_cast<size_t>(1));
    if (!instances.empty()) {
        // Morphological open can erode ~1px from the true edge; allow slack.
        CHECK(std::abs(instances[0].bounds.x - 30) <= 2);
        CHECK(std::abs(instances[0].bounds.y - 30) <= 2);
        CHECK(std::abs(instances[0].bounds.w - 40) <= 4);
    }
}

TEST_CASE(FallbackSegmentation_UniformImage_FindsNothing) {
    PixelBuffer img(50, 50);
    img.fill(RGBA8{128, 128, 128, 255});
    auto instances = fallback::segmentForegroundInstances(img);
    CHECK(instances.empty());
}

TEST_CASE(FallbackSegmentation_TwoSeparateBlobs_FoundAsTwoInstances) {
    PixelBuffer img(120, 60);
    img.fill(RGBA8{240, 240, 240, 255});
    for (int32_t y = 5; y < 25; ++y)
        for (int32_t x = 5; x < 25; ++x)
            img.at(x, y) = RGBA8{200, 10, 10, 255};
    for (int32_t y = 5; y < 25; ++y)
        for (int32_t x = 90; x < 110; ++x)
            img.at(x, y) = RGBA8{10, 200, 10, 255};

    auto instances = fallback::segmentForegroundInstances(img, 50);
    CHECK_EQ(instances.size(), static_cast<size_t>(2));
}
