package com.unflatten.offline.engine

/**
 * Thin JNI declarations for the native engine (`libunflatten_engine.so`,
 * built from app/src/main/cpp/). Every function here is a direct mirror of
 * one `JNIEXPORT` in jni/jni_bridge.cpp -- no logic lives on this object
 * beyond loading the library. See [com.unflatten.offline.engine.Engine] for
 * the Kotlin-friendly wrapper application code actually calls.
 *
 * All functions are `@JvmStatic` so they compile to true static methods,
 * matching the `jclass`-receiver JNIEXPORT signatures on the C++ side.
 */
object NativeEngine {
    init {
        System.loadLibrary("unflatten_engine")
    }

    @JvmStatic external fun nativeCreateProject(rgba: ByteArray, width: Int, height: Int, uuid: String): Long
    @JvmStatic external fun nativeReleaseProject(handle: Long)
    @JvmStatic external fun nativeRunFallbackDecomposition(handle: Long): Boolean

    @JvmStatic external fun nativeGetLayersMeta(handle: Long): ByteArray
    @JvmStatic external fun nativeGetPipelineStage(handle: Long): Int
    @JvmStatic external fun nativeGetStageNotes(handle: Long): String
    @JvmStatic external fun nativeGetLastFailureReason(handle: Long): String
    @JvmStatic external fun nativeGetQcError(handle: Long): Double
    @JvmStatic external fun nativeGetCanvasSize(handle: Long): IntArray

    @JvmStatic external fun nativeGetCompositeRgba(handle: Long): ByteArray
    @JvmStatic external fun nativeGetSourceRgba(handle: Long): ByteArray
    @JvmStatic external fun nativeGetLayerBuffer(handle: Long, idHi: Long, idLo: Long, kind: Int): ByteArray
    @JvmStatic external fun nativeGetLayerBounds(handle: Long, idHi: Long, idLo: Long): IntArray

    @JvmStatic external fun nativeSetLayerVisible(handle: Long, idHi: Long, idLo: Long, visible: Boolean): Boolean
    @JvmStatic external fun nativeSetLayerOpacity(handle: Long, idHi: Long, idLo: Long, opacity: Float): Boolean
    @JvmStatic external fun nativeSetLayerBlendMode(handle: Long, idHi: Long, idLo: Long, mode: Int): Boolean
    @JvmStatic external fun nativeRenameLayer(handle: Long, idHi: Long, idLo: Long, name: String): Boolean
    @JvmStatic external fun nativeMoveLayer(handle: Long, idHi: Long, idLo: Long, newIndex: Int): Boolean
    @JvmStatic external fun nativeDeleteLayer(handle: Long, idHi: Long, idLo: Long): Boolean
    @JvmStatic external fun nativeMaskBrushStroke(
        handle: Long, idHi: Long, idLo: Long,
        x0: Float, y0: Float, x1: Float, y1: Float, radius: Float, add: Boolean
    ): Boolean
    @JvmStatic external fun nativeMergeLayers(handle: Long, idParts: LongArray, name: String): LongArray
    @JvmStatic external fun nativeSplitLayer(handle: Long, idHi: Long, idLo: Long): LongArray

    @JvmStatic external fun nativeUndo(handle: Long): Boolean
    @JvmStatic external fun nativeRedo(handle: Long): Boolean
    @JvmStatic external fun nativeRestoreOriginal(handle: Long)
    @JvmStatic external fun nativeRegenerateBackground(handle: Long): Boolean

    @JvmStatic external fun nativeSaveProject(handle: Long): ByteArray
    @JvmStatic external fun nativeLoadProject(bytes: ByteArray): Long
    @JvmStatic external fun nativeGetLastLoadMessage(): String

    @JvmStatic external fun nativeExportCompositePng(handle: Long): ByteArray
    @JvmStatic external fun nativeExportSourcePng(handle: Long): ByteArray
    @JvmStatic external fun nativeExportLayerPng(handle: Long, idHi: Long, idLo: Long, kind: Int): ByteArray
    @JvmStatic external fun nativeExportPsd(handle: Long): ByteArray
}
