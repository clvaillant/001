#pragma once
#include <cstdint>
#include <cstddef>
#include <string>

// Core value types shared across the Unflatten native engine. Kept
// dependency-free (no zlib/JNI here) so this header can be included by both
// the Android build and the host-side unit test build unmodified.
namespace unflatten {

struct RGBA8 {
    uint8_t r = 0, g = 0, b = 0, a = 0;
};

struct Rect {
    int32_t x = 0, y = 0, w = 0, h = 0;

    bool isEmpty() const { return w <= 0 || h <= 0; }
    int32_t right() const { return x + w; }
    int32_t bottom() const { return y + h; }

    Rect unionWith(const Rect& o) const {
        if (isEmpty()) return o;
        if (o.isEmpty()) return *this;
        int32_t nx = std::min(x, o.x);
        int32_t ny = std::min(y, o.y);
        int32_t nr = std::max(right(), o.right());
        int32_t nb = std::max(bottom(), o.bottom());
        return Rect{nx, ny, nr - nx, nb - ny};
    }

    bool intersects(const Rect& o) const {
        if (isEmpty() || o.isEmpty()) return false;
        return x < o.right() && o.x < right() && y < o.bottom() && o.y < bottom();
    }

    bool contains(int32_t px, int32_t py) const {
        return px >= x && py >= y && px < right() && py < bottom();
    }
};

// Per-pixel provenance classification. This is the mechanism the brief
// (§25) requires so the editor can distinguish observed vs. generated vs.
// user-edited pixels and never present inferred content as ground truth.
//
// ModelInferred exists in the schema/wire-format now so that when a real
// learned amodal/completion model is integrated later, no format migration
// is needed — but no code path in this build ever writes it, because no
// learned model ships in this build (see DECISIONS.md / INFERENCE_CARD.md).
enum class Provenance : uint8_t {
    Observed = 0,
    ModelInferred = 1,
    FallbackHeuristic = 2,
    Manual = 3,
};

const char* provenanceName(Provenance p);

enum class BlendMode : uint8_t {
    Normal = 0,
    Multiply = 1,
    Screen = 2,
    Darken = 3,
    Lighten = 4,
};

const char* blendModeName(BlendMode b);

enum class LayerType : uint8_t {
    Background = 0,
    Object = 1,
    Shadow = 2,
    Reflection = 3,
    TransparentEffect = 4,
    Text = 5,
};

const char* layerTypeName(LayerType t);

// Mirrors the persisted pipeline state machine from the master brief §6.
enum class PipelineStage : uint8_t {
    Ingest = 0,
    Normalize,
    DomainClassify,
    Pyramid,
    Inventory,
    ModalSegment,
    TextDetect,
    LayerDepth,
    OcclusionGraph,
    Peel,
    RefineVisibleMask,
    PredictAmodalMask,
    CompleteObjectAppearance,
    AssociateShadowsEffects,
    QualityCheck,
    BackgroundComplete,
    Reinventory,
    Recompose,
    GlobalQC,
    Edit,
    Done,
    Failed,
};

const char* pipelineStageName(PipelineStage s);

} // namespace unflatten
