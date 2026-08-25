#include "test_framework.h"
#include "../app/src/main/cpp/engine/api.h"

using namespace unflatten;

namespace {
PixelBuffer syntheticPhoto() {
    PixelBuffer img(80, 80);
    img.fill(RGBA8{230, 230, 235, 255}); // near-white background
    for (int32_t y = 20; y < 60; ++y)
        for (int32_t x = 20; x < 60; ++x)
            img.at(x, y) = RGBA8{30, 60, 180, 255}; // blue foreground square
    return img;
}
} // namespace

TEST_CASE(ApiPipeline_FallbackDecomposition_ProducesObjectAndBackgroundLayers) {
    auto project = api::createProjectFromImage(syntheticPhoto(), "uuid-a");
    CHECK(project->pipelineStage == PipelineStage::Ingest);

    api::runFallbackDecomposition(*project);

    CHECK(project->pipelineStage == PipelineStage::Edit);
    CHECK(project->lastFailureReason.empty());
    CHECK_EQ(project->layers.size(), static_cast<size_t>(2));

    bool hasObject = false, hasBackground = false;
    for (auto& l : project->layers) {
        if (l->type == LayerType::Object) hasObject = true;
        if (l->type == LayerType::Background) hasBackground = true;
    }
    CHECK(hasObject);
    CHECK(hasBackground);
    CHECK(!project->stageNotes.empty());
}

TEST_CASE(ApiPipeline_CycleConsistency_ObservedRegionErrorIsNearZero) {
    auto project = api::createProjectFromImage(syntheticPhoto(), "uuid-b");
    api::runFallbackDecomposition(*project);
    double err = api::observedRegionReconstructionError(*project);
    CHECK(err >= 0.0);
    // The fallback pipeline never resynthesizes a VISIBLE observed pixel
    // (inpainted background stays hidden under the object layer at import
    // time) -- see api.cpp comments. A large error here would indicate a
    // compositing/offset regression, not "acceptable generative deviation".
    CHECK(err < 0.5);
}

TEST_CASE(ApiPipeline_UniformImage_FailsCleanlyWithoutFabricatingLayers) {
    PixelBuffer flat(40, 40);
    flat.fill(RGBA8{128, 128, 128, 255});
    auto project = api::createProjectFromImage(flat, "uuid-c");
    api::runFallbackDecomposition(*project);

    CHECK(project->pipelineStage == PipelineStage::Failed);
    CHECK(!project->lastFailureReason.empty());
    CHECK_EQ(project->layers.size(), static_cast<size_t>(0));
}
