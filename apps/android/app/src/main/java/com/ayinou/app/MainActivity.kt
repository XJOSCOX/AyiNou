package com.ayinou.app

import android.content.Context
import android.content.res.Configuration
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.WindowCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.ayinou.app.core.preferences.AppTheme
import com.ayinou.app.ui.AyiNou
import com.ayinou.app.ui.FoundationViewModel
import com.ayinou.app.ui.theme.AyiNouTheme
import dagger.hilt.android.AndroidEntryPoint
import java.util.Locale

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    private val model by viewModels<FoundationViewModel>()

    override fun onResume() {
        super.onResume()
        model.foreground()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        splash.setKeepOnScreenCondition { !model.state.value.ready }
        setContent {
            val state by model.state.collectAsStateWithLifecycle()
            val configuration = LocalConfiguration.current
            val context: Context = LocalContext.current
            val localized = remember(context, configuration, state.preferences.language) {
                val copy = Configuration(configuration).apply {
                    setLocale(Locale.forLanguageTag(state.preferences.language.tag))
                }
                context.createConfigurationContext(copy)
            }
            val dark = when (state.preferences.theme) {
                AppTheme.SYSTEM -> isSystemInDarkTheme()
                AppTheme.LIGHT -> false
                AppTheme.DARK -> true
            }
            androidx.compose.runtime.SideEffect {
                WindowCompat.getInsetsController(window, window.decorView).apply {
                    isAppearanceLightStatusBars = !dark
                    isAppearanceLightNavigationBars = !dark
                }
            }
            CompositionLocalProvider(LocalContext provides localized, LocalConfiguration provides localized.resources.configuration) {
                AyiNouTheme(dark) { AyiNou(state, model) }
            }
        }
    }
}
