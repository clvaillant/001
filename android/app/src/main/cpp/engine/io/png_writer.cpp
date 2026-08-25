#include "png_writer.h"
#include "big_endian_io.h"
#include "zlib_util.h"
#include <cstring>

namespace unflatten {

namespace {

void writeChunk(BigEndianWriter& out, const char* type4, const std::vector<uint8_t>& data) {
    out.u32(static_cast<uint32_t>(data.size()));
    size_t crcStart = out.size();
    out.ascii(type4, 4);
    out.bytes(data);
    // CRC32 covers the chunk type + data, not the length field (PNG spec).
    std::vector<uint8_t> crcInput(out.data().begin() + crcStart, out.data().end());
    out.u32(crc32Of(crcInput));
}

} // namespace

std::vector<uint8_t> encodePng(const PixelBuffer& image) {
    BigEndianWriter out;
    static const uint8_t kSignature[8] = {0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A};
    out.bytes(kSignature, 8);

    // IHDR: width, height, bit depth 8, color type 6 (RGBA), compression 0,
    // filter method 0, interlace 0 (no interlacing -- not needed offline).
    {
        BigEndianWriter ihdr;
        ihdr.u32(static_cast<uint32_t>(image.width()));
        ihdr.u32(static_cast<uint32_t>(image.height()));
        ihdr.u8(8);
        ihdr.u8(6);
        ihdr.u8(0);
        ihdr.u8(0);
        ihdr.u8(0);
        writeChunk(out, "IHDR", ihdr.take());
    }

    // Raw scanline stream: each row is [filter byte = 0][R G B A]*width.
    std::vector<uint8_t> raw;
    raw.reserve(static_cast<size_t>(image.height()) * (1 + image.width() * 4));
    for (int32_t y = 0; y < image.height(); ++y) {
        raw.push_back(0); // filter type None
        for (int32_t x = 0; x < image.width(); ++x) {
            const RGBA8& p = image.at(x, y);
            raw.push_back(p.r);
            raw.push_back(p.g);
            raw.push_back(p.b);
            raw.push_back(p.a);
        }
    }
    std::vector<uint8_t> compressed = zlibCompress(raw, /*level=*/6);
    writeChunk(out, "IDAT", compressed);

    writeChunk(out, "IEND", {});

    return out.take();
}

} // namespace unflatten
