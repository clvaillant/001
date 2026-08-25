#include "test_framework.h"
#include "../app/src/main/cpp/engine/fallback/inpaint_fallback.h"

using namespace unflatten;

TEST_CASE(InpaintFallback_UniformBackground_FillsHoleWithSameColor) {
    PixelBuffer img(30, 30);
    img.fill(RGBA8{100, 150, 200, 255});
    std::vector<uint8_t> hole(30 * 30, 0);
    for (int32_t y = 10; y < 20; ++y)
        for (int32_t x = 10; x < 20; ++x)
            hole[y * 30 + x] = 1;

    fallback::inpaintFallback(img, hole, 200);

    RGBA8 center = img.at(15, 15);
    CHECK_NEAR(static_cast<int>(center.r), 100, 5);
    CHECK_NEAR(static_cast<int>(center.g), 150, 5);
    CHECK_NEAR(static_cast<int>(center.b), 200, 5);
    CHECK_EQ(center.a, 255);
}

TEST_CASE(InpaintFallback_NonHolePixels_AreUnchanged) {
    PixelBuffer img(10, 10);
    for (int32_t y = 0; y < 10; ++y)
        for (int32_t x = 0; x < 10; ++x)
            img.at(x, y) = RGBA8{static_cast<uint8_t>(x * 20), static_cast<uint8_t>(y * 20), 0, 255};
    std::vector<uint8_t> hole(100, 0);
    hole[55] = 1; // (5,5)
    RGBA8 before = img.at(0, 0);

    fallback::inpaintFallback(img, hole, 50);
    CHECK_EQ(img.at(0, 0).r, before.r);
    CHECK_EQ(img.at(0, 0).g, before.g);
}

TEST_CASE(InpaintFallback_GradientBackground_InterpolatesAcrossHole) {
    // Horizontal gradient; a hole spanning it should fill with intermediate
    // values, not the color from only one side.
    PixelBuffer img(40, 10);
    for (int32_t y = 0; y < 10; ++y)
        for (int32_t x = 0; x < 40; ++x)
            img.at(x, y) = RGBA8{static_cast<uint8_t>(x * 6), 0, 0, 255};
    std::vector<uint8_t> hole(40 * 10, 0);
    for (int32_t y = 0; y < 10; ++y)
        for (int32_t x = 15; x < 25; ++x)
            hole[y * 40 + x] = 1;

    fallback::inpaintFallback(img, hole, 400);
    uint8_t leftEdge = img.at(14, 5).r;
    uint8_t rightEdge = img.at(25, 5).r;
    uint8_t center = img.at(20, 5).r;
    CHECK(center > leftEdge);
    CHECK(center < rightEdge);
}
