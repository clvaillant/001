#pragma once
#include <vector>
#include <cstdint>
#include <stdexcept>
#include <zlib.h>

namespace unflatten {

inline uint32_t crc32Of(const uint8_t* data, size_t len) {
    uLong c = crc32(0L, Z_NULL, 0);
    c = crc32(c, data, static_cast<uInt>(len));
    return static_cast<uint32_t>(c);
}
inline uint32_t crc32Of(const std::vector<uint8_t>& v) {
    return v.empty() ? crc32Of(nullptr, 0) : crc32Of(v.data(), v.size());
}

inline std::vector<uint8_t> zlibCompress(const std::vector<uint8_t>& in, int level = Z_BEST_SPEED) {
    if (in.empty()) return {};
    uLongf boundLen = compressBound(static_cast<uLong>(in.size()));
    std::vector<uint8_t> out(boundLen);
    int rc = compress2(out.data(), &boundLen, in.data(), static_cast<uLong>(in.size()), level);
    if (rc != Z_OK) throw std::runtime_error("zlib compress2 failed");
    out.resize(boundLen);
    return out;
}

inline std::vector<uint8_t> zlibDecompress(const std::vector<uint8_t>& in, size_t expectedSize) {
    if (expectedSize == 0) return {};
    std::vector<uint8_t> out(expectedSize);
    uLongf outLen = static_cast<uLongf>(expectedSize);
    int rc = uncompress(out.data(), &outLen, in.data(), static_cast<uLong>(in.size()));
    if (rc != Z_OK) throw std::runtime_error("UF7P: zlib decompress failed (corrupt chunk)");
    if (outLen != expectedSize) throw std::runtime_error("UF7P: decompressed size mismatch (corrupt chunk)");
    return out;
}

} // namespace unflatten
