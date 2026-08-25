#include "types.h"

namespace unflatten {

const char* provenanceName(Provenance p) {
    switch (p) {
        case Provenance::Observed: return "OBSERVED";
        case Provenance::ModelInferred: return "MODEL_INFERRED";
        case Provenance::FallbackHeuristic: return "FALLBACK_HEURISTIC";
        case Provenance::Manual: return "MANUAL";
    }
    return "UNKNOWN";
}

const char* blendModeName(BlendMode b) {
    switch (b) {
        case BlendMode::Normal: return "NORMAL";
        case BlendMode::Multiply: return "MULTIPLY";
        case BlendMode::Screen: return "SCREEN";
        case BlendMode::Darken: return "DARKEN";
        case BlendMode::Lighten: return "LIGHTEN";
    }
    return "UNKNOWN";
}

const char* layerTypeName(LayerType t) {
    switch (t) {
        case LayerType::Background: return "BACKGROUND";
        case LayerType::Object: return "OBJECT";
        case LayerType::Shadow: return "SHADOW";
        case LayerType::Reflection: return "REFLECTION";
        case LayerType::TransparentEffect: return "TRANSPARENT_EFFECT";
        case LayerType::Text: return "TEXT";
    }
    return "UNKNOWN";
}

const char* pipelineStageName(PipelineStage s) {
    switch (s) {
        case PipelineStage::Ingest: return "INGEST";
        case PipelineStage::Normalize: return "NORMALIZE";
        case PipelineStage::DomainClassify: return "DOMAIN_CLASSIFY";
        case PipelineStage::Pyramid: return "PYRAMID";
        case PipelineStage::Inventory: return "INVENTORY";
        case PipelineStage::ModalSegment: return "MODAL_SEGMENT";
        case PipelineStage::TextDetect: return "TEXT_DETECT";
        case PipelineStage::LayerDepth: return "LAYER_DEPTH";
        case PipelineStage::OcclusionGraph: return "OCCLUSION_GRAPH";
        case PipelineStage::Peel: return "PEEL";
        case PipelineStage::RefineVisibleMask: return "REFINE_VISIBLE_MASK";
        case PipelineStage::PredictAmodalMask: return "PREDICT_AMODAL_MASK";
        case PipelineStage::CompleteObjectAppearance: return "COMPLETE_OBJECT_APPEARANCE";
        case PipelineStage::AssociateShadowsEffects: return "ASSOCIATE_SHADOWS_EFFECTS";
        case PipelineStage::QualityCheck: return "QUALITY_CHECK";
        case PipelineStage::BackgroundComplete: return "BACKGROUND_COMPLETE";
        case PipelineStage::Reinventory: return "REINVENTORY";
        case PipelineStage::Recompose: return "RECOMPOSE";
        case PipelineStage::GlobalQC: return "GLOBAL_QC";
        case PipelineStage::Edit: return "EDIT";
        case PipelineStage::Done: return "DONE";
        case PipelineStage::Failed: return "FAILED";
    }
    return "UNKNOWN";
}

} // namespace unflatten
