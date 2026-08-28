#include "session.h"
#include "io/uf7p_format.h"
#include "common/connected_components.h"
#include "fallback/inpaint_fallback.h"
#include "api.h"
#include <algorithm>
#include <cmath>

namespace unflatten {

EngineSession::EngineSession(std::unique_ptr<Project> project) : project_(std::move(project)) {}

void EngineSession::pushUndoSnapshot() {
    undoStack_.push_back(serializeProject(*project_));
    if (undoStack_.size() > kMaxUndo) undoStack_.erase(undoStack_.begin());
    redoStack_.clear();
}

bool EngineSession::undo() {
    if (undoStack_.empty()) return false;
    redoStack_.push_back(serializeProject(*project_));
    auto bytes = std::move(undoStack_.back());
    undoStack_.pop_back();
    auto result = deserializeProject(bytes);
    if (result.fatal || !result.project) return false;
    project_ = std::move(result.project);
    return true;
}

bool EngineSession::redo() {
    if (redoStack_.empty()) return false;
    undoStack_.push_back(serializeProject(*project_));
    auto bytes = std::move(redoStack_.back());
    redoStack_.pop_back();
    auto result = deserializeProject(bytes);
    if (result.fatal || !result.project) return false;
    project_ = std::move(result.project);
    return true;
}

void EngineSession::renumberDepthIndices() {
    for (size_t i = 0; i < project_->layers.size(); ++i) {
        project_->layers[i]->depthIndex = static_cast<int32_t>(i);
    }
}

bool EngineSession::setLayerVisible(LayerId id, bool visible) {
    Layer* l = project_->findLayer(id);
    if (!l) return false;
    pushUndoSnapshot();
    l->visible = visible;
    return true;
}

bool EngineSession::setLayerOpacity(LayerId id, float opacity) {
    Layer* l = project_->findLayer(id);
    if (!l) return false;
    pushUndoSnapshot();
    l->opacity = std::clamp(opacity, 0.0f, 1.0f);
    return true;
}

bool EngineSession::setLayerBlendMode(LayerId id, BlendMode mode) {
    Layer* l = project_->findLayer(id);
    if (!l) return false;
    pushUndoSnapshot();
    l->blendMode = mode;
    return true;
}

bool EngineSession::renameLayer(LayerId id, const std::string& name) {
    Layer* l = project_->findLayer(id);
    if (!l) return false;
    pushUndoSnapshot();
    l->name = name;
    return true;
}

bool EngineSession::moveLayer(LayerId id, int32_t newIndex) {
    auto& layers = project_->layers;
    auto it = std::find_if(layers.begin(), layers.end(), [&](auto& l) { return l->id == id; });
    if (it == layers.end()) return false;
    pushUndoSnapshot();
    newIndex = std::clamp(newIndex, 0, static_cast<int32_t>(layers.size()) - 1);
    auto ptr = std::move(*it);
    layers.erase(it);
    layers.insert(layers.begin() + newIndex, std::move(ptr));
    renumberDepthIndices();
    return true;
}

bool EngineSession::deleteLayer(LayerId id) {
    if (!project_->findLayer(id)) return false;
    pushUndoSnapshot();
    project_->removeLayer(id);
    renumberDepthIndices();
    return true;
}

bool EngineSession::maskBrushStroke(LayerId id, float x0, float y0, float x1, float y1,
                                     float radiusPx, bool add) {
    Layer* l = project_->findLayer(id);
    if (!l) return false;
    pushUndoSnapshot();

    float dx = x1 - x0, dy = y1 - y0;
    float len = std::sqrt(dx * dx + dy * dy);
    int32_t steps = std::max(1, static_cast<int32_t>(len));
    int32_t r = std::max(1, static_cast<int32_t>(radiusPx));

    auto paintAt = [&](int32_t cx, int32_t cy) {
        for (int32_t oy = -r; oy <= r; ++oy) {
            for (int32_t ox = -r; ox <= r; ++ox) {
                if (ox * ox + oy * oy > r * r) continue;
                int32_t px = cx + ox, py = cy + oy;
                if (px < 0 || py < 0) continue; // canvas-space; negative coords reserved for outpaint growth (§16), not yet supported by brush edits
                if (add) {
                    RGBA8 srcColor{200, 200, 200, 255};
                    if (px < project_->sourceImage.width() && py < project_->sourceImage.height()) {
                        RGBA8 s = project_->sourceImage.at(px, py);
                        srcColor = RGBA8{s.r, s.g, s.b, 255};
                    }
                    l->rgba.setPixel(px, py, srcColor);
                    l->visibleMask.setPixel(px, py, RGBA8{255, 255, 255, 255});
                    l->amodalMask.setPixel(px, py, RGBA8{255, 255, 255, 255});
                } else {
                    l->rgba.setPixel(px, py, RGBA8{0, 0, 0, 0});
                    l->visibleMask.setPixel(px, py, RGBA8{0, 0, 0, 0});
                }
            }
        }
    };

    for (int32_t s = 0; s <= steps; ++s) {
        float t = static_cast<float>(s) / steps;
        paintAt(static_cast<int32_t>(x0 + dx * t), static_cast<int32_t>(y0 + dy * t));
    }

    // Simplification (documented in KNOWN_LIMITATIONS.md): a brush stroke
    // marks the ENTIRE layer Manual, not just the touched pixels. Doing
    // this precisely would require carrying the layer's provenance map
    // through the same bounds-growth logic TiledImage::setPixel uses, pixel
    // by pixel; this build takes the simpler, always-correct-in-direction
    // (never UNDER-reports a manual edit) approach instead of a partially
    // correct precise one.
    Rect newBounds = l->rgba.bounds();
    l->provenance = ProvenanceMap(newBounds.w, newBounds.h, Provenance::Manual);

    return true;
}

std::optional<LayerId> EngineSession::mergeLayers(const std::vector<LayerId>& ids, const std::string& newName) {
    if (ids.size() < 2) return std::nullopt;
    std::vector<Layer*> targets;
    for (auto& id : ids) {
        Layer* l = project_->findLayer(id);
        if (!l) return std::nullopt;
        targets.push_back(l);
    }
    pushUndoSnapshot();

    // Preserve the existing relative draw order among the targets.
    std::sort(targets.begin(), targets.end(), [](Layer* a, Layer* b) { return a->depthIndex < b->depthIndex; });

    Rect unionBounds{};
    for (auto* l : targets) unionBounds = unionBounds.unionWith(l->rgba.bounds());
    if (unionBounds.isEmpty()) return std::nullopt;

    PixelBuffer merged(unionBounds.w, unionBounds.h);
    ProvenanceMap mergedProv(unionBounds.w, unionBounds.h, Provenance::Observed);
    for (auto* l : targets) {
        if (!l->visible) continue;
        PixelBuffer content = l->rgba.toDenseBuffer();
        Rect b = l->rgba.bounds();
        for (int32_t y = 0; y < content.height(); ++y) {
            for (int32_t x = 0; x < content.width(); ++x) {
                RGBA8 p = content.at(x, y);
                if (p.a == 0) continue;
                p.a = static_cast<uint8_t>(p.a * l->opacity);
                int32_t mx = b.x + x - unionBounds.x, my = b.y + y - unionBounds.y;
                merged.at(mx, my) = p; // Normal-blend "over": last (topmost) opaque pixel wins
                mergedProv.set(mx, my, l->provenance.width() > 0 ? l->provenance.at(x, y) : Provenance::Observed);
            }
        }
    }

    // Captured before `targets` (raw Layer* into the still-live project_
    // layer vector at this point) is invalidated by the removeLayer loop
    // below, which deletes the Layer objects those pointers point to.
    // Re-dereferencing targets.back() after that loop is a use-after-free
    // (caught by AddressSanitizer -- see KNOWN_LIMITATIONS.md / SECURITY.md).
    int32_t topmostDepthIndex = targets.back()->depthIndex;

    auto newLayer = std::make_unique<Layer>();
    newLayer->id = newLayerId();
    newLayer->name = newName.empty() ? (targets.back()->name + " (merged)") : newName;
    newLayer->type = targets.back()->type;
    newLayer->depthIndex = topmostDepthIndex;
    newLayer->rgba = TiledImage::fromDenseBuffer(merged, unionBounds.x, unionBounds.y);
    TiledImage mask;
    for (int32_t y = 0; y < merged.height(); ++y)
        for (int32_t x = 0; x < merged.width(); ++x)
            if (merged.at(x, y).a != 0) mask.setPixel(unionBounds.x + x, unionBounds.y + y, RGBA8{255, 255, 255, 255});
    mask.setExplicitBounds(unionBounds);
    newLayer->visibleMask = mask;
    newLayer->amodalMask = mask;
    newLayer->provenance = mergedProv;
    LayerId newId = newLayer->id;

    for (auto& id : ids) { project_->removeLayer(id); }
    project_->addLayer(std::move(newLayer));
    // Move it to the position of the (now-gone) topmost target so relative
    // order versus untouched layers is preserved.
    auto& layers = project_->layers;
    auto it = std::find_if(layers.begin(), layers.end(), [&](auto& l) { return l->id == newId; });
    auto ptr = std::move(*it);
    layers.erase(it);
    size_t insertAt = std::min(static_cast<size_t>(topmostDepthIndex), layers.size());
    layers.insert(layers.begin() + insertAt, std::move(ptr));
    renumberDepthIndices();

    return newId;
}

std::vector<LayerId> EngineSession::splitLayer(LayerId id) {
    Layer* l = project_->findLayer(id);
    if (!l) return {};
    Rect b = l->rgba.bounds();
    if (b.isEmpty()) return {};

    PixelBuffer content = l->rgba.toDenseBuffer();
    std::vector<uint8_t> binary(static_cast<size_t>(b.w) * b.h, 0);
    for (int32_t y = 0; y < b.h; ++y)
        for (int32_t x = 0; x < b.w; ++x)
            binary[static_cast<size_t>(y) * b.w + x] = content.at(x, y).a != 0 ? 255 : 0;

    auto components = findConnectedComponents(binary, b.w, b.h, /*minAreaPx=*/1);
    if (components.size() <= 1) return {}; // nothing meaningful to split

    pushUndoSnapshot();
    std::vector<LayerId> newIds;
    int32_t baseDepth = l->depthIndex;
    size_t partIndex = 1;
    for (auto& comp : components) {
        auto part = std::make_unique<Layer>();
        part->id = newLayerId();
        part->name = l->name + " (" + std::to_string(partIndex++) + ")";
        part->type = l->type;
        part->depthIndex = baseDepth;
        part->blendMode = l->blendMode;
        part->opacity = l->opacity;
        part->generation = l->generation;

        PixelBuffer partContent(comp.bounds.w, comp.bounds.h);
        ProvenanceMap partProv(comp.bounds.w, comp.bounds.h, Provenance::Observed);
        for (int32_t y = 0; y < comp.bounds.h; ++y) {
            for (int32_t x = 0; x < comp.bounds.w; ++x) {
                if (comp.mask[static_cast<size_t>(y) * comp.bounds.w + x] == 0) continue;
                int32_t srcX = comp.bounds.x + x, srcY = comp.bounds.y + y;
                partContent.at(x, y) = content.at(srcX, srcY);
                partProv.set(x, y, l->provenance.width() > 0 ? l->provenance.at(srcX, srcY) : Provenance::Observed);
            }
        }
        part->rgba = TiledImage::fromDenseBuffer(partContent, b.x + comp.bounds.x, b.y + comp.bounds.y);
        TiledImage mask;
        for (int32_t y = 0; y < comp.bounds.h; ++y)
            for (int32_t x = 0; x < comp.bounds.w; ++x)
                if (comp.mask[static_cast<size_t>(y) * comp.bounds.w + x])
                    mask.setPixel(b.x + comp.bounds.x + x, b.y + comp.bounds.y + y, RGBA8{255, 255, 255, 255});
        mask.setExplicitBounds(Rect{b.x + comp.bounds.x, b.y + comp.bounds.y, comp.bounds.w, comp.bounds.h});
        part->visibleMask = mask;
        part->amodalMask = mask;
        part->provenance = partProv;

        newIds.push_back(part->id);
        project_->addLayer(std::move(part));
    }

    auto& layers = project_->layers;
    auto oldIt = std::find_if(layers.begin(), layers.end(), [&](auto& x) { return x->id == id; });
    layers.erase(oldIt);
    renumberDepthIndices();

    return newIds;
}

void EngineSession::restoreOriginal() {
    pushUndoSnapshot();
    std::string uuid = project_->projectUuid;
    PixelBuffer src = project_->sourceImage;
    project_ = api::createProjectFromImage(src, uuid);
}

bool EngineSession::regenerateBackgroundFallback() {
    Layer* bgLayer = nullptr;
    for (auto& l : project_->layers) if (l->type == LayerType::Background) { bgLayer = l.get(); break; }

    pushUndoSnapshot();

    std::vector<uint8_t> holeMask(
        static_cast<size_t>(project_->sourceImage.width()) * project_->sourceImage.height(), 0);
    for (auto& l : project_->layers) {
        if (l->type == LayerType::Background || !l->visible) continue;
        PixelBuffer content = l->rgba.toDenseBuffer();
        Rect b = l->rgba.bounds();
        for (int32_t y = 0; y < content.height(); ++y) {
            for (int32_t x = 0; x < content.width(); ++x) {
                if (content.at(x, y).a == 0) continue;
                int32_t cx = b.x + x, cy = b.y + y;
                if (cx < 0 || cy < 0 || cx >= project_->sourceImage.width() || cy >= project_->sourceImage.height()) continue;
                holeMask[static_cast<size_t>(cy) * project_->sourceImage.width() + cx] = 1;
            }
        }
    }

    PixelBuffer bgContent = project_->sourceImage;
    fallback::inpaintFallback(bgContent, holeMask);
    ProvenanceMap bgProv(bgContent.width(), bgContent.height(), Provenance::Observed);
    for (int32_t y = 0; y < bgContent.height(); ++y)
        for (int32_t x = 0; x < bgContent.width(); ++x)
            if (holeMask[static_cast<size_t>(y) * bgContent.width() + x])
                bgProv.set(x, y, Provenance::FallbackHeuristic);

    if (!bgLayer) {
        auto newBg = std::make_unique<Layer>();
        newBg->id = newLayerId();
        newBg->name = "Background";
        newBg->type = LayerType::Background;
        newBg->depthIndex = 0;
        // Inserted at the front, not appended -- see the matching comment
        // in api.cpp's runFallbackDecomposition for why vector-order must
        // track intended depth order for EngineSession's renumbering to
        // stay correct.
        project_->layers.insert(project_->layers.begin(), std::move(newBg));
        bgLayer = project_->layers.front().get();
    }
    bgLayer->rgba = TiledImage::fromDenseBuffer(bgContent, 0, 0);
    bgLayer->generation.generationPass = "FALLBACK_DIFFUSION_INPAINT_V1";
    TiledImage fullMask;
    for (int32_t y = 0; y < bgContent.height(); ++y)
        for (int32_t x = 0; x < bgContent.width(); ++x)
            fullMask.setPixel(x, y, RGBA8{255, 255, 255, 255});
    fullMask.setExplicitBounds(Rect{0, 0, bgContent.width(), bgContent.height()});
    bgLayer->visibleMask = fullMask;
    bgLayer->amodalMask = fullMask;
    bgLayer->provenance = bgProv;
    renumberDepthIndices();
    return true;
}

} // namespace unflatten
