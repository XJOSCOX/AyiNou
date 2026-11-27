package com.ayinou.app.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ayinou.app.core.auth.SessionState
import com.ayinou.app.core.network.ConnectivityMonitor
import com.ayinou.app.core.network.ConnectivityResult
import com.ayinou.app.core.network.HealthRepository
import com.ayinou.app.core.preferences.AppLanguage
import com.ayinou.app.core.preferences.AppTheme
import com.ayinou.app.core.preferences.Preferences
import com.ayinou.app.core.preferences.PreferencesRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import java.io.IOException
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class FoundationState(
    val ready: Boolean = false,
    val preferences: Preferences = Preferences(),
    val session: SessionState = SessionState.SignedOut,
    val online: Boolean? = null,
    val checking: Boolean = false,
    val health: ConnectivityResult? = null,
    val preferenceError: Boolean = false,
)

@HiltViewModel
class FoundationViewModel @Inject constructor(
    private val preferences: PreferencesRepository,
    connectivity: ConnectivityMonitor,
    private val health: HealthRepository,
) : ViewModel() {
    private val mutableState = MutableStateFlow(FoundationState())
    val state = mutableState.asStateFlow()

    init {
        viewModelScope.launch {
            preferences.values.collect { value ->
                mutableState.update { it.copy(ready = true, preferences = value, preferenceError = value.recoveredStorageFailure) }
            }
        }
        viewModelScope.launch {
            connectivity.online.collect { connected -> mutableState.update { it.copy(online = connected) } }
        }
    }

    fun language(value: AppLanguage) = save { preferences.setLanguage(value) }
    fun theme(value: AppTheme) = save { preferences.setTheme(value) }
    fun dismissNotice() { mutableState.update { it.copy(preferenceError = false) } }

    private fun save(action: suspend () -> Unit) {
        viewModelScope.launch {
            try { action() } catch (_: IOException) { mutableState.update { it.copy(preferenceError = true) } }
        }
    }

    fun checkNetwork() {
        if (mutableState.value.checking) return
        mutableState.update { it.copy(checking = true, health = null) }
        viewModelScope.launch {
            try {
                val result = health.check()
                mutableState.update { it.copy(health = result) }
            } finally { mutableState.update { it.copy(checking = false) } }
        }
    }
}
