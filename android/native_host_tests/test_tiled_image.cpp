#include "test_framework.h"
#include "../app/src/main/cpp/engine/tiling/tiled_image.h"

using namespace unflatten;

TEST_CASE(TiledImage_SetGetPixel_RoundTrips) {
    TiledImage img;
    img.setPixel(10, 20, RGBA8{1, 2, 3, 4});
    img.setPixel(600, 700, RGBA8{5, 6, 7, 8}); // forces a second tile (kTileSize=512)
    CHECK_EQ(img.getPixel(10, 20).r, 1);
    CHECK_EQ(img.getPixel(600, 700).g, 6);
    CHECK_EQ(img.getPixel(0, 0).a, 0); // untouched pixel defaults transparent
}

TEST_CASE(TiledImage_Bounds_GrowsToIncludeWrittenPixels) {
    TiledImage img;
    img.setPixel(5, 5, RGBA8{1, 1, 1, 1});
    img.setPixel(50, 2, RGBA8{1, 1, 1, 1});
    Rect b = img.bounds();
    CHECK(b.x <= 5 && b.y <= 2);
    CHECK(b.right() >= 51 && b.bottom() >= 6);
}

TEST_CASE(TiledImage_NegativeCoordinates_Work) {
    // Needed for outpainted canvas regions (brief §16) which can extend
    // left/above the original image origin.
    TiledImage img;
    img.setPixel(-100, -50, RGBA8{9, 9, 9, 255});
    CHECK_EQ(img.getPixel(-100, -50).r, 9);
    CHECK(img.bounds().x <= -100);
}

TEST_CASE(TiledImage_DenseBufferRoundTrip) {
    PixelBuffer src(8, 8);
    for (int32_t y = 0; y < 8; ++y)
        for (int32_t x = 0; x < 8; ++x)
            src.at(x, y) = RGBA8{static_cast<uint8_t>(x), static_cast<uint8_t>(y), 0, 255};

    TiledImage img = TiledImage::fromDenseBuffer(src, 100, 200);
    PixelBuffer back = img.toDenseBuffer();
    CHECK_EQ(back.width(), 8);
    CHECK_EQ(back.height(), 8);
    for (int32_t y = 0; y < 8; ++y) {
        for (int32_t x = 0; x < 8; ++x) {
            CHECK_EQ(back.at(x, y).r, src.at(x, y).r);
            CHECK_EQ(back.at(x, y).g, src.at(x, y).g);
        }
    }
}

TEST_CASE(PixelBuffer_BlitOver_AlphaCompositesCorrectly) {
    PixelBuffer dst(4, 4);
    dst.fill(RGBA8{0, 0, 0, 255}); // opaque black background

    PixelBuffer src(2, 2);
    src.fill(RGBA8{255, 255, 255, 128}); // 50% white

    dst.blitOver(src, 1, 1);
    RGBA8 result = dst.at(1, 1);
    // 50% white over opaque black -> ~mid gray, fully opaque
    CHECK_EQ(result.a, 255);
    CHECK(result.r > 100 && result.r < 155);
}
