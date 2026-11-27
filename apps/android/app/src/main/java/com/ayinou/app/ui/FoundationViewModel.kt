package com.ayinou.app.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ayinou.app.core.auth.AccountRepository
import com.ayinou.app.core.auth.AuthNotice
import com.ayinou.app.core.auth.SessionState
import com.ayinou.app.core.network.Failure
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelAndJoin
import kotlinx.serialization.json.JsonObject
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
    val session: SessionState = SessionState.Loading,
    val authEnabled: Boolean = false,
    val busy: Boolean = false,
    val authNotice: AuthNotice? = null,
    val authFailure: Failure? = null,
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
    private val accounts: AccountRepository,
) : ViewModel() {
    private val mutableState = MutableStateFlow(FoundationState())
    val state = mutableState.asStateFlow()
    private var accountWork: Job? = null
    private var initialResume = true
    private var lastValidation = 0L

    init {
        mutableState.update { it.copy(authEnabled = accounts.enabled) }
        viewModelScope.launch { accounts.state.collect { value -> mutableState.update { it.copy(session = value) } } }
        viewModelScope.launch { accounts.failure.collect { value -> mutableState.update { it.copy(authFailure = value) } } }
        viewModelScope.launch { accounts.notice.collect { value -> mutableState.update { it.copy(authNotice = value) } } }
        retrySession()
        viewModelScope.launch {
            preferences.values.collect { value ->
                mutableState.update { it.copy(ready = true, preferences = value, preferenceError = value.recoveredStorageFailure) }
            }
        }
        viewModelScope.launch {
            connectivity.online.collect { connected -> mutableState.update { it.copy(online = connected) } }
        }
    }

    fun retrySession() = perform {
        lastValidation = android.os.SystemClock.elapsedRealtime()
        accounts.validate()
    }

    fun foreground() {
        if (initialResume) { initialResume = false; return }
        val current = accounts.state.value
        if ((current is SessionState.Member || current is SessionState.Onboarding) &&
            android.os.SystemClock.elapsedRealtime() - lastValidation >= 30_000) retrySession()
    }

    fun signIn(email: String, password: String) = perform { accounts.signIn(email, password) }
    fun verifyFactor(index: Int, code: String) = perform { accounts.verifyFactor(index, code) }
    fun saveOnboarding(details: JsonObject) = perform { accounts.saveOnboarding(details) }

    fun signOut() {
        val previous = accountWork
        accountWork = viewModelScope.launch {
            previous?.cancelAndJoin()
            mutableState.update { it.copy(busy = true) }
            try { accounts.signOut() } finally { mutableState.update { it.copy(busy = false) } }
        }
    }

    private fun perform(operation: suspend () -> Unit) {
        if (accountWork?.isActive == true) return
        accountWork = viewModelScope.launch {
            mutableState.update { it.copy(busy = true) }
            try { operation() } finally { mutableState.update { it.copy(busy = false) } }
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
