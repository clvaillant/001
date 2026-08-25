#pragma once
#include <vector>
#include <cstdint>
#include <string>
#include <algorithm>
#include <stdexcept>

// PNG and PSD are both big-endian formats, unlike UF7P's little-endian
// ByteWriter/ByteReader (byte_io.h). Kept separate rather than adding an
// endianness flag to ByteWriter, to keep each writer's on-disk-format intent
// unambiguous at the call site.
namespace unflatten {

class BigEndianWriter {
public:
    void u8(uint8_t v) { buf_.push_back(v); }
    void u16(uint16_t v) { u8((v >> 8) & 0xFF); u8(v & 0xFF); }
    void u32(uint32_t v) { u16((v >> 16) & 0xFFFF); u16(v & 0xFFFF); }
    void i16(int16_t v) { u16(static_cast<uint16_t>(v)); }
    void i32(int32_t v) { u32(static_cast<uint32_t>(v)); }
    void bytes(const uint8_t* data, size_t len) { buf_.insert(buf_.end(), data, data + len); }
    void bytes(const std::vector<uint8_t>& v) { bytes(v.data(), v.size()); }
    // Fixed-width ASCII (padded/truncated to `width`), used for PSD's
    // Pascal-ish fixed tags and PNG chunk type codes.
    void ascii(const std::string& s, size_t width) {
        for (size_t i = 0; i < width; ++i) u8(i < s.size() ? static_cast<uint8_t>(s[i]) : ' ');
    }
    // PSD "Pascal string": u8 length + bytes, padded so the total (1+len)
    // is a multiple of 2.
    void pascalString(const std::string& s) {
        uint8_t len = static_cast<uint8_t>(std::min<size_t>(s.size(), 255));
        u8(len);
        bytes(reinterpret_cast<const uint8_t*>(s.data()), len);
        if ((len + 1) % 2 != 0) u8(0);
    }

    size_t size() const { return buf_.size(); }
    const std::vector<uint8_t>& data() const { return buf_; }
    std::vector<uint8_t> take() { return std::move(buf_); }

    // Patch a previously-written u32 length field, for length-prefixed
    // sections whose size isn't known until after their body is written
    // (PSD layer records, image resource blocks, etc.).
    void patchU32(size_t pos, uint32_t v) {
        buf_[pos] = (v >> 24) & 0xFF; buf_[pos+1] = (v >> 16) & 0xFF;
        buf_[pos+2] = (v >> 8) & 0xFF; buf_[pos+3] = v & 0xFF;
    }

private:
    std::vector<uint8_t> buf_;
};

// Independent reader, used by tests to parse a BigEndianWriter's output
// (PSD/PNG) without going through the writer's own code -- exercising the
// on-disk format itself, not just "the writer agrees with itself."
class BigEndianReader {
public:
    BigEndianReader(const uint8_t* data, size_t len) : data_(data), len_(len) {}
    explicit BigEndianReader(const std::vector<uint8_t>& v) : data_(v.data()), len_(v.size()) {}

    uint8_t u8() { need(1); return data_[pos_++]; }
    uint16_t u16() { uint16_t hi = u8(); uint16_t lo = u8(); return (hi << 8) | lo; }
    uint32_t u32() { uint32_t hi = u16(); uint32_t lo = u16(); return (hi << 16) | lo; }
    int16_t i16() { return static_cast<int16_t>(u16()); }
    int32_t i32() { return static_cast<int32_t>(u32()); }
    std::string ascii(size_t width) {
        need(width);
        std::string s(reinterpret_cast<const char*>(data_ + pos_), width);
        pos_ += width;
        return s;
    }
    std::vector<uint8_t> bytes(size_t n) {
        need(n);
        std::vector<uint8_t> out(data_ + pos_, data_ + pos_ + n);
        pos_ += n;
        return out;
    }
    void skip(size_t n) { need(n); pos_ += n; }
    size_t position() const { return pos_; }
    size_t remaining() const { return len_ - pos_; }

private:
    void need(size_t n) const {
        if (pos_ + n > len_) throw std::runtime_error("BigEndianReader: unexpected end of data");
    }
    const uint8_t* data_;
    size_t len_;
    size_t pos_ = 0;
};

} // namespace unflatten
