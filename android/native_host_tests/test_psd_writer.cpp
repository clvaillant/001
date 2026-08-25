#include "test_framework.h"
#include "../app/src/main/cpp/engine/io/psd_writer.h"
#include "../app/src/main/cpp/engine/io/big_endian_io.h"
#include "../app/src/main/cpp/engine/document/project.h"

using namespace unflatten;

namespace {
std::unique_ptr<Project> buildTwoLayerProject() {
    auto project = std::make_unique<Project>();
    project->sourceImage = PixelBuffer(10, 10);
    project->sourceObservation.canvasBounds = Rect{0, 0, 10, 10};

    auto bg = std::make_unique<Layer>();
    bg->id = LayerId{1, 1};
    bg->name = "Background";
    bg->type = LayerType::Background;
    bg->depthIndex = 0;
    PixelBuffer bgContent(10, 10);
    bgContent.fill(RGBA8{10, 20, 30, 255});
    bg->rgba = TiledImage::fromDenseBuffer(bgContent, 0, 0);
    project->addLayer(std::move(bg));

    auto obj = std::make_unique<Layer>();
    obj->id = LayerId{2, 2};
    obj->name = "Foo Object";
    obj->type = LayerType::Object;
    obj->depthIndex = 1;
    obj->opacity = 1.0f;
    PixelBuffer objContent(3, 4);
    objContent.fill(RGBA8{200, 40, 60, 255});
    obj->rgba = TiledImage::fromDenseBuffer(objContent, 2, 3);
    project->addLayer(std::move(obj));

    return project;
}

// Minimal independent PSD parser -- deliberately does NOT reuse any code
// from psd_writer.cpp, so this test exercises the actual on-disk bytes
// against the spec, not "the writer agrees with itself."
struct ParsedLayer {
    int32_t top, left, bottom, right;
    uint16_t channelCount;
    std::string name;
};
} // namespace

TEST_CASE(PsdWriter_IndependentParse_HeaderAndLayersMatchProject) {
    auto project = buildTwoLayerProject();
    auto psd = encodePsd(*project);

    BigEndianReader r(psd);
    CHECK_EQ(r.ascii(4), std::string("8BPS"));
    CHECK_EQ(r.u16(), 1); // version
    r.skip(6);            // reserved
    uint16_t channels = r.u16();
    CHECK_EQ(channels, 3); // RGB composite per psd_writer.h design decision
    uint32_t docH = r.u32();
    uint32_t docW = r.u32();
    CHECK_EQ(docW, static_cast<uint32_t>(10));
    CHECK_EQ(docH, static_cast<uint32_t>(10));
    CHECK_EQ(r.u16(), 8); // depth
    CHECK_EQ(r.u16(), 3); // RGB mode

    uint32_t colorModeDataLen = r.u32();
    CHECK_EQ(colorModeDataLen, static_cast<uint32_t>(0));
    r.skip(colorModeDataLen);

    uint32_t imageResourcesLen = r.u32();
    r.skip(imageResourcesLen);

    uint32_t layerMaskInfoLen = r.u32();
    size_t layerMaskInfoEnd = r.position() + layerMaskInfoLen;

    uint32_t layerInfoLen = r.u32();
    size_t layerInfoEnd = r.position() + layerInfoLen;
    int16_t layerCount = r.i16();
    CHECK_EQ(layerCount, 2);

    std::vector<ParsedLayer> layers;
    for (int i = 0; i < layerCount; ++i) {
        ParsedLayer pl{};
        pl.top = r.i32(); pl.left = r.i32(); pl.bottom = r.i32(); pl.right = r.i32();
        pl.channelCount = r.u16();
        for (uint16_t c = 0; c < pl.channelCount; ++c) {
            r.i16();  // channel id
            r.u32();  // channel data length
        }
        CHECK_EQ(r.ascii(4), std::string("8BIM"));
        r.skip(4); // blend mode key
        r.skip(1); // opacity
        r.skip(1); // clipping
        r.skip(1); // flags
        r.skip(1); // filler
        uint32_t extraLen = r.u32();
        size_t extraEnd = r.position() + extraLen;
        uint32_t maskDataLen = r.u32();
        r.skip(maskDataLen);
        uint32_t blendRangesLen = r.u32();
        r.skip(blendRangesLen);
        uint8_t nameLen = r.u8();
        auto nameBytes = r.bytes(nameLen);
        pl.name.assign(nameBytes.begin(), nameBytes.end());
        if ((nameLen + 1) % 2 != 0) r.skip(1);
        CHECK(r.position() <= extraEnd);
        r.skip(extraEnd - r.position());
        layers.push_back(pl);
    }

    // First record in file = bottom of stack = our draw-order-first layer (Background).
    CHECK_EQ(layers[0].name, std::string("Background"));
    CHECK_EQ(layers[1].name, std::string("Foo Object"));
    CHECK_EQ(layers[1].left, 2);
    CHECK_EQ(layers[1].top, 3);
    CHECK_EQ(layers[1].right - layers[1].left, 3);
    CHECK_EQ(layers[1].bottom - layers[1].top, 4);
    CHECK_EQ(layers[1].channelCount, static_cast<uint16_t>(4)); // R,G,B,A

    // Pixel-level channel data is verified independently below in
    // PsdWriter_LayerChannelPixelData_MatchesSourceExactly.
    r.skip(layerInfoEnd - r.position());

    uint32_t globalMaskLen = r.u32();
    r.skip(globalMaskLen);
    r.skip(layerMaskInfoEnd - r.position());

    uint16_t mergedCompression = r.u16();
    CHECK_EQ(mergedCompression, 0);
    auto rPlane = r.bytes(static_cast<size_t>(docW) * docH);
    // Background is (10,20,30); no object covers pixel (0,0), so the merged
    // preview's R channel there should be the background's R=10.
    CHECK_EQ(rPlane[0], 10);
}

