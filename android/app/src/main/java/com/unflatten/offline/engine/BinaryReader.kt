package com.unflatten.offline.engine

import java.nio.charset.StandardCharsets

/**
 * Little-endian binary reader mirroring engine/io/byte_io.h's ByteWriter
 * exactly (u8/u16/u32/u64/i32/f32/length-prefixed str), used to decode the
 * layer-metadata wire format produced by
 * jni_bridge.cpp's encodeLayersMeta(). Kept dependency-free (no protobuf/
 * JSON) on purpose: it's a small, fixed, internal wire format between two
 * halves of the same app, not a public API surface.
 */
class BinaryReader(private val data: ByteArray) {
    private var pos = 0

    fun u8(): Int {
        val v = data[pos].toInt() and 0xFF
        pos += 1
        return v
    }
    fun u16(): Int {
        val lo = u8(); val hi = u8()
        return lo or (hi shl 8)
    }
    fun u32(): Long {
        val lo = u16().toLong(); val hi = u16().toLong()
        return lo or (hi shl 16)
    }
    fun u64(): Long {
        val lo = u32(); val hi = u32()
        return lo or (hi shl 32)
    }
    fun i32(): Int = u32().toInt()
    fun f32(): Float = Float.fromBits(u32().toInt())
    fun str(): String {
        val len = u32().toInt()
        val bytes = data.copyOfRange(pos, pos + len)
        pos += len
        return String(bytes, StandardCharsets.UTF_8)
    }

    fun hasRemaining(): Boolean = pos < data.size
}

fun parseLayersMeta(bytes: ByteArray): List<LayerInfo> {
    if (bytes.isEmpty()) return emptyList()
    val r = BinaryReader(bytes)
    val count = r.u32().toInt()
    return (0 until count).map {
        val idHi = r.u64(); val idLo = r.u64()
        val type = LayerType.fromInt(r.u8())
        val visible = r.u8() != 0
        val locked = r.u8() != 0
        val opacity = r.f32()
        val blend = BlendMode.fromInt(r.u8())
        val depthIndex = r.i32()
        val bx = r.i32(); val by = r.i32(); val bw = r.i32(); val bh = r.i32()
        val name = r.str()
        val genPass = r.str()
        val inferredFraction = r.f32()
        LayerInfo(
            id = LayerId(idHi, idLo), type = type, visible = visible, locked = locked,
            opacity = opacity, blendMode = blend, depthIndex = depthIndex,
            boundsX = bx, boundsY = by, boundsW = bw, boundsH = bh,
            name = name, generationPass = genPass, inferredOrManualFraction = inferredFraction,
        )
    }
}
