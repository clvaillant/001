#pragma once
#include <memory>
#include <vector>
#include <string>
#include <optional>
#include "document/project.h"

namespace unflatten {

// Wraps one open Project with the mutation operations the editor UI needs,
// plus whole-project-snapshot undo/redo. Pure C++ (no JNI), so every
// operation is host-testable.
//
// Undo strategy: a stack of serialized UF7P snapshots (DECISIONS.md notes
// this is intentionally the simple, robust choice over command-based diff
// undo, given this build's scope -- see KNOWN_LIMITATIONS.md for the memory
// cost tradeoff on very large projects).
class EngineSession {
public:
    explicit EngineSession(std::unique_ptr<Project> project);

    Project& project() { return *project_; }
    const Project& project() const { return *project_; }

    void pushUndoSnapshot();
    bool canUndo() const { return !undoStack_.empty(); }
    bool canRedo() const { return !redoStack_.empty(); }
    bool undo();
    bool redo();

    bool setLayerVisible(LayerId id, bool visible);
    bool setLayerOpacity(LayerId id, float opacity);
    bool setLayerBlendMode(LayerId id, BlendMode mode);
    bool renameLayer(LayerId id, const std::string& name);
    bool moveLayer(LayerId id, int32_t newIndex); // reorders within `layers` and renumbers depthIndex
    bool deleteLayer(LayerId id);

    // Paints a stroke from (x0,y0) to (x1,y1) (canvas-space) with the given
    // radius into the layer's visible mask/alpha. `add` restores pixels
    // (copying color from the project's source image) and marks them
    // Provenance::Manual; !add clears them (alpha -> 0). Brief §29
    // "mask-add brush / mask-subtract brush".
    bool maskBrushStroke(LayerId id, float x0, float y0, float x1, float y1, float radiusPx, bool add);

    // Flattens the given layers (must all exist) into one new layer at the
    // draw position of the topmost of them, in their current relative draw
    // order, Normal blending only (blend modes of merged layers are not
    // preserved -- see KNOWN_LIMITATIONS.md). Returns the new layer's id, or
    // nullopt if fewer than 2 valid layers were given.
    std::optional<LayerId> mergeLayers(const std::vector<LayerId>& ids, const std::string& newName);

    // Splits a layer into its 4-connected mask components (reusing the same
    // connected-component algorithm as fallback segmentation). No-op
    // (returns empty) if the layer has 0 or 1 components already.
    std::vector<LayerId> splitLayer(LayerId id);

    // Discards ALL layers and edits, resetting the project to freshly-
    // imported state (PipelineStage::Ingest). The immutable source image is
    // untouched throughout a session's lifetime regardless (§50), so this
    // is always available and always exact.
    void restoreOriginal();

    // Re-runs only the deterministic-fallback background-fill step using
    // the current set of Object/Shadow/etc. layer masks as the removal
    // region, replacing the Background layer. Real, tested, but still the
    // fallback (non-learned) inpainting tier -- see DECISIONS.md.
    bool regenerateBackgroundFallback();

private:
    void renumberDepthIndices();
    std::unique_ptr<Project> project_;
    std::vector<std::vector<uint8_t>> undoStack_;
    std::vector<std::vector<uint8_t>> redoStack_;
    static constexpr size_t kMaxUndo = 20;
};

} // namespace unflatten
