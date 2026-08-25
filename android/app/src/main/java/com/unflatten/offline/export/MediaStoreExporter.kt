package com.unflatten.offline.export

import android.content.ContentValues
import android.content.Context
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import com.unflatten.offline.engine.Engine
import com.unflatten.offline.engine.LayerBufferKind
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.OutputStream

/**
 * Writes the brief's required PNG-stack + PSD export bundle (§30) to a
 * user-visible location without requesting any runtime storage permission
 * (§32): MediaStore's Downloads collection on API 29+ (this app's real
 * target, the Galaxy S25 Ultra on Android 15, is far above that floor), or
 * the app-specific external files directory as a permission-free fallback
 * on API 26-28 (documented in KNOWN_LIMITATIONS.md -- those files land
 * under Android/data/<package>/files/Unflatten/ rather than the shared
 * Downloads collection, still reachable via a file manager, just not as
 * conveniently).
 */
object MediaStoreExporter {

    data class ExportResult(val folderLabel: String, val fileCount: Int)

    fun exportBundle(context: Context, engine: Engine, projectName: String): ExportResult {
        val relativeDir = "Unflatten/$projectName"
        var count = 0

        fun write(name: String, mime: String, bytes: ByteArray) {
            writeOneFile(context, relativeDir, name, mime, bytes)
            count++
        }

        write("composite.png", "image/png", engine.exportCompositePng())
        write("source.png", "image/png", engine.exportSourcePng())
        write("unflatten_project.psd", "application/octet-stream", engine.exportPsd())
        // Native UF7P project bytes, so this export bundle is also a valid
        // "Save Project" the user can later reopen (§53 item 11) via
        // ImportScreen's "Open project file" picker, not just the
        // internal autosave.
        write("project.uf7p", "application/octet-stream", engine.saveProjectBytes())

        val layers = engine.layers()
        val metadataLayers = JSONArray()
        layers.forEachIndexed { index, layer ->
            val n = "%04d".format(index + 1)
            write("layer_${n}_rgba.png", "image/png", engine.exportLayerPng(layer.id, LayerBufferKind.RGBA))
            write(
                "layer_${n}_visible_mask.png", "image/png",
                engine.exportLayerPng(layer.id, LayerBufferKind.VISIBLE_MASK)
            )
            write(
                "layer_${n}_amodal_mask.png", "image/png",
                engine.exportLayerPng(layer.id, LayerBufferKind.AMODAL_MASK)
            )
            // NOTE: brief §30 asks for a per-layer confidence.png. No model
            // in this build produces a numeric per-pixel confidence score
            // (see DECISIONS.md / MODEL_MANIFEST.json) -- exporting a
            // fabricated one would violate §52. We export the provenance
            // overlay instead, honestly named, as the closest real signal
            // this build has.
            write(
                "layer_${n}_provenance_overlay.png", "image/png",
                engine.exportLayerPng(layer.id, LayerBufferKind.PROVENANCE_OVERLAY)
            )

            metadataLayers.put(JSONObject().apply {
                put("index", index + 1)
                put("name", layer.name)
                put("type", layer.type.name)
                put("depth_index", layer.depthIndex)
                put("opacity", layer.opacity)
                put("blend_mode", layer.blendMode.name)
                put("bounds", JSONObject().apply {
                    put("x", layer.boundsX); put("y", layer.boundsY)
                    put("w", layer.boundsW); put("h", layer.boundsH)
                })
                put("generation_pass", layer.generationPass)
                put("inferred_or_manual_fraction", layer.inferredOrManualFraction)
            })
        }

        val metadata = JSONObject().apply {
            put("format", "unflatten-offline-export-v1")
            put("pipeline_stage", engine.pipelineStage().name)
            put("qc_observed_region_mean_abs_error", engine.qcError())
            put("layers", metadataLayers)
            put("note", "All non-OBSERVED pixels in this export were produced by this build's deterministic " +
                "fallback CV pipeline (heuristic segmentation / diffusion inpainting), not by a trained model. " +
                "See DECISIONS.md and MODEL_MANIFEST.json in the app repository.")
        }
        write("metadata.json", "application/json", metadata.toString(2).toByteArray())

        val label = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) "Downloads/$relativeDir" else "Android/data files/$relativeDir"
        return ExportResult(label, count)
    }

    private fun writeOneFile(context: Context, relativeDir: String, name: String, mime: String, bytes: ByteArray) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, name)
                put(MediaStore.MediaColumns.MIME_TYPE, mime)
                put(MediaStore.MediaColumns.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/$relativeDir")
            }
            val uri = context.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                ?: error("MediaStore insert failed for $name")
            context.contentResolver.openOutputStream(uri)?.use { out: OutputStream -> out.write(bytes) }
        } else {
            val dir = File(context.getExternalFilesDir(null), relativeDir)
            dir.mkdirs()
            File(dir, name).writeBytes(bytes)
        }
    }
}
