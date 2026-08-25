#include "uf7p_format.h"
#include "byte_io.h"
#include "zlib_util.h"
#include <cstring>
#include <algorithm>
#include <optional>

namespace unflatten {

namespace {

constexpr char kMagic[4] = {'U', 'F', '7', 'P'};
constexpr char kManifestMagic[4] = {'M', 'A', 'N', 'I'};
constexpr char kFooterMagic[4] = {'U', 'F', 'T', 'L'};
constexpr uint32_t kFormatVersion = 1;

struct ChunkDescriptor {
    ChunkType type;
    uint32_t chunkId;
    uint64_t fileOffset;
    uint64_t recordLen;
};

// One on-disk chunk record: [type u8][chunkId u32][uncompressedLen u32]
// [compressedLen u32][crc32 u32][compressed bytes...]
// Every field needed to validate and skip this record is in its own header,
// so a corrupt chunk (bad CRC) can be reported and skipped without
// preventing the reader from finding the next chunk (brief §28 "independent
// chunk CRC/hash").
ChunkDescriptor writeChunkRecord(std::vector<uint8_t>& file, ChunkType type, uint32_t chunkId,
                                  const std::vector<uint8_t>& raw) {
    uint64_t offset = file.size();
    std::vector<uint8_t> compressed = zlibCompress(raw);
    uint32_t crc = crc32Of(compressed);

    ByteWriter header;
    header.u8(static_cast<uint8_t>(type));
    header.u32(chunkId);
    header.u32(static_cast<uint32_t>(raw.size()));
    header.u32(static_cast<uint32_t>(compressed.size()));
    header.u32(crc);

    auto headerBytes = header.take();
    file.insert(file.end(), headerBytes.begin(), headerBytes.end());
    file.insert(file.end(), compressed.begin(), compressed.end());

    uint64_t recordLen = headerBytes.size() + compressed.size();
    return ChunkDescriptor{type, chunkId, offset, recordLen};
}

struct ReadChunk {
    ChunkType type;
    uint32_t chunkId;
    std::vector<uint8_t> raw;
};

// Returns nullopt (with a warning appended) if this chunk's CRC doesn't
// match -- caller skips it and continues with the rest of the file.
std::optional<ReadChunk> readChunkRecord(const std::vector<uint8_t>& file, uint64_t offset,
                                          std::vector<LoadWarning>& warnings) {
    if (offset + 17 > file.size()) {
        warnings.push_back({"chunk record header extends past end of file, skipped"});
        return std::nullopt;
    }
    ByteReader r(file.data() + offset, file.size() - offset);
    uint8_t typeByte = r.u8();
    uint32_t chunkId = r.u32();
    uint32_t uncompressedLen = r.u32();
    uint32_t compressedLen = r.u32();
    uint32_t expectedCrc = r.u32();

    if (r.remaining() < compressedLen) {
        warnings.push_back({"chunk body extends past end of file, skipped"});
        return std::nullopt;
    }
    std::vector<uint8_t> compressed = r.bytes(compressedLen);
    uint32_t actualCrc = crc32Of(compressed);
    if (actualCrc != expectedCrc) {
        warnings.push_back({"CRC mismatch on chunk (type=" + std::to_string(typeByte) +
                             ", id=" + std::to_string(chunkId) + "), skipped -- data is corrupt"});
        return std::nullopt;
    }
    std::vector<uint8_t> raw;
    try {
        raw = zlibDecompress(compressed, uncompressedLen);
    } catch (const std::exception& e) {
        warnings.push_back({std::string("decompression failed on chunk, skipped: ") + e.what()});
        return std::nullopt;
    }
    return ReadChunk{static_cast<ChunkType>(typeByte), chunkId, std::move(raw)};
}

// --- TiledImage --------------------------------------------------------

void writeTiledImage(ByteWriter& w, const TiledImage& img) {
    Rect b = img.bounds();
    w.i32(b.x); w.i32(b.y); w.i32(b.w); w.i32(b.h);
    w.u32(static_cast<uint32_t>(img.tilesMap().size()));
    for (const auto& [key, tile] : img.tilesMap()) {
        w.i32(key.tx); w.i32(key.ty);
        std::vector<uint8_t> raw(tile.raw().size() * 4);
        std::memcpy(raw.data(), tile.raw().data(), raw.size());
        auto compressed = zlibCompress(raw);
        w.u32(static_cast<uint32_t>(raw.size()));
        w.u32(static_cast<uint32_t>(compressed.size()));
        w.u32(crc32Of(compressed));
        w.bytes(compressed);
    }
}

TiledImage readTiledImage(ByteReader& r) {
    TiledImage img;
    Rect b;
    b.x = r.i32(); b.y = r.i32(); b.w = r.i32(); b.h = r.i32();
    img.setExplicitBounds(b);
    uint32_t tileCount = r.u32();
    for (uint32_t i = 0; i < tileCount; ++i) {
        int32_t tx = r.i32(), ty = r.i32();
        uint32_t rawLen = r.u32();
        uint32_t compLen = r.u32();
        uint32_t crc = r.u32();
        auto compressed = r.bytes(compLen);
        if (crc32Of(compressed) != crc) {
            throw std::runtime_error("UF7P: tile CRC mismatch (corrupt tile data)");
        }
        auto raw = zlibDecompress(compressed, rawLen);
        PixelBuffer tile(kTileSize, kTileSize);
        std::memcpy(tile.raw().data(), raw.data(), raw.size());
        img.tilesMap().emplace(TileKey{tx, ty}, std::move(tile));
    }
    return img;
}

// --- Layer ---------------------------------------------------------------

std::vector<uint8_t> writeLayerBody(const Layer& layer) {
    ByteWriter w;
    w.u64(layer.id.hi); w.u64(layer.id.lo);
    w.str(layer.name);
    w.u8(static_cast<uint8_t>(layer.type));
    writeTiledImage(w, layer.rgba);
    writeTiledImage(w, layer.visibleMask);
    writeTiledImage(w, layer.amodalMask);

    w.i32(layer.provenance.width());
    w.i32(layer.provenance.height());
    {
        auto compressed = zlibCompress(layer.provenance.raw());
        w.u32(static_cast<uint32_t>(layer.provenance.raw().size()));
        w.u32(static_cast<uint32_t>(compressed.size()));
        w.u32(crc32Of(compressed));
        w.bytes(compressed);
    }

    w.f32(layer.opacity);
    w.u8(static_cast<uint8_t>(layer.blendMode));
    w.u8(layer.visible ? 1 : 0);
    w.u8(layer.locked ? 1 : 0);
    w.i32(layer.depthIndex);
    w.f32(layer.offsetX);
    w.f32(layer.offsetY);

    w.u32(static_cast<uint32_t>(layer.shadowOf.size()));
    for (auto& id : layer.shadowOf) { w.u64(id.hi); w.u64(id.lo); }
    w.u32(static_cast<uint32_t>(layer.reflectionOf.size()));
    for (auto& id : layer.reflectionOf) { w.u64(id.hi); w.u64(id.lo); }

    w.str(layer.generation.sourceModel);
    w.str(layer.generation.modelVersion);
    w.str(layer.generation.modelSha256);
    w.str(layer.generation.generationPass);
    w.u8(layer.generation.hasSeed ? 1 : 0);
    w.u64(static_cast<uint64_t>(layer.generation.seed));

    w.u8(layer.hasRecognizedText ? 1 : 0);
    w.str(layer.recognizedText);

    return w.take();
}

std::unique_ptr<Layer> readLayerBody(const std::vector<uint8_t>& body) {
    ByteReader r(body);
    auto layer = std::make_unique<Layer>();
    layer->id.hi = r.u64(); layer->id.lo = r.u64();
    layer->name = r.str();
    layer->type = static_cast<LayerType>(r.u8());
    layer->rgba = readTiledImage(r);
    layer->visibleMask = readTiledImage(r);
    layer->amodalMask = readTiledImage(r);

    int32_t pw = r.i32(), ph = r.i32();
    uint32_t rawLen = r.u32();
    uint32_t compLen = r.u32();
    uint32_t crc = r.u32();
    auto compressed = r.bytes(compLen);
    if (crc32Of(compressed) != crc) throw std::runtime_error("UF7P: provenance CRC mismatch");
    auto raw = zlibDecompress(compressed, rawLen);
    layer->provenance = ProvenanceMap(pw, ph, Provenance::Observed);
    if (!raw.empty()) std::memcpy(layer->provenance.raw().data(), raw.data(), raw.size());

    layer->opacity = r.f32();
    layer->blendMode = static_cast<BlendMode>(r.u8());
    layer->visible = r.u8() != 0;
    layer->locked = r.u8() != 0;
    layer->depthIndex = r.i32();
    layer->offsetX = r.f32();
    layer->offsetY = r.f32();

    uint32_t shadowCount = r.u32();
    for (uint32_t i = 0; i < shadowCount; ++i) { LayerId id; id.hi = r.u64(); id.lo = r.u64(); layer->shadowOf.push_back(id); }
    uint32_t reflCount = r.u32();
    for (uint32_t i = 0; i < reflCount; ++i) { LayerId id; id.hi = r.u64(); id.lo = r.u64(); layer->reflectionOf.push_back(id); }

    layer->generation.sourceModel = r.str();
    layer->generation.modelVersion = r.str();
    layer->generation.modelSha256 = r.str();
    layer->generation.generationPass = r.str();
    layer->generation.hasSeed = r.u8() != 0;
    layer->generation.seed = static_cast<int64_t>(r.u64());

    layer->hasRecognizedText = r.u8() != 0;
    layer->recognizedText = r.str();

    return layer;
}

// --- Project meta ----------------------------------------------------

std::vector<uint8_t> writeProjectMeta(const Project& p) {
    ByteWriter w;
    w.str(p.projectUuid);
    w.u32(static_cast<uint32_t>(p.formatVersion));
    Rect ob = p.sourceObservation.originalImageBounds;
    Rect cb = p.sourceObservation.canvasBounds;
    w.i32(ob.x); w.i32(ob.y); w.i32(ob.w); w.i32(ob.h);
    w.i32(cb.x); w.i32(cb.y); w.i32(cb.w); w.i32(cb.h);
    w.u8(static_cast<uint8_t>(p.pipelineStage));
    w.str(p.lastFailureReason);
    w.u32(static_cast<uint32_t>(p.stageNotes.size()));
    for (const auto& note : p.stageNotes) w.str(note);
    return w.take();
}

void readProjectMeta(const std::vector<uint8_t>& body, Project& p) {
    ByteReader r(body);
    p.projectUuid = r.str();
    p.formatVersion = static_cast<int32_t>(r.u32());
    Rect ob, cb;
    ob.x = r.i32(); ob.y = r.i32(); ob.w = r.i32(); ob.h = r.i32();
    cb.x = r.i32(); cb.y = r.i32(); cb.w = r.i32(); cb.h = r.i32();
    p.sourceObservation.originalImageBounds = ob;
    p.sourceObservation.canvasBounds = cb;
    p.pipelineStage = static_cast<PipelineStage>(r.u8());
    p.lastFailureReason = r.str();
    uint32_t noteCount = r.u32();
    for (uint32_t i = 0; i < noteCount; ++i) p.stageNotes.push_back(r.str());
}

std::vector<uint8_t> writeSourceImage(const PixelBuffer& img) {
    ByteWriter w;
    w.i32(img.width());
    w.i32(img.height());
    std::vector<uint8_t> raw(img.raw().size() * 4);
    std::memcpy(raw.data(), img.raw().data(), raw.size());
    w.bytes(raw);
    return w.take();
}

PixelBuffer readSourceImage(const std::vector<uint8_t>& body) {
    ByteReader r(body);
    int32_t w = r.i32(), h = r.i32();
    PixelBuffer img(w, h);
    auto raw = r.bytes(static_cast<size_t>(w) * h * 4);
    std::memcpy(img.raw().data(), raw.data(), raw.size());
    return img;
}

std::vector<uint8_t> writeOcclusionEdges(const OcclusionGraph& g) {
    ByteWriter w;
    w.u32(static_cast<uint32_t>(g.edges().size()));
    for (const auto& e : g.edges()) {
        w.u64(e.occluder.hi); w.u64(e.occluder.lo);
        w.u64(e.occluded.hi); w.u64(e.occluded.lo);
        w.f32(e.confidence);
    }
    return w.take();
}

void readOcclusionEdges(const std::vector<uint8_t>& body, OcclusionGraph& g) {
    ByteReader r(body);
    uint32_t n = r.u32();
    for (uint32_t i = 0; i < n; ++i) {
        LayerId occluder, occluded;
        occluder.hi = r.u64(); occluder.lo = r.u64();
        occluded.hi = r.u64(); occluded.lo = r.u64();
        float conf = r.f32();
        g.addEdge(occluder, occluded, conf);
    }
}

} // namespace

std::vector<uint8_t> serializeProject(const Project& project) {
    std::vector<uint8_t> file;
    {
        ByteWriter h;
        h.bytes(reinterpret_cast<const uint8_t*>(kMagic), 4);
        h.u32(kFormatVersion);
        auto hb = h.take();
        file.insert(file.end(), hb.begin(), hb.end());
    }

    std::vector<ChunkDescriptor> descriptors;
    descriptors.push_back(writeChunkRecord(file, ChunkType::ProjectMeta, 0, writeProjectMeta(project)));
    descriptors.push_back(writeChunkRecord(file, ChunkType::SourceImage, 0, writeSourceImage(project.sourceImage)));
    descriptors.push_back(writeChunkRecord(file, ChunkType::OcclusionGraphEdges, 0, writeOcclusionEdges(project.occlusionGraph)));
    for (uint32_t i = 0; i < project.layers.size(); ++i) {
        descriptors.push_back(writeChunkRecord(file, ChunkType::Layer, i, writeLayerBody(*project.layers[i])));
    }

    uint64_t manifestOffset = file.size();
    ByteWriter manifestBody;
    manifestBody.u32(static_cast<uint32_t>(descriptors.size()));
    for (const auto& d : descriptors) {
        manifestBody.u8(static_cast<uint8_t>(d.type));
        manifestBody.u32(d.chunkId);
        manifestBody.u64(d.fileOffset);
        manifestBody.u64(d.recordLen);
    }
    auto manifestBytes = manifestBody.take();
    uint32_t manifestCrc = crc32Of(manifestBytes);

    ByteWriter manifestFrame;
    manifestFrame.bytes(reinterpret_cast<const uint8_t*>(kManifestMagic), 4);
    manifestFrame.u32(manifestCrc);
    manifestFrame.u32(static_cast<uint32_t>(manifestBytes.size()));
    manifestFrame.bytes(manifestBytes);
    auto mfb = manifestFrame.take();
    file.insert(file.end(), mfb.begin(), mfb.end());

    ByteWriter footer;
    footer.bytes(reinterpret_cast<const uint8_t*>(kFooterMagic), 4);
    footer.u64(manifestOffset);
    auto fb = footer.take();
    file.insert(file.end(), fb.begin(), fb.end());

    return file;
}

LoadResult deserializeProject(const std::vector<uint8_t>& fileBytes) {
    LoadResult result;
    if (fileBytes.size() < 8 + 12) {
        result.fatal = true;
        result.fatalError = "file too small to be a valid UF7P project";
        return result;
    }
    if (std::memcmp(fileBytes.data(), kMagic, 4) != 0) {
        result.fatal = true;
        result.fatalError = "bad magic: not a UF7P project file";
        return result;
    }
    uint32_t formatVersion;
    std::memcpy(&formatVersion, fileBytes.data() + 4, 4);
    if (formatVersion != kFormatVersion) {
        result.fatal = true;
        result.fatalError = "unsupported UF7P format version " + std::to_string(formatVersion) +
                             " (this build supports version " + std::to_string(kFormatVersion) + ")";
        return result;
    }

    size_t footerStart = fileBytes.size() - 12;
    if (std::memcmp(fileBytes.data() + footerStart, kFooterMagic, 4) != 0) {
        result.fatal = true;
        result.fatalError = "missing/corrupt footer -- file is truncated or not a valid UF7P project";
        return result;
    }
    uint64_t manifestOffset;
    std::memcpy(&manifestOffset, fileBytes.data() + footerStart + 4, 8);
    if (manifestOffset >= fileBytes.size()) {
        result.fatal = true;
        result.fatalError = "manifest offset out of range -- file is corrupt";
        return result;
    }

    ByteReader mr(fileBytes.data() + manifestOffset, fileBytes.size() - manifestOffset);
    char manifestMagicBuf[4];
    for (auto& c : manifestMagicBuf) c = static_cast<char>(mr.u8());
    if (std::memcmp(manifestMagicBuf, kManifestMagic, 4) != 0) {
        result.fatal = true;
        result.fatalError = "manifest magic mismatch -- file is corrupt";
        return result;
    }
    uint32_t manifestCrc = mr.u32();
    uint32_t manifestLen = mr.u32();
    if (mr.remaining() < manifestLen) {
        result.fatal = true;
        result.fatalError = "manifest body truncated -- file is corrupt";
        return result;
    }
    auto manifestBytes = mr.bytes(manifestLen);
    if (crc32Of(manifestBytes) != manifestCrc) {
        result.fatal = true;
        result.fatalError = "manifest CRC mismatch -- file is corrupt; cannot safely enumerate chunks";
        return result;
    }

    ByteReader mbr(manifestBytes);
    uint32_t chunkCount = mbr.u32();
    std::vector<ChunkDescriptor> descriptors;
    descriptors.reserve(chunkCount);
    for (uint32_t i = 0; i < chunkCount; ++i) {
        ChunkDescriptor d;
        d.type = static_cast<ChunkType>(mbr.u8());
        d.chunkId = mbr.u32();
        d.fileOffset = mbr.u64();
        d.recordLen = mbr.u64();
        descriptors.push_back(d);
    }

    auto project = std::make_unique<Project>();
    std::vector<std::pair<uint32_t, std::unique_ptr<Layer>>> pendingLayers;

    for (const auto& d : descriptors) {
        auto chunk = readChunkRecord(fileBytes, d.fileOffset, result.warnings);
        if (!chunk) continue; // already warned
        switch (chunk->type) {
            case ChunkType::ProjectMeta:
                try { readProjectMeta(chunk->raw, *project); }
                catch (const std::exception& e) { result.warnings.push_back({std::string("project meta chunk unreadable: ") + e.what()}); }
                break;
            case ChunkType::SourceImage:
                try { project->sourceImage = readSourceImage(chunk->raw); }
                catch (const std::exception& e) { result.warnings.push_back({std::string("source image chunk unreadable: ") + e.what()}); }
                break;
            case ChunkType::OcclusionGraphEdges:
                try { readOcclusionEdges(chunk->raw, project->occlusionGraph); }
                catch (const std::exception& e) { result.warnings.push_back({std::string("occlusion graph chunk unreadable: ") + e.what()}); }
                break;
            case ChunkType::Layer:
                try {
                    pendingLayers.emplace_back(d.chunkId, readLayerBody(chunk->raw));
                } catch (const std::exception& e) {
                    result.warnings.push_back({"layer chunk (id=" + std::to_string(d.chunkId) +
                                                ") unreadable, layer dropped: " + e.what()});
                }
                break;
        }
    }

    std::sort(pendingLayers.begin(), pendingLayers.end(),
              [](const auto& a, const auto& b) { return a.first < b.first; });
    for (auto& [idx, layer] : pendingLayers) {
        project->layers.push_back(std::move(layer));
    }

    result.project = std::move(project);
    return result;
}

} // namespace unflatten
