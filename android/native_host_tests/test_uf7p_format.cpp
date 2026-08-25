#include "test_framework.h"
#include "../app/src/main/cpp/engine/io/uf7p_format.h"

using namespace unflatten;

namespace {
std::unique_ptr<Project> buildSampleProject() {
    auto project = std::make_unique<Project>();
    project->projectUuid = "test-uuid-1234";
    project->sourceImage = PixelBuffer(6, 6);
    for (int32_t y = 0; y < 6; ++y)
        for (int32_t x = 0; x < 6; ++x)
            project->sourceImage.at(x, y) = RGBA8{static_cast<uint8_t>(x * 10), static_cast<uint8_t>(y * 10), 5, 255};
    project->sourceObservation.originalImageBounds = Rect{0, 0, 6, 6};
    project->sourceObservation.canvasBounds = Rect{0, 0, 6, 6};
    project->pipelineStage = PipelineStage::Edit;
    project->stageNotes = {"note one", "note two"};

    auto layer = std::make_unique<Layer>();
    layer->id = LayerId{0x1122334455667788ULL, 0x99AABBCCDDEEFF00ULL};
    layer->name = "Layer A";
    layer->type = LayerType::Object;
    layer->opacity = 0.75f;
    layer->blendMode = BlendMode::Multiply;
    layer->depthIndex = 1;
    PixelBuffer content(3, 3);
    content.fill(RGBA8{200, 100, 50, 255});
    layer->rgba = TiledImage::fromDenseBuffer(content, 1, 1);
    layer->visibleMask = layer->rgba;
    layer->amodalMask = layer->rgba;
    layer->provenance = ProvenanceMap(3, 3, Provenance::FallbackHeuristic);
    layer->generation.generationPass = "TEST_PASS";

    LayerId layerId = layer->id;
    project->addLayer(std::move(layer));

    LayerId other{1, 2};
    project->occlusionGraph.addEdge(layerId, other, 0.9f);
    return project;
}
} // namespace

TEST_CASE(UF7P_SerializeDeserialize_RoundTripsAllFields) {
    auto original = buildSampleProject();
    auto bytes = serializeProject(*original);
    CHECK(bytes.size() > 0);

    auto result = deserializeProject(bytes);
    CHECK(!result.fatal);
    CHECK_EQ(result.warnings.size(), static_cast<size_t>(0));
    CHECK(result.project != nullptr);

    Project& loaded = *result.project;
    CHECK_EQ(loaded.projectUuid, original->projectUuid);
    CHECK(loaded.pipelineStage == PipelineStage::Edit);
    CHECK_EQ(loaded.stageNotes.size(), static_cast<size_t>(2));
    CHECK_EQ(loaded.layers.size(), static_cast<size_t>(1));

    Layer& l = *loaded.layers[0];
    CHECK(l.id == original->layers[0]->id);
    CHECK_EQ(l.name, "Layer A");
    CHECK_NEAR(l.opacity, 0.75, 0.001);
    CHECK(l.blendMode == BlendMode::Multiply);
    CHECK_EQ(l.generation.generationPass, "TEST_PASS");

    PixelBuffer loadedContent = l.rgba.toDenseBuffer();
    CHECK_EQ(loadedContent.at(0, 0).r, 200);

    CHECK_EQ(loaded.occlusionGraph.edges().size(), static_cast<size_t>(1));

    // Source image pixel data round-trips exactly (lossless, §50).
    CHECK_EQ(loaded.sourceImage.at(3, 4).r, original->sourceImage.at(3, 4).r);
    CHECK_EQ(loaded.sourceImage.at(3, 4).g, original->sourceImage.at(3, 4).g);
}

TEST_CASE(UF7P_BadMagic_IsFatal) {
    std::vector<uint8_t> garbage = {'X', 'X', 'X', 'X', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0};
    auto result = deserializeProject(garbage);
    CHECK(result.fatal);
    CHECK(!result.fatalError.empty());
}

TEST_CASE(UF7P_TruncatedFile_IsFatalNotCrash) {
    auto original = buildSampleProject();
    auto bytes = serializeProject(*original);
    bytes.resize(bytes.size() / 2); // truncate mid-file
    auto result = deserializeProject(bytes);
    CHECK(result.fatal); // footer will be missing/corrupt -> reported, not a crash
}

TEST_CASE(UF7P_CorruptedLayerChunk_IsSkippedNotFatal) {
    auto original = buildSampleProject();
    auto bytes = serializeProject(*original);

    // Flip a byte inside the file body (well before the footer/manifest) to
    // corrupt some chunk's compressed payload without touching the magic,
    // footer, or manifest itself.
    size_t corruptAt = 40;
    CHECK(corruptAt < bytes.size());
    bytes[corruptAt] ^= 0xFF;

    auto result = deserializeProject(bytes);
    // Corruption of a single chunk's CRC must be caught and skipped, not
    // crash the whole load (brief §35 "project corruption detection").
    CHECK(!result.fatal);
    CHECK(result.project != nullptr);
}
