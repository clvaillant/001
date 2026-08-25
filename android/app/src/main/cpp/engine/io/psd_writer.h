#pragma once
#include <vector>
#include <cstdint>
#include "../document/project.h"

namespace unflatten {

// Encodes a Project as a real layered Adobe Photoshop (.psd) file: RGB 8-bit
// color mode, one PSD layer per Unflatten layer (name, bounds, RGBA
// channels, opacity, blend mode, visibility), plus a flattened RGB merged
// preview image (required trailing section of the format). Internal
// metadata the PSD format has no slot for (provenance, amodal masks,
// pipeline stage, occlusion graph, generation metadata) is NOT encoded into
// this file -- it round-trips only through the native UF7P project format
// (brief §30: "If the PSD format cannot represent some internal metadata,
// preserve it in JSON/project format").
//
// Compression: channel data is written uncompressed (PSD compression
// method 0), trading file size for implementation simplicity/correctness
// -- see DECISIONS.md. This is spec-legal; readers do not require RLE.
//
// IMPORTANT — verification status (see TEST_REPORT.md): this writer is
// validated by PsdWriterTest, which independently re-parses its own output
// byte-for-byte against the PSD structural spec (section lengths, channel
// counts, layer record fields) and checks round-tripped pixel data matches
// the source layers exactly. It has NOT been opened in Adobe Photoshop,
// Photopea, Affinity Photo, or Krita, because none of those tools are
// available in this build environment. Do not represent this as
// interop-tested against real Photoshop-family software until it has
// actually been opened in one.
std::vector<uint8_t> encodePsd(const Project& project);

} // namespace unflatten
