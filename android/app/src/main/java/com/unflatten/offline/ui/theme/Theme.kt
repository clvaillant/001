package com.unflatten.offline.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Blue = Color(0xFF3D5AFE)
private val Teal = Color(0xFF00E5C7)

private val DarkColors = darkColorScheme(primary = Blue, secondary = Teal)
private val LightColors = lightColorScheme(primary = Blue, secondary = Teal)

@Composable
fun UnflattenTheme(content: @Composable () -> Unit) {
    val colors = if (isSystemInDarkTheme()) DarkColors else LightColors
    MaterialTheme(colorScheme = colors, content = content)
}
