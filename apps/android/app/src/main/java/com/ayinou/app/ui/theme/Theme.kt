package com.ayinou.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Light = lightColorScheme(
    primary = Color(0xFF164F92), onPrimary = Color.White,
    primaryContainer = Color(0xFFD7E8FF), onPrimaryContainer = Color(0xFF112E51),
    secondary = Color(0xFF486181), onSecondary = Color.White,
    secondaryContainer = Color(0xFFE2EDFA), onSecondaryContainer = Color(0xFF19354F),
    background = Color(0xFFF0F5FB), onBackground = Color(0xFF132A43),
    surface = Color(0xFFF9FBFF), onSurface = Color(0xFF132A43),
    surfaceVariant = Color(0xFFE7EFF9), onSurfaceVariant = Color(0xFF41566E),
    outline = Color(0xFF657C96), outlineVariant = Color(0xFFC3D4E8),
    error = Color(0xFFA5203D), onError = Color.White,
)

private val Dark = darkColorScheme(
    primary = Color(0xFFA4CAFF), onPrimary = Color(0xFF092F5A),
    primaryContainer = Color(0xFF173A60), onPrimaryContainer = Color(0xFFD8E9FF),
    secondary = Color(0xFFB4C9E6), onSecondary = Color(0xFF203953),
    secondaryContainer = Color(0xFF273F58), onSecondaryContainer = Color(0xFFDFEBFA),
    background = Color(0xFF0D1928), onBackground = Color(0xFFE2EDFB),
    surface = Color(0xFF142437), onSurface = Color(0xFFE2EDFB),
    surfaceVariant = Color(0xFF20354D), onSurfaceVariant = Color(0xFFBBCEE4),
    outline = Color(0xFF91A8C2), outlineVariant = Color(0xFF3E5771),
    error = Color(0xFFFFB3C3), onError = Color(0xFF58102A),
)

@Composable
fun AyiNouTheme(dark: Boolean, content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (dark) Dark else Light, typography = Typography, content = content)
}
