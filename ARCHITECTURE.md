# ARCHITECTURE.md — Unflatten Offline

## Module layout

```
android/
  app/
    src/main/java/com/unflatten/offline/
      MainActivity.kt              single-activity Compose shell
      UnflattenApplication.kt
      engine/                      Kotlin JNI wrapper (NativeEngine, Engine, enums, wire-format reader)
      ui/                          Compose screens (Import, Editor, LayerRow)
      ui/editor/EditorViewModel.kt owns the native Engine handle + UI state
      data/ImageImport.kt          EXIF-aware decode + downsample
      export/MediaStoreExporter.kt PNG/PSD/UF7P bundle export, no storage permission
      diagnostics/DeviceDiagnostics.kt  offline-only diagnostics JSON
    src/main/cpp/
      CMakeLists.txt               Android/NDK build (produces libunflatten_engine.so)
      engine/                      pure C++17, NO Android/JNI dependency (host-testable)
        common/types.{h,cpp}       shared enums (Provenance, BlendMode, LayerType, PipelineStage)
        common/connected_components.{h,cpp}
        tiling/pixel_buffer.h, tiled_image.h, provenance_map.h
        document/layer.{h,cpp}, project.{h,cpp}, occlusion_graph.h
        io/byte_io.h, big_endian_io.h, zlib_util.h, uf7p_format.{h,cpp}, png_writer.{h,cpp}, psd_writer.{h,cpp}
        fallback/segmentation_fallback.{h,cpp}, inpaint_fallback.{h,cpp}
        api.{h,cpp}                 pipeline facade (createProjectFromImage, runFallbackDecomposition)
        session.{h,cpp}             editor mutation operations + undo/redo
      jni/jni_bridge.cpp            the ONLY Android/JNI-specific file; thin marshaling only
  native_host_tests/                host-compiled test suite (35 cases), see TEST_REPORT.md
```

The `engine/` directory is deliberately isolated from JNI so it can be
(and is) compiled and tested on a plain Linux host with no Android SDK.
`jni/jni_bridge.cpp` is the only file that includes `<jni.h>`.

## UF7P project file format

```
[4B  magic "UF7P"]
[4B  format version, currently 1]
[chunk record]*                one per: ProjectMeta, SourceImage, OcclusionGraphEdges, Layer(×N)
[manifest frame]                "MANI" + crc32 + length + {type,id,offset,recordLen}×N
[12B footer: "UFTL" + u64 manifest offset]
```

Each **chunk record** is self-describing and independently verifiable:

```
[u8  chunk type][u32 chunk id][u32 uncompressed length]
[u32 compressed length][u32 CRC32 of compressed bytes][compressed bytes...]
```

A reader seeks to the footer (last 12 bytes), reads the manifest offset,
verifies the manifest's own CRC32, then iterates its chunk descriptors. Any
single chunk that fails its CRC or fails to decompress is **skipped with a
warning**, not treated as fatal for the whole file — one corrupt layer
doesn't take down the rest of the project (see
`UF7P_CorruptedLayerChunk_IsSkippedNotFatal` in `native_host_tests`). A bad
magic number, unsupported format version, or missing/corrupt footer/manifest
*is* fatal, and is reported as such (never silently "recovered" into
garbage).

Pixel data (`TiledImage`) is stored per-tile: `[i32 tx][i32 ty][u32
uncompressedLen][u32 compressedLen][u32 crc32][compressed bytes]`, tile size
512×512 (see DECISIONS.md #4 for the size rationale). Only tiles a layer
actually touches are serialized — a small object layer on an 8000×8000
canvas costs only the tiles it occupies, not the whole canvas.

Provenance (`ProvenanceMap`) is a dense 1-byte-per-pixel buffer over a
layer's own bounds, zlib-compressed at rest (highly compressible since
provenance is spatially coherent — whole regions share one value).

## Pipeline state machine

`PipelineStage` (Kotlin: `engine/EngineTypes.kt`; C++:
`engine/common/types.h`) mirrors brief §6's 22-state machine exactly, in
ordinal order on both sides (guarded by `EngineTypesTest` in Kotlin). The
project's current stage, per-stage notes, and any failure reason are part
of the persisted `ProjectMeta` chunk, so process death mid-pipeline leaves
a project file that at least records where it stopped (see
KNOWN_LIMITATIONS.md for what "resuming" a partially-run pipeline does and
doesn't do in this build).

`api::runFallbackDecomposition()` (`engine/api.cpp`) drives the whole
sequence in one call for this build (INVENTORY through EDIT), since every
learned-model stage is a documented no-op — see BUILD_REPORT.md §2 for
exactly which stages do real work and which don't in this build, and
INFERENCE_CARD.md for how a real model would plug into the same state
machine later.

## Compositing / draw order

`Project::drawOrder()` sorts layers by `depthIndex` ascending, then asks
the `OcclusionGraph` for a topological refinement of that order (an
occlusion edge `A -> B` means "A occludes B", so B must draw first). If the
graph is empty (this build never populates it — no depth/occlusion model is
implemented) or cyclic (a self-contradictory user/heuristic edit), the
`depthIndex`-sorted order is used directly. See the large comment in
`project.h` explaining the bug this fixed (an empty graph's trivial
"topological order" is just insertion order, which is *not* the same thing
as depth order, and this build's pipeline inserts layers in an order that
would otherwise be wrong).

`Project::compositeAll()` walks that order back-to-front, alpha-compositing
each visible layer (opacity + blend mode applied) into one canvas-sized
buffer. This is also the function the cycle-consistency QC metric
(`api::observedRegionReconstructionError`) compares against the source
image (brief §23).

## JNI surface

`jni_bridge.cpp` exposes one native project handle per open document
(`EngineSession`, reference-counted via a `std::unordered_map<jlong, ...>`
under a mutex). Every operation the Kotlin editor needs is one JNI call:
layer CRUD, mask brush strokes, merge/split, undo/redo, save/load
(UF7P bytes in/out), and PNG/PSD export. Layer metadata crosses the
boundary as a compact little-endian binary blob (`encodeLayersMeta`,
mirrored by Kotlin's `BinaryReader`/`parseLayersMeta`) rather than JSON, to
avoid a JSON dependency for an internal, fixed-shape, high-frequency
message.

## Editor state (Kotlin)

`EditorViewModel` owns exactly one `Engine` (the Kotlin wrapper around a
native handle) for the app's lifetime. Every mutating call
(`setVisible`, `maskStroke`, `merge`, ...) re-pulls the full layer list and
re-composites the canvas from native ground truth rather than tracking
UI-side deltas — simpler to keep correct, at the cost of a full recomposite
per edit (see KNOWN_LIMITATIONS.md for the scaling caveat this implies on
very large canvases with many layers, never measured on-device in this
build).

Process-death resilience: every mutation triggers an autosave to
app-private storage (`filesDir/autosave.uf7p`); `MainActivity` offers
"Resume last project" on next launch if that file exists. This is a
different mechanism from Activity recreation (rotation), which the
ViewModel already survives via the standard `ViewModelStore` — a raw JNI
`jlong` handle cannot itself survive process death, so the autosave file is
what actually gets reloaded (a fresh native session is created from it).
