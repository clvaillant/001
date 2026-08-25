package com.unflatten.offline.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

@Composable
fun ImportScreen(
    hasAutosave: Boolean,
    onPickImage: () -> Unit,
    onResumeAutosave: () -> Unit,
    onOpenProjectFile: () -> Unit,
) {
    Scaffold { padding ->
        Column(
            modifier = Modifier.padding(padding).fillMaxSize().padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text("Unflatten Offline", style = MaterialTheme.typography.headlineMedium)
            Spacer(Modifier.height(8.dp))
            Text(
                "Turn one flattened photo into separate, editable layers -- entirely on this device, " +
                    "no internet connection used or required.",
                textAlign = TextAlign.Center,
                style = MaterialTheme.typography.bodyMedium,
            )
            Spacer(Modifier.height(24.dp))
            Button(onClick = onPickImage) { Text("Select a photo") }
            if (hasAutosave) {
                Spacer(Modifier.height(12.dp))
                OutlinedButton(onClick = onResumeAutosave) { Text("Resume last project") }
            }
            Spacer(Modifier.height(12.dp))
            OutlinedButton(onClick = onOpenProjectFile) { Text("Open project file (.uf7p)") }
        }
    }
}
