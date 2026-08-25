package com.unflatten.offline.engine

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.io.ByteArrayOutputStream

/**
 * Pure-JVM tests for the little-endian wire format shared with
 * engine/io/byte_io.h's ByteWriter and jni_bridge.cpp's encodeLayersMeta.
 * These need no Android framework and no native library, so they run under
 * plain JUnit (not Robolectric) -- this is the fastest, most direct test of
 * this specific format-compatibility contract available in this build
 * environment (no device to run an end-to-end JNI round trip on).
 */
class BinaryReaderTest {

    private fun writeU32LE(out: ByteArrayOutputStream, v: Long) {
        out.write((v and 0xFF).toInt())
        out.write(((v shr 8) and 0xFF).toInt())
        out.write(((v shr 16) and 0xFF).toInt())
        out.write(((v shr 24) and 0xFF).toInt())
    }

    private fun writeU64LE(out: ByteArrayOutputStream, v: Long) {
        writeU32LE(out, v and 0xFFFFFFFFL)
        writeU32LE(out, (v ushr 32) and 0xFFFFFFFFL)
    }

    private fun writeStr(out: ByteArrayOutputStream, s: String) {
        val bytes = s.toByteArray(Charsets.UTF_8)
        writeU32LE(out, bytes.size.toLong())
        out.write(bytes)
    }

    @Test
    fun readsU8AndU16Correctly() {
        val bytes = byteArrayOf(0x42, 0x01, 0x02)
        val r = BinaryReader(bytes)
        assertThat(r.u8()).isEqualTo(0x42)
        assertThat(r.u16()).isEqualTo(0x0201)
    }

    @Test
    fun readsU64AcrossBoundary() {
        val out = ByteArrayOutputStream()
        writeU64LE(out, 0x1122334455667788L)
        val r = BinaryReader(out.toByteArray())
        assertThat(r.u64()).isEqualTo(0x1122334455667788L)
    }

    @Test
    fun readsLengthPrefixedString() {
        val out = ByteArrayOutputStream()
        writeStr(out, "hello unflatten")
        val r = BinaryReader(out.toByteArray())
        assertThat(r.str()).isEqualTo("hello unflatten")
    }

    @Test
    fun readsF32Correctly() {
        val bits = java.lang.Float.floatToIntBits(0.75f)
        val out = ByteArrayOutputStream()
        writeU32LE(out, bits.toLong() and 0xFFFFFFFFL)
        val r = BinaryReader(out.toByteArray())
        assertThat(r.f32()).isEqualTo(0.75f)
    }

    @Test
    fun parseLayersMeta_decodesOneLayerMatchingCppEncodeLayersMeta() {
        val out = ByteArrayOutputStream()
        writeU32LE(out, 1) // layer count
        writeU64LE(out, 0x1L) // idHi
        writeU64LE(out, 0x2L) // idLo
        out.write(1) // type = OBJECT
        out.write(1) // visible = true
        out.write(0) // locked = false
        writeU32LE(out, java.lang.Float.floatToIntBits(0.9f).toLong() and 0xFFFFFFFFL) // opacity
        out.write(0) // blendMode = NORMAL
        writeU32LE(out, 3) // depthIndex
        writeU32LE(out, 10) // boundsX
        writeU32LE(out, 20) // boundsY
        writeU32LE(out, 30) // boundsW
        writeU32LE(out, 40) // boundsH
        writeStr(out, "My Layer")
        writeStr(out, "FALLBACK_HEURISTIC_SEGMENTATION_V1")
        writeU32LE(out, java.lang.Float.floatToIntBits(0.5f).toLong() and 0xFFFFFFFFL) // inferredFraction

        val layers = parseLayersMeta(out.toByteArray())
        assertThat(layers).hasSize(1)
        val l = layers[0]
        assertThat(l.id).isEqualTo(LayerId(1, 2))
        assertThat(l.type).isEqualTo(LayerType.OBJECT)
        assertThat(l.visible).isTrue()
        assertThat(l.opacity).isEqualTo(0.9f)
        assertThat(l.blendMode).isEqualTo(BlendMode.NORMAL)
        assertThat(l.depthIndex).isEqualTo(3)
        assertThat(l.boundsX).isEqualTo(10)
        assertThat(l.name).isEqualTo("My Layer")
        assertThat(l.generationPass).isEqualTo("FALLBACK_HEURISTIC_SEGMENTATION_V1")
    }

    @Test
    fun parseLayersMeta_emptyBytes_returnsEmptyList() {
        assertThat(parseLayersMeta(ByteArray(0))).isEmpty()
    }
}
