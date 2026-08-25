#pragma once
#include <memory>
#include <string>
#include "document/project.h"

// High-level facade the JNI bridge (and native_host_tests) call into. Pure
// C++, no Android/JNI types, so every operation here is unit-testable on
// the host build without an Android device.
namespace unflatten {
namespace api {

std::unique_ptr<Project> createProjectFromImage(const PixelBuffer& sourceImage, const std::string& projectUuid);

// Runs INVENTORY through EDIT using ONLY the deterministic fallback tier
// (DECISIONS.md #1.3, #7): no learned model is used anywhere in this
// function. Adds one Object layer per detected foreground instance and one
// Background layer with removed regions diffusion-filled. Advances
// project.pipelineStage through the brief §6 state machine; stages with no
// implementation in this build are still assigned (so the persisted state
// machine is complete and inspectable) but perform no work, and that is
// recorded in `project.stageNotes` for each such stage.
//
// On success, pipelineStage ends at PipelineStage::Edit. On a degenerate
// input (e.g. uniform image with no detectable foreground), pipelineStage
// ends at PipelineStage::Failed with lastFailureReason set -- this function
// never crashes or silently fabricates a layer for an image it found
// nothing in (brief §48).
void runFallbackDecomposition(Project& project);

// Cycle-consistency check (brief §23): mean absolute per-channel pixel
// difference between compositeAll() and the source image, evaluated ONLY
// at pixels the union hole mask marks as still-observed (i.e. excluded from
// any inpainted/generated region). A correct decomposition that has not
// resynthesized any observed pixel should score at or near 0.0. Returns
// -1.0 if there are no observed comparison pixels to evaluate (e.g. empty
// canvas).
double observedRegionReconstructionError(const Project& project);

} // namespace api
} // namespace unflatten
