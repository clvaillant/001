#include "test_framework.h"
#include "../app/src/main/cpp/engine/session.h"
#include "../app/src/main/cpp/engine/api.h"

using namespace unflatten;

namespace {
PixelBuffer syntheticPhoto() {
    PixelBuffer img(80, 80);
    img.fill(RGBA8{230, 230, 235, 255});
    for (int32_t y = 20; y < 60; ++y)
        for (int32_t x = 20; x < 60; ++x)
            img.at(x, y) = RGBA8{30, 60, 180, 255};
    return img;
}

std::unique_ptr<EngineSession> makeDecomposedSession() {
    auto project = api::createProjectFromImage(syntheticPhoto(), "uuid-session");
    api::runFallbackDecomposition(*project);
    return std::make_unique<EngineSession>(std::move(project));
}
} // namespace

TEST_CASE(Session_SetVisible_ThenUndo_RestoresVisibility) {
    auto session = makeDecomposedSession();
    LayerId id = session->project().layers[0]->id;
    CHECK(session->project().layers[0]->visible);

    CHECK(session->setLayerVisible(id, false));
    CHECK(!session->project().findLayer(id)->visible);

    CHECK(session->undo());
    CHECK(session->project().findLayer(id)->visible);
}

TEST_CASE(Session_Redo_ReappliesUndoneChange) {
    auto session = makeDecomposedSession();
    LayerId id = session->project().layers[0]->id;
    session->setLayerOpacity(id, 0.3f);
    session->undo();
    CHECK_NEAR(session->project().findLayer(id)->opacity, 1.0, 0.01);
    CHECK(session->redo());
    CHECK_NEAR(session->project().findLayer(id)->opacity, 0.3, 0.01);
}

TEST_CASE(Session_DeleteLayer_RemovesIt) {
    auto session = makeDecomposedSession();
    size_t before = session->project().layers.size();
    LayerId id = session->project().layers[0]->id;
    CHECK(session->deleteLayer(id));
    CHECK_EQ(session->project().layers.size(), before - 1);
    CHECK(session->project().findLayer(id) == nullptr);
}

TEST_CASE(Session_RenameLayer_ChangesName) {
    auto session = makeDecomposedSession();
    LayerId id = session->project().layers[0]->id;
    CHECK(session->renameLayer(id, "My Renamed Layer"));
    CHECK_EQ(session->project().findLayer(id)->name, "My Renamed Layer");
}

TEST_CASE(Session_MergeLayers_ReducesLayerCountByOne) {
    auto session = makeDecomposedSession();
    CHECK_EQ(session->project().layers.size(), static_cast<size_t>(2));
    std::vector<LayerId> ids = {session->project().layers[0]->id, session->project().layers[1]->id};
    auto merged = session->mergeLayers(ids, "Merged");
    CHECK(merged.has_value());
    CHECK_EQ(session->project().layers.size(), static_cast<size_t>(1));
}

TEST_CASE(Session_SplitLayer_OnTwoComponentMask_ProducesTwoLayers) {
    // Build a project with one Object layer whose mask has two disconnected
    // blobs, then verify splitLayer separates them.
    auto project = std::make_unique<Project>();
    project->sourceImage = PixelBuffer(50, 20);
    project->sourceObservation.canvasBounds = Rect{0, 0, 50, 20};

    auto layer = std::make_unique<Layer>();
    layer->id = newLayerId();
    layer->name = "Two Blobs";
    PixelBuffer content(50, 20);
    for (int32_t y = 2; y < 10; ++y)
        for (int32_t x = 2; x < 10; ++x)
            content.at(x, y) = RGBA8{255, 0, 0, 255};
    for (int32_t y = 2; y < 10; ++y)
        for (int32_t x = 40; x < 48; ++x)
            content.at(x, y) = RGBA8{0, 255, 0, 255};
    layer->rgba = TiledImage::fromDenseBuffer(content, 0, 0);
    layer->provenance = ProvenanceMap(50, 20, Provenance::Observed);
    LayerId originalId = layer->id;
    project->addLayer(std::move(layer));

    EngineSession session(std::move(project));
    auto newIds = session.splitLayer(originalId);
    CHECK_EQ(newIds.size(), static_cast<size_t>(2));
    CHECK(session.project().findLayer(originalId) == nullptr);
    CHECK_EQ(session.project().layers.size(), static_cast<size_t>(2));
}

TEST_CASE(Session_RestoreOriginal_DropsAllLayersAndEdits) {
    auto session = makeDecomposedSession();
    CHECK(session->project().layers.size() > 0);
    session->restoreOriginal();
    CHECK_EQ(session->project().layers.size(), static_cast<size_t>(0));
    CHECK(session->project().pipelineStage == PipelineStage::Ingest);
}

TEST_CASE(Session_StructuralEditDoesNotInvertDrawOrder) {
    // Regression test for the bug where EngineSession's renumberDepthIndices
    // (called after any structural edit) reassigns depthIndex from vector
    // POSITION -- if Background wasn't already first in the vector, the
    // first structural edit after decomposition would silently put it back
    // on top of every object. See the fix in api.cpp/session.cpp
    // (inserting Background at the front, not appending).
    auto session = makeDecomposedSession();
    Layer* bg = nullptr;
    for (auto& l : session->project().layers) if (l->type == LayerType::Background) bg = l.get();
    CHECK(bg != nullptr);

    // Trigger renumberDepthIndices via a harmless structural op (rename is
    // NOT structural; use moveLayer to the same position it's already at).
    session->moveLayer(bg->id, 0);

    double errAfter = api::observedRegionReconstructionError(session->project());
    CHECK(errAfter < 0.5); // objects must still be visible on top of the background
}

TEST_CASE(Session_MaskBrushStroke_SubtractClearsPixels) {
    auto session = makeDecomposedSession();
    Layer* objLayer = nullptr;
    for (auto& l : session->project().layers) if (l->type == LayerType::Object) objLayer = l.get();
    CHECK(objLayer != nullptr);
    RGBA8 before = objLayer->rgba.getPixel(30, 30);
    CHECK(before.a > 0);

    session->maskBrushStroke(objLayer->id, 30, 30, 30, 30, 5.0f, /*add=*/false);
    RGBA8 after = session->project().findLayer(objLayer->id)->rgba.getPixel(30, 30);
    CHECK_EQ(after.a, 0);
}
