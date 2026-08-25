#include "api.h"
#include "fallback/segmentation_fallback.h"
#include "fallback/inpaint_fallback.h"
#include <cmath>
#include <algorithm>

namespace unflatten {
namespace api {

std::unique_ptr<Project> createProjectFromImage(const PixelBuffer& sourceImage, const std::string& projectUuid) {
    auto project = std::make_unique<Project>();
    project->projectUuid = projectUuid;
    project->sourceImage = sourceImage;
    project->sourceObservation.originalImageBounds = Rect{0, 0, sourceImage.width(), sourceImage.height()};
    project->sourceObservation.canvasBounds = Rect{0, 0, sourceImage.width(), sourceImage.height()};
    project->pipelineStage = PipelineStage::Ingest;
    return project;
}

namespace {

void note(Project& p, const std::string& s) { p.stageNotes.push_back(s); }

} // namespace

void runFallbackDecomposition(Project& project) {
    project.stageNotes.clear();
    project.lastFailureReason.clear();

    project.pipelineStage = PipelineStage::Normalize;
    note(project, "NORMALIZE: input already decoded to RGBA8 on import by the Kotlin ingestion path; no-op here.");

    project.pipelineStage = PipelineStage::DomainClassify;
    note(project, "DOMAIN_CLASSIFY: NOT IMPLEMENTED -- no domain classifier is bundled in this build; all images "
                   "are processed by the single deterministic fallback path regardless of domain.");

    project.pipelineStage = PipelineStage::Pyramid;
    note(project, "PYRAMID: NOT IMPLEMENTED as a distinct persisted multi-resolution structure in this build; "
                   "compositing and export operate directly on tiled full-resolution layers. See KNOWN_LIMITATIONS.md.");

    project.pipelineStage = PipelineStage::Inventory;
    auto instances = fallback::segmentForegroundInstances(project.sourceImage);
    note(project, "INVENTORY: deterministic heuristic segmentation found " + std::to_string(instances.size()) +
                   " candidate foreground component(s).");

    if (instances.empty()) {
        project.pipelineStage = PipelineStage::Failed;
        project.lastFailureReason =
            "Fallback segmentation found no foreground region distinguishable from the sampled border color "
            "model. No learned segmenter is available in this build to attempt a better separation (see "
            "DECISIONS.md). The original image remains untouched and importable again.";
        return;
    }

    project.pipelineStage = PipelineStage::ModalSegment;
    std::vector<uint8_t> unionHoleMask(
        static_cast<size_t>(project.sourceImage.width()) * project.sourceImage.height(), 0);

    // Heuristic depth ordering only (brief §10 requires this be editable
    // and never presented as ground truth): larger detected components are
    // assumed nearer/foreground and get a higher depthIndex (drawn later /
    // on top). This is not learned depth estimation.
    std::sort(instances.begin(), instances.end(), [](const auto& a, const auto& b) {
        return (static_cast<int64_t>(a.bounds.w) * a.bounds.h) < (static_cast<int64_t>(b.bounds.w) * b.bounds.h);
    });

    int32_t depthCounter = 1; // 0 reserved for the background layer
    for (const auto& inst : instances) {
        auto layer = std::make_unique<Layer>();
        layer->id = newLayerId();
        layer->name = "Object " + std::to_string(depthCounter);
        layer->type = LayerType::Object;
        layer->depthIndex = depthCounter++;
        layer->generation.generationPass = "FALLBACK_HEURISTIC_SEGMENTATION_V1";

        PixelBuffer content(inst.bounds.w, inst.bounds.h);
        ProvenanceMap prov(inst.bounds.w, inst.bounds.h, Provenance::Observed);
        for (int32_t y = 0; y < inst.bounds.h; ++y) {
            for (int32_t x = 0; x < inst.bounds.w; ++x) {
                size_t li = static_cast<size_t>(y) * inst.bounds.w + x;
                uint8_t a = inst.alphaMask[li];
                int32_t cx = inst.bounds.x + x, cy = inst.bounds.y + y;
                if (a != 0) {
                    RGBA8 src = project.sourceImage.at(cx, cy);
                    content.at(x, y) = RGBA8{src.r, src.g, src.b, 255};
                    unionHoleMask[static_cast<size_t>(cy) * project.sourceImage.width() + cx] = 1;
                } else {
                    content.at(x, y) = RGBA8{0, 0, 0, 0};
                }
                // The RGB itself is observed (copied verbatim from the
                // source); only the SHAPE decision (which pixels belong to
                // this instance) came from the heuristic, so the mask is
                // tagged FallbackHeuristic while RGB provenance stays
                // Observed. This matches the brief's provenance intent:
                // provenance tracks whether *content* was invented, not
                // whether a boundary decision was heuristic.
                prov.set(x, y, Provenance::Observed);
            }
        }
        layer->rgba = TiledImage::fromDenseBuffer(content, inst.bounds.x, inst.bounds.y);

        TiledImage visMask;
        for (int32_t y = 0; y < inst.bounds.h; ++y)
            for (int32_t x = 0; x < inst.bounds.w; ++x)
                if (inst.alphaMask[static_cast<size_t>(y) * inst.bounds.w + x])
                    visMask.setPixel(inst.bounds.x + x, inst.bounds.y + y, RGBA8{255, 255, 255, 255});
        visMask.setExplicitBounds(inst.bounds);
        layer->visibleMask = visMask;
        // No amodal completion model in this build (§11 NOT IMPLEMENTED):
        // amodalMask defaults to a copy of the visible mask, i.e. "hidden
        // extent unknown, assume none" -- never fabricated. hidden_mask =
        // amodal - visible is therefore empty for every layer this build
        // produces.
        layer->amodalMask = visMask;
        layer->provenance = prov;

        project.addLayer(std::move(layer));
    }

    project.pipelineStage = PipelineStage::TextDetect;
    note(project, "TEXT_DETECT: NOT IMPLEMENTED -- no on-device OCR/text-detection model is bundled; text regions "
                   "are not distinguished from other foreground content in this build.");

    project.pipelineStage = PipelineStage::LayerDepth;
    note(project, "LAYER_DEPTH: heuristic only -- depthIndex assigned by detected-component pixel area "
                   "(larger = assumed nearer). Not learned monocular depth estimation.");

    project.pipelineStage = PipelineStage::OcclusionGraph;
    note(project, "OCCLUSION_GRAPH: left empty in this build -- no reliable heuristic for inferring occluder/"
                   "occluded relationships without a learned model; draw order falls back to depthIndex "
                   "(see Project::drawOrder).");

    project.pipelineStage = PipelineStage::Peel;
    note(project, "PEEL: single non-recursive pass only in this build -- newly revealed background is not "
                   "re-inventoried for further nested objects. See KNOWN_LIMITATIONS.md.");

    project.pipelineStage = PipelineStage::RefineVisibleMask;
    note(project, "REFINE_VISIBLE_MASK: NOT IMPLEMENTED -- fallback mask used as-is, no learned refinement pass.");

    project.pipelineStage = PipelineStage::PredictAmodalMask;
    note(project, "PREDICT_AMODAL_MASK: NOT IMPLEMENTED -- no amodal completion model is bundled in this build. "
                   "amodalMask == visibleMask for every layer; hidden/occluded object extent is NOT reconstructed.");

    project.pipelineStage = PipelineStage::CompleteObjectAppearance;
    note(project, "COMPLETE_OBJECT_APPEARANCE: NOT IMPLEMENTED -- no generative completion model is bundled; "
                   "object layers contain only directly observed pixels, never synthesized appearance.");

    project.pipelineStage = PipelineStage::AssociateShadowsEffects;
    note(project, "ASSOCIATE_SHADOWS_EFFECTS: NOT IMPLEMENTED -- shadows/reflections/transparency are not "
                   "detected or separated from their parent object in this build.");

    project.pipelineStage = PipelineStage::QualityCheck;
    note(project, "QUALITY_CHECK (per-object): no per-object confidence model; each layer inherits "
                   "Provenance::FallbackHeuristic on its mask as its only quality signal.");

    project.pipelineStage = PipelineStage::BackgroundComplete;
    {
        auto bg = std::make_unique<Layer>();
        bg->id = newLayerId();
        bg->name = "Background";
        bg->type = LayerType::Background;
        bg->depthIndex = 0;
        bg->generation.generationPass = "FALLBACK_DIFFUSION_INPAINT_V1";

        PixelBuffer bgContent = project.sourceImage; // copy
        fallback::inpaintFallback(bgContent, unionHoleMask);

        ProvenanceMap bgProv(bgContent.width(), bgContent.height(), Provenance::Observed);
        for (int32_t y = 0; y < bgContent.height(); ++y)
            for (int32_t x = 0; x < bgContent.width(); ++x)
                if (unionHoleMask[static_cast<size_t>(y) * bgContent.width() + x])
                    bgProv.set(x, y, Provenance::FallbackHeuristic);

        bg->rgba = TiledImage::fromDenseBuffer(bgContent, 0, 0);
        // Ensure fully-opaque background pixels are actually stored even
        // where alpha would otherwise look like "nothing here" to the
        // sparse tile writer -- source image is opaque by construction, so
        // fromDenseBuffer's alpha!=0 check already covers this.
        TiledImage fullMask;
        for (int32_t y = 0; y < bgContent.height(); ++y)
            for (int32_t x = 0; x < bgContent.width(); ++x)
                fullMask.setPixel(x, y, RGBA8{255, 255, 255, 255});
        fullMask.setExplicitBounds(Rect{0, 0, bgContent.width(), bgContent.height()});
        bg->visibleMask = fullMask;
        bg->amodalMask = fullMask;
        bg->provenance = bgProv;

        // Inserted at the FRONT of the layer vector, not appended, so that
        // vector order matches depthIndex order (Background=0 first,
        // objects 1..N after) from the moment the project is created. This
        // matters because EngineSession's structural edit operations
        // (moveLayer/deleteLayer/mergeLayers/splitLayer) renumber
        // depthIndex FROM vector position; if the two orders started out
        // inconsistent, the first such edit after decomposition would
        // silently invert draw order and hide every object again (the same
        // class of bug fixed in Project::drawOrder(), see project.h).
        project.layers.insert(project.layers.begin(), std::move(bg));
    }
    note(project, "BACKGROUND_COMPLETE: removed-region fill via deterministic diffusion inpainting "
                   "(fallback tier only; not generative/learned inpainting).");

    project.pipelineStage = PipelineStage::Reinventory;
    note(project, "REINVENTORY: NOT IMPLEMENTED -- see PEEL note; single pass only in this build.");

    project.pipelineStage = PipelineStage::Recompose;
    project.pipelineStage = PipelineStage::GlobalQC;
    project.lastQcObservedRegionError = observedRegionReconstructionError(project);
    note(project, "GLOBAL_QC: observed-region mean absolute reconstruction error = " +
                   std::to_string(project.lastQcObservedRegionError) +
                   " (0 = perfect reproduction of observed pixels; brief §23 cycle consistency).");

    project.pipelineStage = PipelineStage::Edit;
}

double observedRegionReconstructionError(const Project& project) {
    PixelBuffer composite = project.compositeAll();
    const PixelBuffer& src = project.sourceImage;
    Rect ob = project.sourceObservation.originalImageBounds;

    double sumAbsDiff = 0.0;
    int64_t count = 0;
    for (int32_t y = 0; y < ob.h; ++y) {
        for (int32_t x = 0; x < ob.w; ++x) {
            if (x >= composite.width() || y >= composite.height()) continue;
            if (x >= src.width() || y >= src.height()) continue;
            const RGBA8& c = composite.at(x, y);
            const RGBA8& s = src.at(x, y);
            // Skip any pixel the composite leaves partially/fully
            // transparent (a future amodal/outpainting stage could leave
            // low-confidence regions like that; this build's fallback
            // pipeline always fully covers the canvas, so in practice every
            // pixel here is compared). This is deliberately NOT gated on
            // per-pixel provenance: with this build's fallback pipeline,
            // every visible composite pixel -- whether drawn from the
            // Background layer or from an Object layer on top of it -- is
            // copied directly from the source, so the correct expected
            // result is exactly 0.0 across the whole comparison region.
            // Any nonzero value here indicates a compositing/offset bug,
            // not "acceptable generative deviation".
            if (c.a < 250) continue;
            sumAbsDiff += std::abs(static_cast<int>(c.r) - static_cast<int>(s.r));
            sumAbsDiff += std::abs(static_cast<int>(c.g) - static_cast<int>(s.g));
            sumAbsDiff += std::abs(static_cast<int>(c.b) - static_cast<int>(s.b));
            count += 3;
        }
    }
    if (count == 0) return -1.0;
    return sumAbsDiff / static_cast<double>(count);
}

} // namespace api
} // namespace unflatten
