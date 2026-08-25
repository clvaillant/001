#pragma once
#include <vector>
#include <memory>
#include <optional>
#include <algorithm>
#include "layer.h"
#include "occlusion_graph.h"

namespace unflatten {

// Records which canvas pixels came from the original imported photograph
// vs. canvas area added later by outpainting growth (brief §16/§50).
struct SourceObservation {
    Rect originalImageBounds{};  // in canvas coordinates
    Rect canvasBounds{};         // full (possibly outpainted) canvas extent
};

// Top-level editable document (brief §26). Owns the immutable source image,
// the ordered layer stack, the occlusion graph, and pipeline state. This
// class is pure C++ with no JNI/Android dependency so it is unit-testable
// on the host (see native_host_tests/).
class Project {
public:
    std::string projectUuid;
    int32_t formatVersion = 1;

    // Immutable source image, exactly as imported (never overwritten),
    // per §50 source-preservation.
    PixelBuffer sourceImage;
    SourceObservation sourceObservation;

    PipelineStage pipelineStage = PipelineStage::Ingest;
    std::string lastFailureReason; // non-empty only when pipelineStage == Failed
    // Human-readable notes recorded per pipeline run, one entry per stage
    // transition, including explicit "NOT IMPLEMENTED, no-op" notes for
    // stages this build doesn't have a real algorithm for yet (brief §47
    // requires this distinction to be visible, not just documented
    // separately). Surfaced in the editor's pipeline/diagnostics view.
    std::vector<std::string> stageNotes;

    // Runtime-computed cycle-consistency QC metric (brief §23, §49); not
    // persisted in the UF7P file, recomputed on demand by
    // api::observedRegionReconstructionError. -1.0 = not yet computed.
    double lastQcObservedRegionError = -1.0;

    std::vector<std::unique_ptr<Layer>> layers; // ownership; order == insertion order
    OcclusionGraph occlusionGraph;

    // --- Layer directory operations -----------------------------------

    Layer* findLayer(const LayerId& id) {
        for (auto& l : layers) {
            if (l->id == id) return l.get();
        }
        return nullptr;
    }

    const Layer* findLayer(const LayerId& id) const {
        for (auto& l : layers) {
            if (l->id == id) return l.get();
        }
        return nullptr;
    }

    Layer& addLayer(std::unique_ptr<Layer> layer) {
        layers.push_back(std::move(layer));
        return *layers.back();
    }

    bool removeLayer(const LayerId& id) {
        auto it = std::find_if(layers.begin(), layers.end(),
                                [&](const std::unique_ptr<Layer>& l) { return l->id == id; });
        if (it == layers.end()) return false;
        occlusionGraph.removeLayer(id);
        layers.erase(it);
        return true;
    }

    // Draw order back-to-front, honoring depthIndex (ascending), refined by
    // the occlusion graph's constraints where they exist. depthIndex order
    // is the BASE ordering fed into the topological sort (not just a
    // fallback tried after it): Kahn's algorithm processes equal-indegree
    // nodes in input order, so when the graph has no edges at all (this
    // build's fallback pipeline never populates one -- see DECISIONS.md),
    // the result is exactly depthIndex order. Only an actual edge can
    // reorder two layers relative to that base. If the graph is cyclic
    // (self-contradictory, §49 "depth cycles"), depthIndex order is used
    // directly since it is always well-defined while the graph is
    // user/heuristic-editable and can transiently contradict itself (§10).
    //
    // IMPORTANT: earlier code called topologicalDrawOrder on layers in
    // plain insertion order and used *that* as the primary result. With an
    // empty graph, Kahn's algorithm trivially "succeeds" and returns its
    // input order verbatim -- so insertion order (not depthIndex) was
    // silently winning whenever the graph had no edges, which is always,
    // in this build. That made every Background layer (inserted last)
    // draw on top of every Object layer regardless of depthIndex, hiding
    // all detected objects. Caught by
    // ApiPipeline_CycleConsistency_ObservedRegionErrorIsNearZero in
    // native_host_tests. Sorting `ids` by depthIndex before the
    // topological pass fixes this for both the empty-graph and the
    // populated-graph cases.
    std::vector<LayerId> drawOrder() const {
        std::vector<LayerId> ids;
        ids.reserve(layers.size());
        for (auto& l : layers) ids.push_back(l->id);
        std::sort(ids.begin(), ids.end(), [&](const LayerId& a, const LayerId& b) {
            return findLayer(a)->depthIndex < findLayer(b)->depthIndex;
        });

        if (auto topo = occlusionGraph.topologicalDrawOrder(ids)) {
            return *topo;
        }
        return ids;
    }

    // Composites all visible layers, back to front, over a transparent
    // canvas of `sourceObservation.canvasBounds` size. This is the function
    // exercised by cycle-consistency QC (§23): compositing only the
    // OBSERVED-region layers and diffing against the source image measures
    // observed-region reconstruction error.
    PixelBuffer compositeAll() const;
};

} // namespace unflatten
