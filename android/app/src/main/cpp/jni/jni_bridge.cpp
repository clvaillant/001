#include <jni.h>
#include <unordered_map>
#include <memory>
#include <mutex>
#include <string>
#include <vector>
#include <cstring>
#include <algorithm>

#include "../engine/session.h"
#include "../engine/api.h"
#include "../engine/io/uf7p_format.h"
#include "../engine/io/png_writer.h"
#include "../engine/io/psd_writer.h"
#include "../engine/io/byte_io.h"

using namespace unflatten;

namespace {

std::mutex g_mutex;
std::unordered_map<jlong, std::unique_ptr<EngineSession>> g_sessions;
jlong g_nextHandle = 1;
thread_local std::string g_lastError;

EngineSession* sessionFor(jlong handle) {
    std::lock_guard<std::mutex> lock(g_mutex);
    auto it = g_sessions.find(handle);
    return it == g_sessions.end() ? nullptr : it->second.get();
}

jlong registerSession(std::unique_ptr<EngineSession> session) {
    std::lock_guard<std::mutex> lock(g_mutex);
    jlong handle = g_nextHandle++;
    g_sessions[handle] = std::move(session);
    return handle;
}

std::string jstringToStd(JNIEnv* env, jstring s) {
    if (!s) return {};
    const char* chars = env->GetStringUTFChars(s, nullptr);
    std::string out(chars);
    env->ReleaseStringUTFChars(s, chars);
    return out;
}

jbyteArray toJByteArray(JNIEnv* env, const std::vector<uint8_t>& data) {
    jbyteArray arr = env->NewByteArray(static_cast<jsize>(data.size()));
    if (!data.empty()) {
        env->SetByteArrayRegion(arr, 0, static_cast<jsize>(data.size()),
                                 reinterpret_cast<const jbyte*>(data.data()));
    }
    return arr;
}

std::vector<uint8_t> fromJByteArray(JNIEnv* env, jbyteArray arr) {
    jsize len = env->GetArrayLength(arr);
    std::vector<uint8_t> out(len);
    if (len > 0) {
        env->GetByteArrayRegion(arr, 0, len, reinterpret_cast<jbyte*>(out.data()));
    }
    return out;
}

PixelBuffer rgbaBytesToPixelBuffer(const std::vector<uint8_t>& bytes, int32_t w, int32_t h) {
    PixelBuffer buf(w, h);
    size_t n = static_cast<size_t>(w) * h * 4;
    if (bytes.size() >= n) {
        std::memcpy(buf.raw().data(), bytes.data(), n);
    }
    return buf;
}

std::vector<uint8_t> pixelBufferToRgbaBytes(const PixelBuffer& buf) {
    std::vector<uint8_t> out(static_cast<size_t>(buf.width()) * buf.height() * 4);
    if (!out.empty()) std::memcpy(out.data(), buf.raw().data(), out.size());
    return out;
}

// Layer metadata wire format (little-endian, mirrors Kotlin's
// engine/BinaryReader.kt): per layer --
// idHi:u64 idLo:u64 type:u8 visible:u8 locked:u8 opacity:f32 blendMode:u8
// depthIndex:i32 boundsX:i32 boundsY:i32 boundsW:i32 boundsH:i32 name:str
// generationPass:str inferredFraction:f32
std::vector<uint8_t> encodeLayersMeta(const Project& project) {
    ByteWriter w;
    w.u32(static_cast<uint32_t>(project.layers.size()));
    for (auto& l : project.layers) {
        w.u64(l->id.hi); w.u64(l->id.lo);
        w.u8(static_cast<uint8_t>(l->type));
        w.u8(l->visible ? 1 : 0);
        w.u8(l->locked ? 1 : 0);
        w.f32(l->opacity);
        w.u8(static_cast<uint8_t>(l->blendMode));
        w.i32(l->depthIndex);
        Rect b = l->rgba.bounds();
        w.i32(b.x); w.i32(b.y); w.i32(b.w); w.i32(b.h);
        w.str(l->name);
        w.str(l->generation.generationPass);
        w.f32(static_cast<float>(l->provenance.inferredOrManualFraction()));
    }
    return w.take();
}

LayerId idFromParts(jlong hi, jlong lo) {
    LayerId id;
    id.hi = static_cast<uint64_t>(hi);
    id.lo = static_cast<uint64_t>(lo);
    return id;
}

} // namespace

