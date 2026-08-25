package com.unflatten.offline.ui.editor

import android.app.Application
import android.graphics.Bitmap
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.unflatten.offline.data.ImageImport
import com.unflatten.offline.engine.Engine
import com.unflatten.offline.engine.LayerId
import com.unflatten.offline.engine.LayerInfo
import com.unflatten.offline.engine.PipelineStage
import com.unflatten.offline.diagnostics.DeviceDiagnostics
import com.unflatten.offline.export.MediaStoreExporter
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

sealed interface EditorUiState {
    data object Empty : EditorUiState
    data object Importing : EditorUiState
    data object Decomposing : EditorUiState
    data class Ready(
        val composite: Bitmap,
        val layers: List<LayerInfo>,
        val selectedLayer: LayerId?,
        val pipelineStage: PipelineStage,
        val qcError: Double,
        val stageNotes: List<String>,
        val showProvenance: Boolean,
        val exportMessage: String?,
    ) : EditorUiState
    data class Failed(val reason: String) : EditorUiState
}

/**
 * Owns the native [Engine] session for the currently open project and
 * exposes editor state to Compose. Every mutation re-pulls the composite
 * bitmap + layer list from native rather than trying to track UI-side
 * deltas -- simpler and always consistent with native ground truth, at the
 * cost of a full composite re-render per edit (acceptable at this build's
 * target resolution on the target device class; see KNOWN_LIMITATIONS.md
 * for the scaling caveat on very large canvases).
 */
class EditorViewModel(application: Application) : AndroidViewModel(application) {

    private val _state = MutableStateFlow<EditorUiState>(EditorUiState.Empty)
    val state: StateFlow<EditorUiState> = _state.asStateFlow()

    private var engine: Engine? = null
    private var selectedLayer: LayerId? = null
    private var showProvenance: Boolean = false

    private val autosaveFile: File
        get() = File(getApplication<Application>().filesDir, "autosave.uf7p")

    fun importAndDecompose(uri: Uri) {
        viewModelScope.launch {
            _state.value = EditorUiState.Importing
            val bitmap = withContext(Dispatchers.IO) { ImageImport.decode(getApplication(), uri) }
            if (bitmap == null) {
                _state.value = EditorUiState.Failed("Could not decode the selected image.")
                return@launch
            }
            engine?.close()
            val newEngine = withContext(Dispatchers.Default) { Engine.create(bitmap) }
            engine = newEngine
            selectedLayer = null

            _state.value = EditorUiState.Decomposing
            val ok = withContext(Dispatchers.Default) { newEngine.runFallbackDecomposition() }
            if (!ok) {
                _state.value = EditorUiState.Failed(newEngine.lastFailureReason())
                return@launch
            }
            persistAutosave()
            refresh()
        }
    }

    fun loadFromBytes(bytes: ByteArray) {
        viewModelScope.launch {
            engine?.close()
            val loaded = withContext(Dispatchers.Default) { Engine.load(bytes) }
            if (loaded == null) {
                _state.value = EditorUiState.Failed("Project file could not be loaded (corrupt or unsupported format).")
                return@launch
            }
            engine = loaded
            selectedLayer = null
            refresh()
        }
    }

    private fun persistAutosave() {
        val bytes = engine?.saveProjectBytes() ?: return
        runCatching { autosaveFile.writeBytes(bytes) }
    }

    fun hasAutosave(): Boolean = autosaveFile.exists()
    fun loadAutosave() {
        if (autosaveFile.exists()) loadFromBytes(autosaveFile.readBytes())
    }

    fun selectLayer(id: LayerId?) { selectedLayer = id; refresh() }
    fun toggleProvenance() { showProvenance = !showProvenance; refresh() }

    fun setVisible(id: LayerId, visible: Boolean) = mutate { it.setVisible(id, visible) }
    fun setOpacity(id: LayerId, opacity: Float) = mutate { it.setOpacity(id, opacity) }
    fun rename(id: LayerId, name: String) = mutate { it.rename(id, name) }
    fun moveLayer(id: LayerId, newIndex: Int) = mutate { it.move(id, newIndex) }
    fun deleteLayer(id: LayerId) = mutate { if (selectedLayer == id) selectedLayer = null; it.delete(id) }
    fun maskStroke(id: LayerId, x0: Float, y0: Float, x1: Float, y1: Float, radius: Float, add: Boolean) =
        mutate { it.maskBrushStroke(id, x0, y0, x1, y1, radius, add) }
    fun undo() = mutate { it.undo() }
    fun redo() = mutate { it.redo() }
    fun restoreOriginal() = mutate { it.restoreOriginal(); true }
    fun regenerateBackground() = mutate { it.regenerateBackground() }

    private fun mutate(op: (Engine) -> Boolean) {
        val e = engine ?: return
        op(e)
        persistAutosave()
        refresh()
    }

    fun exportBundle() {
        val e = engine ?: return
        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) {
                MediaStoreExporter.exportBundle(getApplication(), e, "project_${System.currentTimeMillis()}")
            }
            val current = _state.value
            if (current is EditorUiState.Ready) {
                _state.value = current.copy(exportMessage = "Exported ${result.fileCount} files to ${result.folderLabel}")
            }
        }
    }

    fun exportDiagnostics() {
        val e = engine
        viewModelScope.launch {
            val file = withContext(Dispatchers.IO) {
                val json = DeviceDiagnostics.collect(getApplication(), e, saveResult = "ok", exportResult = null)
                DeviceDiagnostics.writeToAppPrivateStorage(getApplication(), json)
            }
            val current = _state.value
            if (current is EditorUiState.Ready) {
                _state.value = current.copy(exportMessage = "Diagnostics written to ${file.absolutePath}")
            }
        }
    }

    fun dismissExportMessage() {
        val current = _state.value
        if (current is EditorUiState.Ready) _state.value = current.copy(exportMessage = null)
    }

    private fun refresh() {
        val e = engine ?: run { _state.value = EditorUiState.Empty; return }
        _state.value = EditorUiState.Ready(
            composite = e.compositeBitmap(),
            layers = e.layers(),
            selectedLayer = selectedLayer,
            pipelineStage = e.pipelineStage(),
            qcError = e.qcError(),
            stageNotes = e.stageNotes(),
            showProvenance = showProvenance,
            exportMessage = (_state.value as? EditorUiState.Ready)?.exportMessage,
        )
    }

    override fun onCleared() {
        engine?.close()
        engine = null
    }
}
