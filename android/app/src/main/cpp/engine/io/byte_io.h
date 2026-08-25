#pragma once
#include <vector>
#include <cstdint>
#include <cstring>
#include <string>
#include <stdexcept>

namespace unflatten {

// Minimal little-endian binary writer/reader shared by the UF7P format and
// the PSD/PNG writers. No external dependency (not even endian.h) so it
// behaves identically on the NDK cross-compile and the host test build.
class ByteWriter {
public:
    void u8(uint8_t v) { buf_.push_back(v); }
    void u16(uint16_t v) { u8(v & 0xFF); u8((v >> 8) & 0xFF); }
    void u32(uint32_t v) { u16(v & 0xFFFF); u16((v >> 16) & 0xFFFF); }
    void u64(uint64_t v) { u32(v & 0xFFFFFFFFu); u32(static_cast<uint32_t>(v >> 32)); }
    void i32(int32_t v) { u32(static_cast<uint32_t>(v)); }
    void f32(float v) { uint32_t bits; std::memcpy(&bits, &v, 4); u32(bits); }

    void bytes(const uint8_t* data, size_t len) { buf_.insert(buf_.end(), data, data + len); }
    void bytes(const std::vector<uint8_t>& v) { bytes(v.data(), v.size()); }

    // Length-prefixed UTF-8 string (u32 byte length + bytes, no NUL).
    void str(const std::string& s) {
        u32(static_cast<uint32_t>(s.size()));
        bytes(reinterpret_cast<const uint8_t*>(s.data()), s.size());
    }

    size_t size() const { return buf_.size(); }
    const std::vector<uint8_t>& data() const { return buf_; }
    std::vector<uint8_t> take() { return std::move(buf_); }

private:
    std::vector<uint8_t> buf_;
};

class ByteReader {
public:
    ByteReader(const uint8_t* data, size_t len) : data_(data), len_(len) {}
    explicit ByteReader(const std::vector<uint8_t>& v) : data_(v.data()), len_(v.size()) {}

    uint8_t u8() { need(1); return data_[pos_++]; }
    uint16_t u16() { uint16_t lo = u8(); uint16_t hi = u8(); return lo | (hi << 8); }
    uint32_t u32() { uint32_t lo = u16(); uint32_t hi = u16(); return lo | (hi << 16); }
    uint64_t u64() { uint64_t lo = u32(); uint64_t hi = u32(); return lo | (hi << 32); }
    int32_t i32() { return static_cast<int32_t>(u32()); }
    float f32() { uint32_t bits = u32(); float v; std::memcpy(&v, &bits, 4); return v; }

    std::vector<uint8_t> bytes(size_t n) {
        need(n);
        std::vector<uint8_t> out(data_ + pos_, data_ + pos_ + n);
        pos_ += n;
        return out;
    }

    std::string str() {
        uint32_t n = u32();
        need(n);
        std::string s(reinterpret_cast<const char*>(data_ + pos_), n);
        pos_ += n;
        return s;
    }

    size_t remaining() const { return len_ - pos_; }
    size_t position() const { return pos_; }
    bool atEnd() const { return pos_ >= len_; }

private:
    void need(size_t n) const {
        if (pos_ + n > len_) throw std::runtime_error("UF7P: truncated/corrupt data (unexpected end of chunk)");
    }
    const uint8_t* data_;
    size_t len_;
    size_t pos_ = 0;
};

} // namespace unflatten
