#pragma once
#include <vector>
#include <cstdint>
#include <string>
#include <memory>
#include "../document/project.h"

// UF7P project file format. See ARCHITECTURE.md for the full on-disk layout
// diagram; this header only exposes the serialize/deserialize entry points
// used by the JNI bridge and by native_host_tests.
namespace unflatten {

enum class ChunkType : uint8_t {
    ProjectMeta = 1,
    SourceImage = 2,
    Layer = 3,
    OcclusionGraphEdges = 4,
};

struct LoadWarning {
    std::string message;
};

// Deserialization never throws past this boundary: a corrupt/truncated file
// yields fatal=true with fatalError set (brief §35 "project corruption
// detection"); a corrupt individual chunk (e.g. one damaged layer) is
// skipped with a warning rather than failing the whole load, so the rest of
// the project remains recoverable (brief §28 "journal/transaction
// recovery" intent -- see DECISIONS.md for what incremental-save scope this
// build actually implements vs. defers).
struct LoadResult {
    std::unique_ptr<Project> project;
    std::vector<LoadWarning> warnings;
    bool fatal = false;
    std::string fatalError;
};

std::vector<uint8_t> serializeProject(const Project& project);
LoadResult deserializeProject(const std::vector<uint8_t>& fileBytes);

} // namespace unflatten
