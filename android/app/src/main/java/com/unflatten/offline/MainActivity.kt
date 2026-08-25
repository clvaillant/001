package com.unflatten.offline

import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.unflatten.offline.ui.ImportScreen
import com.unflatten.offline.ui.editor.EditorScreen
import com.unflatten.offline.ui.editor.EditorUiState
import com.unflatten.offline.ui.editor.EditorViewModel
import com.unflatten.offline.ui.theme.UnflattenTheme

/**
 * Single-activity app. `singleTask` + `configChanges` in the manifest keep
 * this Activity alive across rotation (brief §33 "survive activity
 * recreation"); the ViewModel (not this Activity) owns the native Engine
 * handle and survives configuration changes on its own via the standard
 * ViewModelStore mechanism. Process death is handled separately via the
 * autosave file (see EditorViewModel.persistAutosave/loadAutosave) since a
 * raw JNI handle cannot be restored from a Bundle.
 */
class MainActivity : ComponentActivity() {

    private val viewModel: EditorViewModel by viewModels()

    private val pickImage = registerForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri: Uri? ->
        uri?.let { viewModel.importAndDecompose(it) }
    }

    private val openProjectFile = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        uri?.let { u ->
            contentResolver.openInputStream(u)?.use { input ->
                viewModel.loadFromBytes(input.readBytes())
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // "Share to Unflatten" entry point (brief §31).
        if (intent?.action == android.content.Intent.ACTION_SEND && intent.type?.startsWith("image/") == true) {
            @Suppress("DEPRECATION")
            val sharedUri = intent.getParcelableExtra<Uri>(android.content.Intent.EXTRA_STREAM)
            sharedUri?.let { viewModel.importAndDecompose(it) }
        }

        setContent {
            UnflattenTheme {
                Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    AppRoot(
                        viewModel = viewModel,
                        onPickImage = { pickImage.launch(androidx.activity.result.PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                        onOpenProjectFile = { openProjectFile.launch(arrayOf("*/*")) },
                    )
                }
            }
        }
    }
}

@Composable
private fun AppRoot(viewModel: EditorViewModel, onPickImage: () -> Unit, onOpenProjectFile: () -> Unit) {
    val state by viewModel.state.collectAsState()

    when (val s = state) {
        is EditorUiState.Empty -> ImportScreen(
            hasAutosave = viewModel.hasAutosave(),
            onPickImage = onPickImage,
            onResumeAutosave = { viewModel.loadAutosave() },
            onOpenProjectFile = onOpenProjectFile,
        )
        is EditorUiState.Importing -> LoadingScreen("Decoding image…")
        is EditorUiState.Decomposing -> LoadingScreen("Running on-device decomposition (deterministic fallback pipeline)…")
        is EditorUiState.Failed -> FailedScreen(s.reason, onPickImage)
        is EditorUiState.Ready -> EditorScreen(
            state = s,
            onImportClicked = onPickImage,
            onSelectLayer = viewModel::selectLayer,
            onSetVisible = viewModel::setVisible,
            onSetOpacity = viewModel::setOpacity,
            onRename = viewModel::rename,
            onMoveUp = { id -> moveRelative(s, id, +1, viewModel) },
            onMoveDown = { id -> moveRelative(s, id, -1, viewModel) },
            onDelete = viewModel::deleteLayer,
            onUndo = viewModel::undo,
            onRedo = viewModel::redo,
            onToggleProvenance = viewModel::toggleProvenance,
            onRestoreOriginal = viewModel::restoreOriginal,
            onRegenerateBackground = viewModel::regenerateBackground,
            onExport = viewModel::exportBundle,
            onExportDiagnostics = viewModel::exportDiagnostics,
            onDismissExportMessage = viewModel::dismissExportMessage,
            onMaskStroke = viewModel::maskStroke,
        )
    }
}

/** Converts "move up/down one row in the depth-sorted list" into the native moveLayer's absolute target index. */
private fun moveRelative(
    state: EditorUiState.Ready,
    id: com.unflatten.offline.engine.LayerId,
    delta: Int,
    viewModel: EditorViewModel,
) {
    val sorted = state.layers.sortedBy { it.depthIndex }
    val currentIndex = sorted.indexOfFirst { it.id == id }
    if (currentIndex < 0) return
    val targetIndex = (currentIndex + delta).coerceIn(0, sorted.size - 1)
    viewModel.moveLayer(id, targetIndex)
}

@Composable
private fun LoadingScreen(message: String) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        androidx.compose.foundation.layout.Column(horizontalAlignment = Alignment.CenterHorizontally) {
            CircularProgressIndicator()
            Text(message, modifier = Modifier.padding(top = 16.dp))
        }
    }
}

@Composable
private fun FailedScreen(reason: String, onRetry: () -> Unit) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        androidx.compose.foundation.layout.Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Decomposition failed", style = MaterialTheme.typography.titleLarge)
            Text(reason, modifier = Modifier.padding(top = 8.dp, start = 24.dp, end = 24.dp))
            androidx.compose.material3.Button(onClick = onRetry, modifier = Modifier.padding(top = 16.dp)) {
                Text("Choose another photo")
            }
        }
    }
}