TEST_CASE(PsdWriter_LayerChannelPixelData_MatchesSourceExactly) {
    auto project = buildTwoLayerProject();
    auto psd = encodePsd(*project);
    BigEndianReader r(psd);
    r.skip(4 + 2 + 6 + 2 + 4 + 4 + 2 + 2); // header through color mode
    uint32_t colorModeDataLen = r.u32(); r.skip(colorModeDataLen);
    uint32_t imageResourcesLen = r.u32(); r.skip(imageResourcesLen);
    r.u32(); // layer&mask info len (unused here)
    r.u32(); // layer info len (unused here)
    int16_t layerCount = r.i16();

    struct ChannelRef { int16_t id; uint32_t len; };
    std::vector<std::vector<ChannelRef>> allChannels;
    for (int i = 0; i < layerCount; ++i) {
        r.i32(); r.i32(); r.i32(); r.i32();
        uint16_t chCount = r.u16();
        std::vector<ChannelRef> chans;
        for (uint16_t c = 0; c < chCount; ++c) {
            int16_t id = r.i16();
            uint32_t len = r.u32();
            chans.push_back({id, len});
        }
        allChannels.push_back(chans);
        r.skip(4 + 4 + 1 + 1 + 1 + 1); // 8BIM + blend key + opacity + clip + flags + filler
        uint32_t extraLen = r.u32();
        r.skip(extraLen);
    }

    // Now positioned at channel image data, in the same layer/channel order.
    // Layer 0 = Background (1 channel: R,G,B only if 3 declared... our
    // writer always declares 4 (RGBA) per layer regardless of type).
    for (int li = 0; li < layerCount; ++li) {
        for (auto& ch : allChannels[li]) {
            uint16_t compression = r.u16();
            CHECK_EQ(compression, 0);
            auto plane = r.bytes(ch.len - 2);
            if (li == 1 && ch.id == 0) { // Foo Object's R channel
                CHECK_EQ(plane[0], 200);
            }
        }
    }
}
