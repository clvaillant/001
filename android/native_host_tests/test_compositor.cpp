#include "test_framework.h"
#include "../app/src/main/cpp/engine/document/project.h"

using namespace unflatten;

namespace {
std::unique_ptr<Layer> makeSolidLayer(LayerId id, Rect bounds, RGBA8 color, int32_t depth) {
    auto layer = std::make_unique<Layer>();
    layer->id = id;
    layer->name = "solid";
    layer->depthIndex = depth;
    PixelBuffer buf(bounds.w, bounds.h);
    buf.fill(color);
    layer->rgba = TiledImage::fromDenseBuffer(buf, bounds.x, bounds.y);
    layer->provenance = ProvenanceMap(bounds.w, bounds.h, Provenance::Observed);
    return layer;
}
} // namespace

TEST_CASE(Project_CompositeAll_RespectsDepthOrder) {
    Project project;
    project.sourceObservation.canvasBounds = Rect{0, 0, 10, 10};
    project.sourceImage = PixelBuffer(10, 10);

    LayerId back{1, 1}, front{2, 2};
    project.addLayer(makeSolidLayer(back, Rect{0, 0, 10, 10}, RGBA8{255, 0, 0, 255}, 0));
    project.addLayer(makeSolidLayer(front, Rect{2, 2, 4, 4}, RGBA8{0, 255, 0, 255}, 1));

    PixelBuffer composite = project.compositeAll();
    CHECK_EQ(composite.at(0, 0).r, 255); // only back layer here
    CHECK_EQ(composite.at(3, 3).g, 255); // front layer covers this pixel
}

TEST_CASE(Project_CompositeAll_HiddenLayerIsExcluded) {
    Project project;
    project.sourceObservation.canvasBounds = Rect{0, 0, 5, 5};
    project.sourceImage = PixelBuffer(5, 5);

    LayerId id{3, 3};
    auto layer = makeSolidLayer(id, Rect{0, 0, 5, 5}, RGBA8{10, 20, 30, 255}, 0);
    layer->visible = false;
    project.addLayer(std::move(layer));

    PixelBuffer composite = project.compositeAll();
    CHECK_EQ(composite.at(2, 2).a, 0);
}

TEST_CASE(Project_CompositeAll_OpacityIsApplied) {
    Project project;
    project.sourceObservation.canvasBounds = Rect{0, 0, 4, 4};
    project.sourceImage = PixelBuffer(4, 4);

    LayerId bg{4, 4}, fg{5, 5};
    project.addLayer(makeSolidLayer(bg, Rect{0, 0, 4, 4}, RGBA8{0, 0, 0, 255}, 0));
    auto fgLayer = makeSolidLayer(fg, Rect{0, 0, 4, 4}, RGBA8{255, 255, 255, 255}, 1);
    fgLayer->opacity = 0.5f;
    project.addLayer(std::move(fgLayer));

    PixelBuffer composite = project.compositeAll();
    CHECK(composite.at(1, 1).r > 100 && composite.at(1, 1).r < 155);
}

TEST_CASE(OcclusionGraph_DetectsCycle) {
    OcclusionGraph g;
    LayerId a{1, 0}, b{2, 0}, c{3, 0};
    g.addEdge(a, b, 1.0f);
    g.addEdge(b, c, 1.0f);
    CHECK(!g.hasCycle());
    g.addEdge(c, a, 1.0f);
    CHECK(g.hasCycle());
}

TEST_CASE(OcclusionGraph_TopologicalOrder_OccludedDrawsFirst) {
    OcclusionGraph g;
    LayerId chair{1, 0}, person{2, 0};
    g.addEdge(person, chair, 1.0f); // person occludes chair
    auto order = g.topologicalDrawOrder({chair, person});
    CHECK(order.has_value());
    // chair (occluded) must be drawn before person (occluder) for
    // back-to-front compositing to look correct.
    CHECK(order->at(0) == chair);
    CHECK(order->at(1) == person);
}
