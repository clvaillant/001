package com.unflatten.offline.ui.editor

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import com.unflatten.offline.engine.LayerId
import com.unflatten.offline.engine.LayerInfo
import com.unflatten.offline.engine.LayerType

/**
 * The main editing surface: composite canvas (pinch-zoom/pan, §29), layer
 * panel, and toolbar. Mask brush editing is a distinct mode (toggled per
 * selected layer) rather than always-on, so ordinary pan/zoom gestures
 * never accidentally paint.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EditorScreen(
    state: EditorUiState.Ready,
    onImportClicked: () -> Unit,
    onSelectLayer: (LayerId?) -> Unit,
    onSetVisible: (LayerId, Boolean) -> Unit,
    onSetOpacity: (LayerId, Float) -> Unit,
    onRename: (LayerId, String) -> Unit,
    onMoveUp: (LayerId) -> Unit,
    onMoveDown: (LayerId) -> Unit,
    onDelete: (LayerId) -> Unit,
    onUndo: () -> Unit,
    onRedo: () -> Unit,
    onToggleProvenance: () -> Unit,
    onRestoreOriginal: () -> Unit,
    onRegenerateBackground: () -> Unit,
    onExport: () -> Unit,
    onExportDiagnostics: () -> Unit,
    onDismissExportMessage: () -> Unit,
    onMaskStroke: (LayerId, Float, Float, Float, Float, Float, Boolean) -> Unit,
) {
    var scale by remember { mutableFloatStateOf(1f) }
    var offset by remember { mutableStateOf(Offset.Zero) }
    var brushMode by remember { mutableStateOf(false) }
    var brushAdd by remember { mutableStateOf(true) }
    var lastDragCanvasPoint by remember { mutableStateOf<Offset?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Unflatten Offline") },
                actions = {
                    IconButton(onClick = onImportClicked) { Icon(Icons.Default.Add, "Import") }
                    TextButton(onClick = onUndo) { Text("Undo") }
                    TextButton(onClick = onRedo) { Text("Redo") }
                    TextButton(onClick = onToggleProvenance) {
                        Text(if (state.showProvenance) "Provenance: ON" else "Provenance: OFF")
                    }
                    IconButton(onClick = onExport) { Icon(Icons.Default.Share, "Export") }
                    IconButton(onClick = onExportDiagnostics) { Icon(Icons.Default.Info, "Export diagnostics") }
                }
            )
        }
    ) { padding ->
        Row(Modifier.padding(padding).fillMaxSize()) {
            Box(
                Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .background(MaterialTheme.colorScheme.surfaceVariant)
                    .pointerInput(brushMode, state.selectedLayer) {
                        if (!brushMode || state.selectedLayer == null) return@pointerInput
                        detectDragGestures(
                            onDragStart = { lastDragCanvasPoint = screenToCanvas(it, scale, offset) },
                            onDragEnd = { lastDragCanvasPoint = null },
                        ) { change, _ ->
                            val canvasPoint = screenToCanvas(change.position, scale, offset)
                            val prev = lastDragCanvasPoint ?: canvasPoint
                            onMaskStroke(state.selectedLayer, prev.x, prev.y, canvasPoint.x, canvasPoint.y, 24f, brushAdd)
                            lastDragCanvasPoint = canvasPoint
                        }
                    }
                    .pointerInput(brushMode) {
                        if (brushMode) return@pointerInput
                        detectTransformGestures { _, pan, zoom, _ ->
                            scale = (scale * zoom).coerceIn(0.2f, 8f)
                            offset += pan
                        }
                    }
            ) {
                Image(
                    bitmap = state.composite.asImageBitmap(),
                    contentDescription = "Composite canvas",
                    modifier = Modifier
                        .align(Alignment.Center)
                        .graphicsLayer(
                            scaleX = scale, scaleY = scale,
                            translationX = offset.x, translationY = offset.y,
                        )
                )
                Column(Modifier.align(Alignment.BottomStart).padding(8.dp)) {
                    Text(
                        "Stage: ${state.pipelineStage} | QC observed-region error: %.2f".format(state.qcError),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.labelSmall,
                    )
                }
            }

            Surface(Modifier.width(320.dp).fillMaxHeight(), tonalElevation = 2.dp) {
                Column(Modifier.padding(8.dp)) {
                    Text("Layers", style = MaterialTheme.typography.titleMedium)
                    LazyColumn(Modifier.weight(1f)) {
                        items(state.layers.sortedByDescending { it.depthIndex }) { layer ->
                            LayerRow(
                                layer = layer,
                                selected = layer.id == state.selectedLayer,
                                onSelect = { onSelectLayer(if (state.selectedLayer == layer.id) null else layer.id) },
                                onSetVisible = { onSetVisible(layer.id, it) },
                                onSetOpacity = { onSetOpacity(layer.id, it) },
                                onRename = { onRename(layer.id, it) },
                                onMoveUp = { onMoveUp(layer.id) },
                                onMoveDown = { onMoveDown(layer.id) },
                                onDelete = { onDelete(layer.id) },
                            )
                        }
                    }
                    HorizontalDivider()
                    if (state.selectedLayer != null) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("Mask brush", style = MaterialTheme.typography.labelMedium, modifier = Modifier.weight(1f))
                            Switch(checked = brushMode, onCheckedChange = { brushMode = it })
                        }
                        if (brushMode) {
                            Row {
                                FilterChip(selected = brushAdd, onClick = { brushAdd = true }, label = { Text("Add") })
                                Spacer(Modifier.width(8.dp))
                                FilterChip(selected = !brushAdd, onClick = { brushAdd = false }, label = { Text("Subtract") })
                            }
                        }
                    }
                    OutlinedButton(onClick = onRegenerateBackground, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
                        Text("Regenerate background (fallback)")
                    }
                    OutlinedButton(onClick = onRestoreOriginal, modifier = Modifier.fillMaxWidth().padding(top = 4.dp)) {
                        Text("Restore original")
                    }
                }
            }
        }
    }

    state.exportMessage?.let { msg ->
        LaunchedEffect(msg) {
            // A Snackbar host isn't wired at this scope for brevity; a
            // simple auto-dismissing text banner keeps this screen
            // self-contained. See KNOWN_LIMITATIONS.md.
        }
        AlertDialog(
            onDismissRequest = onDismissExportMessage,
            confirmButton = { TextButton(onClick = onDismissExportMessage) { Text("OK") } },
            title = { Text("Export complete") },
            text = { Text(msg) },
        )
    }
}

private fun screenToCanvas(screenPoint: Offset, scale: Float, offset: Offset): Offset =
    Offset((screenPoint.x - offset.x) / scale, (screenPoint.y - offset.y) / scale)

@Composable
private fun LayerRow(
    layer: LayerInfo,
    selected: Boolean,
    onSelect: () -> Unit,
    onSetVisible: (Boolean) -> Unit,
    onSetOpacity: (Float) -> Unit,
    onRename: (String) -> Unit,
    onMoveUp: () -> Unit,
    onMoveDown: () -> Unit,
    onDelete: () -> Unit,
) {
    var renaming by remember { mutableStateOf(false) }
    var nameField by remember(layer.name) { mutableStateOf(layer.name) }

    Card(
        onClick = onSelect,
        colors = CardDefaults.cardColors(
            containerColor = if (selected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface
        ),
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
    ) {
        Column(Modifier.padding(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(checked = layer.visible, onCheckedChange = onSetVisible)
                if (renaming) {
                    OutlinedTextField(
                        value = nameField, onValueChange = { nameField = it },
                        singleLine = true, modifier = Modifier.weight(1f),
                    )
                    IconButton(onClick = { onRename(nameField); renaming = false }) {
                        Icon(Icons.Default.Check, "Confirm rename")
                    }
                } else {
                    Text(layer.name, modifier = Modifier.weight(1f).clickable(onClick = { renaming = true }))
                }
                IconButton(onClick = onMoveUp) { Icon(Icons.Default.KeyboardArrowUp, "Move up") }
                IconButton(onClick = onMoveDown) { Icon(Icons.Default.KeyboardArrowDown, "Move down") }
                IconButton(onClick = onDelete) { Icon(Icons.Default.Delete, "Delete") }
            }
            Text("${layer.type} • depth ${layer.depthIndex} • ${(layer.inferredOrManualFraction * 100).toInt()}% non-observed",
                style = MaterialTheme.typography.labelSmall)
            Slider(value = layer.opacity, onValueChange = onSetOpacity, valueRange = 0f..1f)
        }
    }
}
