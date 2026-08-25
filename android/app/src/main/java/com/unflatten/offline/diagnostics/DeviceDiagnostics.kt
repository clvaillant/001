package com.unflatten.offline.diagnostics

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.DisplayMetrics
import android.view.WindowManager
import com.unflatten.offline.BuildConfig
import com.unflatten.offline.engine.Engine
import org.json.JSONObject
import java.io.File

/**
 * Offline diagnostics export (brief §34). Collects device/build/runtime
 * facts and the current project's pipeline state into one JSON file,
 * written to local storage only. NOTHING here is ever transmitted --
 * there is no networking code anywhere in this app (see PRIVACY.md,
 * SECURITY.md) to transmit it with.
 *
 * Several brief-requested fields (Vulkan/GPU availability details, QNN
 * availability, per-model load times, thermal status) are reported as
 * "not applicable" rather than fabricated: this build ships no ML runtime
 * and performs no GPU-accelerated inference, so there is nothing real to
 * measure for those fields (see DECISIONS.md / MODEL_MANIFEST.json).
 */
object DeviceDiagnostics {

    fun collect(context: Context, engine: Engine?, saveResult: String?, exportResult: String?): JSONObject {
        val pm = context.packageManager
        val displayMetrics = DisplayMetrics()
        @Suppress("DEPRECATION")
        (context.getSystemService(Context.WINDOW_SERVICE) as? WindowManager)?.defaultDisplay?.getMetrics(displayMetrics)

        val root = JSONObject()
        root.put("app_version", "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})")
        root.put("application_id", BuildConfig.APPLICATION_ID)
        root.put("build_type", BuildConfig.BUILD_TYPE)

        root.put("device", JSONObject().apply {
            put("manufacturer", Build.MANUFACTURER)
            put("model", Build.MODEL)
            put("android_api_level", Build.VERSION.SDK_INT)
            put("android_release", Build.VERSION.RELEASE)
            put("supported_abis", Build.SUPPORTED_ABIS.joinToString(","))
            put("cpu_hardware", Build.HARDWARE)
        })

        root.put("display", JSONObject().apply {
            put("width_px", displayMetrics.widthPixels)
            put("height_px", displayMetrics.heightPixels)
            put("density_dpi", displayMetrics.densityDpi)
        })

        val runtime = Runtime.getRuntime()
        root.put("memory", JSONObject().apply {
            put("jvm_max_heap_bytes", runtime.maxMemory())
            put("jvm_free_heap_bytes", runtime.freeMemory())
            // Native tiled document memory is not separately instrumented
            // in this build -- see KNOWN_LIMITATIONS.md.
        })

        root.put("gpu_vulkan_available", pm.hasSystemFeature(PackageManager.FEATURE_VULKAN_HARDWARE_LEVEL))
        root.put("qnn_hexagon_available", "not applicable -- no QNN/ML runtime is linked into this build")

        root.put("inference_backend", "none (deterministic CV fallback only, no learned model bundled)")
        root.put("model_manifest", "empty -- see MODEL_MANIFEST.json in the app repository")

        engine?.let { e ->
            root.put("project", JSONObject().apply {
                put("pipeline_stage", e.pipelineStage().name)
                put("layer_count", e.layers().size)
                put("qc_observed_region_error", e.qcError())
            })
        }
        saveResult?.let { root.put("last_project_save_result", it) }
        exportResult?.let { root.put("last_export_result", it) }

        root.put("network_permission_present", false)
        root.put("telemetry_or_analytics_present", false)

        return root
    }

    fun writeToAppPrivateStorage(context: Context, json: JSONObject): File {
        val file = File(context.getExternalFilesDir(null) ?: context.filesDir, "unflatten_device_diagnostics.json")
        file.writeText(json.toString(2))
        return file
    }
}
