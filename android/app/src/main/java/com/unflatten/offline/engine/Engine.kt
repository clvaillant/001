package com.unflatten.offline.engine

import android.graphics.Bitmap
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.UUID

/** Buffer kind for [Engine.layerBuffer] / [Engine.exportLayerPng], matching jni_bridge.cpp. */
enum class LayerBufferKind(val nativeValue: Int) { RGBA(0), VISIBLE_MASK(1), AMODAL_MASK(2), PROVENANCE_OVERLAY(3) }

/**
 * Kotlin-idiomatic wrapper around [NativeEngine]. Owns one native project
 * handle for its lifetime; callers MUST call [close] (or use [use]) to free
 * the native session. All pixel marshaling (RGBA ByteArray <-> Bitmap) and
 * LayerId <-> (hi, lo) plumbing lives here so the rest of the app never
 * touches raw JNI signatures.
 */
class Engine private constructor(var handle: Long) : AutoCloseable {

    companion object {
        fun create(bitmap: Bitmap): Engine {
            val rgba = bitmapToRgbaBytes(bitmap)
            val handle = NativeEngine.nativeCreateProject(rgba, bitmap.width, bitmap.height, UUID.randomUUID().toString())
            return Engine(handle)
        }

        /** Returns null and [NativeEngine.nativeGetLastLoadMessage] describes why on failure. */
        fun load(bytes: ByteArray): Engine? {
            val handle = NativeEngine.nativeLoadProject(bytes)
            return if (handle < 0) null else Engine(handle)
        }

        fun bitmapToRgbaBytes(bitmap: Bitmap): ByteArray {
            val argb = IntArray(bitmap.width * bitmap.height)
            bitmap.getPixels(argb, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
            val out = ByteArray(argb.size * 4)
            var o = 0
            for (px in argb) {
                val a = (px ushr 24) and 0xFF
                val r = (px ushr 16) and 0xFF
                val g = (px ushr 8) and 0xFF
                val b = px and 0xFF
                out[o++] = r.toByte(); out[o++] = g.toByte(); out[o++] = b.toByte(); out[o++] = a.toByte()
            }
            return out
        }

        fun rgbaBytesToBitmap(bytes: ByteArray, width: Int, height: Int): Bitmap {
            val bmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            if (bytes.size < width * height * 4) return bmp
            val argb = IntArray(width * height)
            val buf = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
            for (i in argb.indices) {
                val r = buf.get().toInt() and 0xFF
                val g = buf.get().toInt() and 0xFF
                val b = buf.get().toInt() and 0xFF
                val a = buf.get().toInt() and 0xFF
                argb[i] = (a shl 24) or (r shl 16) or (g shl 8) or b
            }
            bmp.setPixels(argb, 0, width, 0, 0, width, height)
            return bmp
        }
    }

    fun runFallbackDecomposition(): Boolean = NativeEngine.nativeRunFallbackDecomposition(handle)

    fun layers(): List<LayerInfo> = parseLayersMeta(NativeEngine.nativeGetLayersMeta(handle))
    fun pipelineStage(): PipelineStage = PipelineStage.fromInt(NativeEngine.nativeGetPipelineStage(handle))
    fun stageNotes(): List<String> = NativeEngine.nativeGetStageNotes(handle).split("\n").filter { it.isNotBlank() }
    fun lastFailureReason(): String = NativeEngine.nativeGetLastFailureReason(handle)
    fun qcError(): Double = NativeEngine.nativeGetQcError(handle)
    fun canvasSize(): Pair<Int, Int> {
        val wh = NativeEngine.nativeGetCanvasSize(handle)
        return (if (wh.size >= 2) wh[0] else 0) to (if (wh.size >= 2) wh[1] else 0)
    }

    fun compositeBitmap(): Bitmap {
        val (w, h) = canvasSize()
        return rgbaBytesToBitmap(NativeEngine.nativeGetCompositeRgba(handle), w, h)
    }

    fun sourceBitmap(): Bitmap {
        val (w, h) = canvasSize()
        return rgbaBytesToBitmap(NativeEngine.nativeGetSourceRgba(handle), w, h)
    }

    fun layerBounds(id: LayerId): IntArray = NativeEngine.nativeGetLayerBounds(handle, id.hi, id.lo)

    fun layerBitmap(id: LayerId, kind: LayerBufferKind): Bitmap {
        val bounds = layerBounds(id)
        val w = bounds.getOrElse(2) { 0 }
        val h = bounds.getOrElse(3) { 0 }
        return rgbaBytesToBitmap(NativeEngine.nativeGetLayerBuffer(handle, id.hi, id.lo, kind.nativeValue), w, h)
    }

    fun setVisible(id: LayerId, visible: Boolean) = NativeEngine.nativeSetLayerVisible(handle, id.hi, id.lo, visible)
    fun setOpacity(id: LayerId, opacity: Float) = NativeEngine.nativeSetLayerOpacity(handle, id.hi, id.lo, opacity)
    fun setBlendMode(id: LayerId, mode: BlendMode) = NativeEngine.nativeSetLayerBlendMode(handle, id.hi, id.lo, mode.ordinal)
    fun rename(id: LayerId, name: String) = NativeEngine.nativeRenameLayer(handle, id.hi, id.lo, name)
    fun move(id: LayerId, newIndex: Int) = NativeEngine.nativeMoveLayer(handle, id.hi, id.lo, newIndex)
    fun delete(id: LayerId) = NativeEngine.nativeDeleteLayer(handle, id.hi, id.lo)

    fun maskBrushStroke(id: LayerId, x0: Float, y0: Float, x1: Float, y1: Float, radius: Float, add: Boolean) =
        NativeEngine.nativeMaskBrushStroke(handle, id.hi, id.lo, x0, y0, x1, y1, radius, add)

    fun mergeLayers(ids: List<LayerId>, name: String): LayerId? {
        val parts = LongArray(ids.size * 2)
        ids.forEachIndexed { i, id -> parts[i * 2] = id.hi; parts[i * 2 + 1] = id.lo }
        val result = NativeEngine.nativeMergeLayers(handle, parts, name)
        return if (result.size >= 2 && (result[0] != 0L || result[1] != 0L)) LayerId(result[0], result[1]) else null
    }

    fun splitLayer(id: LayerId): List<LayerId> {
        val flat = NativeEngine.nativeSplitLayer(handle, id.hi, id.lo)
        return (flat.indices step 2).map { LayerId(flat[it], flat[it + 1]) }
    }

    fun undo() = NativeEngine.nativeUndo(handle)
    fun redo() = NativeEngine.nativeRedo(handle)
    fun restoreOriginal() = NativeEngine.nativeRestoreOriginal(handle)
    fun regenerateBackground() = NativeEngine.nativeRegenerateBackground(handle)

    fun saveProjectBytes(): ByteArray = NativeEngine.nativeSaveProject(handle)
    fun exportCompositePng(): ByteArray = NativeEngine.nativeExportCompositePng(handle)
    fun exportSourcePng(): ByteArray = NativeEngine.nativeExportSourcePng(handle)
    fun exportLayerPng(id: LayerId, kind: LayerBufferKind): ByteArray =
        NativeEngine.nativeExportLayerPng(handle, id.hi, id.lo, kind.nativeValue)
    fun exportPsd(): ByteArray = NativeEngine.nativeExportPsd(handle)

    override fun close() {
        if (handle >= 0) {
            NativeEngine.nativeReleaseProject(handle)
            handle = -1
        }
    }
}