extern "C" {

JNIEXPORT jlong JNICALL
Java_com_unflatten_offline_engine_NativeEngine_nativeCreateProject(
        JNIEnv* env, jclass, jbyteArray rgba, jint width, jint height, jstring uuid) {
    auto bytes = fromJByteArray(env, rgba);
    PixelBuffer img = rgbaBytesToPixelBuffer(bytes, width, height);
    auto project = api::createProjectFromImage(img, jstringToStd(env, uuid));
    return registerSession(std::make_unique<EngineSession>(std::move(project)));
}

JNIEXPORT void JNICALL
Java_com_unflatten_offline_engine_NativeEngine_nativeReleaseProject(JNIEnv*, jclass, jlong handle) {
    std::lock_guard<std::mutex> lock(g_mutex);
    g_sessions.erase(handle);
}

JNIEXPORT jboolean JNICALL
Java_com_unflatten_offline_engine_NativeEngine_nativeRunFallbackDecomposition(JNIEnv*, jclass, jlong handle) {
    EngineSession* s = sessionFor(handle);
    if (!s) return JNI_FALSE;
    api::runFallbackDecomposition(s->project());
    return s->project().pipelineStage != PipelineStage::Failed ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jbyteArray JNICALL
Java_com_unflatten_offline_engine_NativeEngine_nativeGetLayersMeta(JNIEnv* env, jclass, jlong handle) {
    EngineSession* s = sessionFor(handle);
    if (!s) return toJByteArray(env, {});
    return toJByteArray(env, encodeLayersMeta(s->project()));
}

JNIEXPORT jint JNICALL
Java_com_unflatten_offline_engine_NativeEngine_nativeGetPipelineStage(JNIEnv*, jclass, jlong handle) {
    EngineSession* s = sessionFor(handle);
    return s ? static_cast<jint>(s->project().pipelineStage) : -1;
}

JNIEXPORT jstring JNICALL
Java_com_unflatten_offline_engine_NativeEngine_nativeGetStageNotes(JNIEnv* env, jclass, jlong handle) {
    EngineSession* s = sessionFor(handle);
    if (!s) return env->NewStringUTF("");
    std::string joined;
    for (auto& n : s->project().stageNotes) { joined += n; joined += "\n"; }
    return env->NewStringUTF(joined.c_str());
}

JNIEXPORT jstring JNICALL
Java_com_unflatten_offline_engine_NativeEngine_nativeGetLastFailureReason(JNIEnv* env, jclass, jlong handle) {
    EngineSession* s = sessionFor(handle);
    return env->NewStringUTF(s ? s->project().lastFailureReason.c_str() : "");
}

JNIEXPORT jdouble JNICALL
Java_com_unflatten_offline_engine_NativeEngine_nativeGetQcError(JNIEnv*, jclass, jlong handle) {
    EngineSession* s = sessionFor(handle);
    return s ? s->project().lastQcObservedRegionError : -1.0;
}

JNIEXPORT jintArray JNICALL
Java_com_unflatten_offline_engine_NativeEngine_nativeGetCanvasSize(JNIEnv* env, jclass, jlong handle) {
    EngineSession* s = sessionFor(handle);
    jintArray arr = env->NewIntArray(2);
    jint vals[2] = {0, 0};
    if (s) {
        Rect cb = s->project().sourceObservation.canvasBounds;
        vals[0] = cb.w; vals[1] = cb.h;
    }
    env->SetIntArrayRegion(arr, 0, 2, vals);
    return arr;
}

JNIEXPORT jbyteArray JNICALL
Java_com_unflatten_offline_engine_NativeEngine_nativeGetCompositeRgba(JNIEnv* env, jclass, jlong handle) {
    EngineSession* s = sessionFor(handle);
    if (!s) return toJByteArray(env, {});
    return toJByteArray(env, pixelBufferToRgbaBytes(s->project().compositeAll()));
}

JNIEXPORT jbyteArray JNICALL
Java_com_unflatten_offline_engine_NativeEngine_nativeGetSourceRgba(JNIEnv* env, jclass, jlong handle) {
    EngineSession* s = sessionFor(handle);
    if (!s) return toJByteArray(env, {});
    return toJByteArray(env, pixelBufferToRgbaBytes(s->project().sourceImage));
}

// kind: 0=rgba, 1=visibleMask, 2=amodalMask, 3=provenance (packed as RGBA
// visualization: Observed=transparent, FallbackHeuristic=yellow,
// ModelInferred=magenta [unused in this build], Manual=cyan)
JNIEXPORT jbyteArray JNICALL
Java_com_unflatten_offline_engine_NativeEngine_nativeGetLayerBuffer(
        JNIEnv* env, jclass, jlong handle, jlong idHi, jlong idLo, jint kind) {
    EngineSession* s = sessionFor(handle);
    if (!s) return toJByteArray(env, {});
    Layer* l = s->project().findLayer(idFromParts(idHi, idLo));
    if (!l) return toJByteArray(env, {});

    if (kind == 3) {
        Rect b = l->rgba.bounds();
        PixelBuffer vis(std::max(b.w, 0), std::max(b.h, 0));
        for (int32_t y = 0; y < b.h; ++y) {
            for (int32_t x = 0; x < b.w; ++x) {
                Provenance p = (x < l->provenance.width() && y < l->provenance.height())
                                   ? l->provenance.at(x, y) : Provenance::Observed;
                switch (p) {
                    case Provenance::Observed: vis.at(x, y) = RGBA8{0, 0, 0, 0}; break;
                    case Provenance::FallbackHeuristic: vis.at(x, y) = RGBA8{230, 200, 20, 160}; break;
                    case Provenance::ModelInferred: vis.at(x, y) = RGBA8{220, 20, 200, 160}; break;
                    case Provenance::Manual: vis.at(x, y) = RGBA8{20, 200, 220, 160}; break;
                }
            }
        }
        return toJByteArray(env, pixelBufferToRgbaBytes(vis));
    }

    const TiledImage& img = kind == 1 ? l->visibleMask : (kind == 2 ? l->amodalMask : l->rgba);
    return toJByteArray(env, pixelBufferToRgbaBytes(img.toDenseBuffer()));
}

JNIEXPORT jintArray JNICALL
Java_com_unflatten_offline_engine_NativeEngine_nativeGetLayerBounds(
        JNIEnv* env, jclass, jlong handle, jlong idHi, jlong idLo) {
    EngineSession* s = sessionFor(handle);
    jintArray arr = env->NewIntArray(4);
    jint vals[4] = {0, 0, 0, 0};
    if (s) {
        Layer* l = s->project().findLayer(idFromParts(idHi, idLo));
        if (l) {
            Rect b = l->rgba.bounds();
            vals[0] = b.x; vals[1] = b.y; vals[2] = b.w; vals[3] = b.h;
        }
    }
    env->SetIntArrayRegion(arr, 0, 4, vals);
    return arr;
}

JNIEXPORT jboolean JNICALL
Java_com_unflatten_offline_engine_NativeEngine_nativeSetLayerVisible(
        JNIEnv*, jclass, jlong handle, jlong idHi, jlong idLo, jboolean visible) {
    EngineSession* s = sessionFor(handle);
    return (s && s->setLayerVisible(idFromParts(idHi, idLo), visible)) ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jboolean JNICALL
Java_com_unflatten_offline_engine_NativeEngine_nativeSetLayerOpacity(
        JNIEnv*, jclass, jlong handle, jlong idHi, jlong idLo, jfloat opacity) {
    EngineSession* s = sessionFor(handle);
    return (s && s->setLayerOpacity(idFromParts(idHi, idLo), opacity)) ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jboolean JNICALL
Java_com_unflatten_offline_engine_NativeEngine_nativeSetLayerBlendMode(
        JNIEnv*, jclass, jlong handle, jlong idHi, jlong idLo, jint mode) {
    EngineSession* s = sessionFor(handle);
    return (s && s->setLayerBlendMode(idFromParts(idHi, idLo), static_cast<BlendMode>(mode))) ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jboolean JNICALL
Java_com_unflatten_offline_engine_NativeEngine_nativeRenameLayer(
        JNIEnv* env, jclass, jlong handle, jlong idHi, jlong idLo, jstring name) {
    EngineSession* s = sessionFor(handle);
    return (s && s->renameLayer(idFromParts(idHi, idLo), jstringToStd(env, name))) ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jboolean JNICALL
Java_com_unflatten_offline_engine_NativeEngine_nativeMoveLayer(
        JNIEnv*, jclass, jlong handle, jlong idHi, jlong idLo, jint newIndex) {
    EngineSession* s = sessionFor(handle);
    return (s && s->moveLayer(idFromParts(idHi, idLo), newIndex)) ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jboolean JNICALL
Java_com_unflatten_offline_engine_NativeEngine_nativeDeleteLayer(
        JNIEnv*, jclass, jlong handle, jlong idHi, jlong idLo) {
    EngineSession* s = sessionFor(handle);
    return (s && s->deleteLayer(idFromParts(idHi, idLo))) ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jboolean JNICALL
Java_com_unflatten_offline_engine_NativeEngine_nativeMaskBrushStroke(
        JNIEnv*, jclass, jlong handle, jlong idHi, jlong idLo,
        jfloat x0, jfloat y0, jfloat x1, jfloat y1, jfloat radius, jboolean add) {
    EngineSession* s = sessionFor(handle);
    return (s && s->maskBrushStroke(idFromParts(idHi, idLo), x0, y0, x1, y1, radius, add)) ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jlongArray JNICALL
Java_com_unflatten_offline_engine_NativeEngine_nativeMergeLayers(
        JNIEnv* env, jclass, jlong handle, jlongArray idParts, jstring name) {
    EngineSession* s = sessionFor(handle);
    jsize n = env->GetArrayLength(idParts);
    std::vector<jlong> parts(n);
    env->GetLongArrayRegion(idParts, 0, n, parts.data());
    std::vector<LayerId> ids;
    for (jsize i = 0; i + 1 < n; i += 2) ids.push_back(idFromParts(parts[i], parts[i + 1]));

    jlongArray result = env->NewLongArray(2);
    if (s) {
        auto newId = s->mergeLayers(ids, jstringToStd(env, name));
        if (newId) {
            jlong out[2] = {static_cast<jlong>(newId->hi), static_cast<jlong>(newId->lo)};
            env->SetLongArrayRegion(result, 0, 2, out);
            return result;
        }
    }
    jlong zero[2] = {0, 0};
    env->SetLongArrayRegion(result, 0, 2, zero);
    return result;
}

JNIEXPORT jlongArray JNICALL
Java_com_unflatten_offline_engine_NativeEngine_nativeSplitLayer(
        JNIEnv* env, jclass, jlong handle, jlong idHi, jlong idLo) {
    EngineSession* s = sessionFor(handle);
    std::vector<LayerId> newIds = s ? s->splitLayer(idFromParts(idHi, idLo)) : std::vector<LayerId>{};
    jlongArray result = env->NewLongArray(static_cast<jsize>(newIds.size() * 2));
    std::vector<jlong> flat;
    flat.reserve(newIds.size() * 2);
    for (auto& id : newIds) { flat.push_back(static_cast<jlong>(id.hi)); flat.push_back(static_cast<jlong>(id.lo)); }
    if (!flat.empty()) env->SetLongArrayRegion(result, 0, static_cast<jsize>(flat.size()), flat.data());
    return result;
}

JNIEXPORT jboolean JNICALL
Java_com_unflatten_offline_engine_NativeEngine_nativeUndo(JNIEnv*, jclass, jlong handle) {
    EngineSession* s = sessionFor(handle);
    return (s && s->undo()) ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jboolean JNICALL
Java_com_unflatten_offline_engine_NativeEngine_nativeRedo(JNIEnv*, jclass, jlong handle) {
    EngineSession* s = sessionFor(handle);
    return (s && s->redo()) ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT void JNICALL
Java_com_unflatten_offline_engine_NativeEngine_nativeRestoreOriginal(JNIEnv*, jclass, jlong handle) {
    EngineSession* s = sessionFor(handle);
    if (s) s->restoreOriginal();
}

JNIEXPORT jboolean JNICALL
Java_com_unflatten_offline_engine_NativeEngine_nativeRegenerateBackground(JNIEnv*, jclass, jlong handle) {
    EngineSession* s = sessionFor(handle);
    return (s && s->regenerateBackgroundFallback()) ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jbyteArray JNICALL
Java_com_unflatten_offline_engine_NativeEngine_nativeSaveProject(JNIEnv* env, jclass, jlong handle) {
    EngineSession* s = sessionFor(handle);
    if (!s) return toJByteArray(env, {});
    return toJByteArray(env, serializeProject(s->project()));
}

JNIEXPORT jlong JNICALL
Java_com_unflatten_offline_engine_NativeEngine_nativeLoadProject(JNIEnv* env, jclass, jbyteArray bytes) {
    auto data = fromJByteArray(env, bytes);
    LoadResult result = deserializeProject(data);
    if (result.fatal || !result.project) {
        g_lastError = result.fatalError;
        return -1;
    }
    g_lastError.clear();
    for (auto& w : result.warnings) { g_lastError += w.message; g_lastError += "\n"; }
    return registerSession(std::make_unique<EngineSession>(std::move(result.project)));
}

JNIEXPORT jstring JNICALL
Java_com_unflatten_offline_engine_NativeEngine_nativeGetLastLoadMessage(JNIEnv* env, jclass) {
    return env->NewStringUTF(g_lastError.c_str());
}

JNIEXPORT jbyteArray JNICALL
Java_com_unflatten_offline_engine_NativeEngine_nativeExportCompositePng(JNIEnv* env, jclass, jlong handle) {
    EngineSession* s = sessionFor(handle);
    if (!s) return toJByteArray(env, {});
    return toJByteArray(env, encodePng(s->project().compositeAll()));
}

JNIEXPORT jbyteArray JNICALL
Java_com_unflatten_offline_engine_NativeEngine_nativeExportSourcePng(JNIEnv* env, jclass, jlong handle) {
    EngineSession* s = sessionFor(handle);
    if (!s) return toJByteArray(env, {});
    return toJByteArray(env, encodePng(s->project().sourceImage));
}

// kind: 0=rgba, 1=visibleMask, 2=amodalMask
JNIEXPORT jbyteArray JNICALL
Java_com_unflatten_offline_engine_NativeEngine_nativeExportLayerPng(
        JNIEnv* env, jclass, jlong handle, jlong idHi, jlong idLo, jint kind) {
    EngineSession* s = sessionFor(handle);
    if (!s) return toJByteArray(env, {});
    Layer* l = s->project().findLayer(idFromParts(idHi, idLo));
    if (!l) return toJByteArray(env, {});
    const TiledImage& img = kind == 1 ? l->visibleMask : (kind == 2 ? l->amodalMask : l->rgba);
    return toJByteArray(env, encodePng(img.toDenseBuffer()));
}

JNIEXPORT jbyteArray JNICALL
Java_com_unflatten_offline_engine_NativeEngine_nativeExportPsd(JNIEnv* env, jclass, jlong handle) {
    EngineSession* s = sessionFor(handle);
    if (!s) return toJByteArray(env, {});
    return toJByteArray(env, encodePsd(s->project()));
}

} // extern "C"
