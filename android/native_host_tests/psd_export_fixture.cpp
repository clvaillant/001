// Standalone fixture generator (not part of the CMake test target) used by
// scripts/validate_psd_with_python.sh to produce a real PSD from the actual
// fallback pipeline for independent third-party validation (psd-tools,
// Pillow) -- see TEST_REPORT.md. Not a unit test itself: it has no
// assertions, it just writes a file.
//
// Build: see scripts/validate_psd_with_python.sh for the exact g++ command.
#include "engine/io/psd_writer.h"
#include "engine/api.h"
#include <fstream>
#include <cstdio>

using namespace unflatten;

int main(int argc, char** argv) {
    if (argc < 2) {
        fprintf(stderr, "usage: %s <output.psd>\n", argv[0]);
        return 1;
    }

    // Two non-overlapping colored rectangles on a near-white background --
    // enough for the fallback segmentation to find two distinct object
    // instances, exercising a real multi-layer PSD (background + 2
    // objects), not a degenerate single-layer case.
    PixelBuffer img(120, 90);
    img.fill(RGBA8{235, 235, 240, 255});
    for (int32_t y = 15; y < 55; ++y)
        for (int32_t x = 20; x < 70; ++x)
            img.at(x, y) = RGBA8{40, 90, 200, 255};
    for (int32_t y = 50; y < 80; ++y)
        for (int32_t x = 80; x < 110; ++x)
            img.at(x, y) = RGBA8{200, 60, 40, 255};

    auto project = api::createProjectFromImage(img, "psd-validation-fixture");
    api::runFallbackDecomposition(*project);
    if (project->pipelineStage == PipelineStage::Failed) {
        fprintf(stderr, "decomposition failed: %s\n", project->lastFailureReason.c_str());
        return 1;
    }

    auto psd = encodePsd(*project);
    std::ofstream out(argv[1], std::ios::binary);
    out.write(reinterpret_cast<const char*>(psd.data()), static_cast<std::streamsize>(psd.size()));
    out.close();

    printf("wrote %zu bytes, %zu layers to %s\n", psd.size(), project->layers.size(), argv[1]);
    for (auto& l : project->layers) {
        printf("  layer: %s (%s)\n", l->name.c_str(), layerTypeName(l->type));
    }
    return 0;
}
