package com.unflatten.offline.engine

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Guards the ordinal ordering of the Kotlin enums against the native C++
 * enums in engine/common/types.h. These are marshaled across JNI as raw
 * integers with no name lookup on either side, so a reordering on one side
 * without the other would silently corrupt every layer's type/blend
 * mode/provenance/pipeline stage at runtime -- a class of bug a device
 * test would catch immediately but that this build environment (no
 * device) cannot, so it is pinned here instead.
 */
class EngineTypesTest {

    @Test
    fun provenanceOrdinalsMatchTypesHeader() {
        assertThat(Provenance.OBSERVED.ordinal).isEqualTo(0)
        assertThat(Provenance.MODEL_INFERRED.ordinal).isEqualTo(1)
        assertThat(Provenance.FALLBACK_HEURISTIC.ordinal).isEqualTo(2)
        assertThat(Provenance.MANUAL.ordinal).isEqualTo(3)
    }

    @Test
    fun blendModeOrdinalsMatchTypesHeader() {
        assertThat(BlendMode.NORMAL.ordinal).isEqualTo(0)
        assertThat(BlendMode.MULTIPLY.ordinal).isEqualTo(1)
        assertThat(BlendMode.SCREEN.ordinal).isEqualTo(2)
        assertThat(BlendMode.DARKEN.ordinal).isEqualTo(3)
        assertThat(BlendMode.LIGHTEN.ordinal).isEqualTo(4)
    }

    @Test
    fun layerTypeOrdinalsMatchTypesHeader() {
        assertThat(LayerType.BACKGROUND.ordinal).isEqualTo(0)
        assertThat(LayerType.OBJECT.ordinal).isEqualTo(1)
        assertThat(LayerType.SHADOW.ordinal).isEqualTo(2)
        assertThat(LayerType.REFLECTION.ordinal).isEqualTo(3)
        assertThat(LayerType.TRANSPARENT_EFFECT.ordinal).isEqualTo(4)
        assertThat(LayerType.TEXT.ordinal).isEqualTo(5)
    }

    @Test
    fun pipelineStageOrdinalsMatchTypesHeader() {
        val expectedOrder = listOf(
            PipelineStage.INGEST, PipelineStage.NORMALIZE, PipelineStage.DOMAIN_CLASSIFY,
            PipelineStage.PYRAMID, PipelineStage.INVENTORY, PipelineStage.MODAL_SEGMENT,
            PipelineStage.TEXT_DETECT, PipelineStage.LAYER_DEPTH, PipelineStage.OCCLUSION_GRAPH,
            PipelineStage.PEEL, PipelineStage.REFINE_VISIBLE_MASK, PipelineStage.PREDICT_AMODAL_MASK,
            PipelineStage.COMPLETE_OBJECT_APPEARANCE, PipelineStage.ASSOCIATE_SHADOWS_EFFECTS,
            PipelineStage.QUALITY_CHECK, PipelineStage.BACKGROUND_COMPLETE, PipelineStage.REINVENTORY,
            PipelineStage.RECOMPOSE, PipelineStage.GLOBAL_QC, PipelineStage.EDIT,
            PipelineStage.DONE, PipelineStage.FAILED,
        )
        expectedOrder.forEachIndexed { index, stage -> assertThat(stage.ordinal).isEqualTo(index) }
        assertThat(PipelineStage.entries).hasSize(22)
    }

    @Test
    fun pipelineStageFromInt_outOfRange_fallsBackToFailedNotCrash() {
        assertThat(PipelineStage.fromInt(999)).isEqualTo(PipelineStage.FAILED)
        assertThat(PipelineStage.fromInt(-1)).isEqualTo(PipelineStage.FAILED)
    }
}
