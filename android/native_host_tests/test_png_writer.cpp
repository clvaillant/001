#include "test_framework.h"
#include "../app/src/main/cpp/engine/io/png_writer.h"
#include "../app/src/main/cpp/engine/io/big_endian_io.h"
#include "../app/src/main/cpp/engine/io/zlib_util.h"

using namespace unflatten;

TEST_CASE(PngWriter_OutputHasValidSignatureAndStructure) {
    PixelBuffer img(4, 3);
    for (int32_t y = 0; y < 3; ++y)
        for (int32_t x = 0; x < 4; ++x)
            img.at(x, y) = RGBA8{static_cast<uint8_t>(x * 50), static_cast<uint8_t>(y * 50), 100, 255};

    auto png = encodePng(img);

    static const uint8_t kSig[8] = {0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A};
    CHECK(png.size() > 8);
    for (int i = 0; i < 8; ++i) CHECK_EQ(png[i], kSig[i]);

    BigEndianReader r(png);
    r.skip(8);
    uint32_t ihdrLen = r.u32();
    std::string ihdrType = r.ascii(4);
    CHECK_EQ(ihdrLen, static_cast<uint32_t>(13));
    CHECK_EQ(ihdrType, std::string("IHDR"));
    uint32_t w = r.u32();
    uint32_t h = r.u32();
    CHECK_EQ(w, static_cast<uint32_t>(4));
    CHECK_EQ(h, static_cast<uint32_t>(3));
    uint8_t bitDepth = r.u8();
    uint8_t colorType = r.u8();
    CHECK_EQ(bitDepth, 8);
    CHECK_EQ(colorType, 6); // RGBA
    r.skip(3); // compression, filter, interlace
    r.skip(4); // IHDR crc

    uint32_t idatLen = r.u32();
    std::string idatType = r.ascii(4);
    CHECK_EQ(idatType, std::string("IDAT"));
    auto compressed = r.bytes(idatLen);
    r.skip(4); // IDAT crc

    // Decompress and verify the raw scanline stream reproduces our pixels
    // exactly (filter byte 0 + RGBA per row, per png_writer.cpp).
    size_t expectedRaw = static_cast<size_t>(h) * (1 + w * 4);
    auto raw = zlibDecompress(compressed, expectedRaw);
    CHECK_EQ(raw.size(), expectedRaw);
    CHECK_EQ(raw[0], 0); // filter byte, row 0
    CHECK_EQ(raw[1], img.at(0, 0).r);
    CHECK_EQ(raw[2], img.at(0, 0).g);

    uint32_t iendLen = r.u32();
    std::string iendType = r.ascii(4);
    CHECK_EQ(iendLen, static_cast<uint32_t>(0));
    CHECK_EQ(iendType, std::string("IEND"));
}
