package com.unflatten.offline.engine

/**
 * Kotlin mirrors of the native enums in engine/common/types.h. Ordinal
 * order MUST match the C++ enum declaration order exactly -- these are
 * marshaled across JNI as raw integers, not by name. If you add a value on
 * either side, add it in the same position on both, or better: add it only
 * at the end.
 */

enum class Provenance { OBSERVED, MODEL_INFERRED, FALLBACK_HEURISTIC, MANUAL;
    companion object { fun fromInt(v: Int) = entries[v] }
}

enum class BlendMode { NORMAL, MULTIPLY, SCREEN, DARKEN, LIGHTEN;
    companion object { fun fromInt(v: Int) = entries[v] }
}

enum class LayerType { BACKGROUND, OBJECT, SHADOW, REFLECTION, TRANSPARENT_EFFECT, TEXT;
    companion object { fun fromInt(v: Int) = entries[v] }
}

enum class PipelineStage {
    INGEST, NORMALIZE, DOMAIN_CLASSIFY, PYRAMID, INVENTORY,
    MODAL_SEGMENT, TEXT_DETECT, LAYER_DEPTH, OCCLUSION_GRAPH, PEEL,
    REFINE_VISIBLE_MASK, PREDICT_AMODAL_MASK, COMPLETE_OBJECT_APPEARANCE,
    ASSOCIATE_SHADOWS_EFFECTS, QUALITY_CHECK, BACKGROUND_COMPLETE,
    REINVENTORY, RECOMPOSE, GLOBAL_QC, EDIT, DONE, FAILED;
    companion object { fun fromInt(v: Int) = if (v in entries.indices) entries[v] else FAILED }
}

/** Mirrors engine/document/layer.h's LayerId (two u64 halves). */
data class LayerId(val hi: Long, val lo: Long)

data class LayerInfo(
    val id: LayerId,
    val type: LayerType,
    val visible: Boolean,
    val locked: Boolean,
    val opacity: Float,
    val blendMode: BlendMode,
    val depthIndex: Int,
    val boundsX: Int,
    val boundsY: Int,
    val boundsW: Int,
    val boundsH: Int,
    val name: String,
    val generationPass: String,
    val inferredOrManualFraction: Float,
)
