package com.ayinou.app.ui

import androidx.annotation.StringRes
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentType
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.ayinou.app.BuildConfig
import com.ayinou.app.R
import com.ayinou.app.core.auth.AuthNotice
import com.ayinou.app.core.auth.isDisposableEmail
import com.ayinou.app.core.auth.SessionState
import com.ayinou.app.core.network.ConnectivityResult
import com.ayinou.app.core.network.FailureKind
import com.ayinou.app.core.preferences.AppLanguage
import com.ayinou.app.core.preferences.AppTheme

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun AyiNou(state: FoundationState, model: FoundationViewModel) {
    val nav = rememberNavController()
    val route by nav.currentBackStackEntryAsState()
    val settings = route?.destination?.route == "settings"
    val snackbar = remember { SnackbarHostState() }
    val storageError = stringResource(R.string.storage_error)
    LaunchedEffect(state.preferenceError, storageError) {
        if (state.preferenceError) {
            snackbar.showSnackbar(storageError)
            model.dismissNotice()
        }
    }
    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Image(painterResource(R.drawable.brand_mark), null, Modifier.size(30.dp))
                        Text(if (settings) stringResource(R.string.settings) else stringResource(R.string.app_name))
                    }
                },
                navigationIcon = {
                    if (settings) IconButton(onClick = { nav.popBackStack() }, modifier = Modifier.testTag("navigate-back")) {
                        AIcon(R.drawable.ic_arrow_left, stringResource(R.string.back))
                    }
                },
                actions = {
                    if (!settings) IconButton(onClick = { nav.navigate("settings") { launchSingleTop = true } },
                        modifier = Modifier.testTag("open-settings")) {
                        AIcon(R.drawable.ic_settings, stringResource(R.string.settings))
                    }
                },
            )
        },
    ) { insets ->
        NavHost(navController = nav, startDestination = "account", modifier = Modifier.padding(insets).imePadding()) {
            composable("account") { AccountScreen(state, model) }
            composable("settings") { Settings(state, model::language, model::theme, model::checkNetwork) }
        }
    }
}

@Composable
private fun AccountScreen(state: FoundationState, model: FoundationViewModel) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
        Column(Modifier.widthIn(max = 540.dp).fillMaxWidth().verticalScroll(rememberScrollState()).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)) {
            state.authNotice?.let { notice ->
                val label = when (notice) {
                    AuthNotice.INVALID_SIGN_IN -> R.string.auth_invalid
                    AuthNotice.EMAIL_UNCONFIRMED -> R.string.auth_email_unconfirmed
                    AuthNotice.INVALID_CODE -> R.string.auth_invalid_code
                    AuthNotice.REMOTE_SIGN_OUT_UNCONFIRMED -> R.string.auth_signout_unconfirmed
                    AuthNotice.STORAGE_UNAVAILABLE -> R.string.auth_storage_unavailable
                }
                Notice(stringResource(label), R.drawable.ic_report, true)
            }
            state.authFailure?.let { Notice(stringResource(it.kind.label()), R.drawable.ic_report, true) }
            when (val session = state.session) {
                SessionState.Loading -> Panel {
                    ScreenTitle(R.string.auth_loading)
                    LinearProgressIndicator(Modifier.fillMaxWidth())
                }
                SessionState.SignedOut, SessionState.Expired -> {
                    if (session == SessionState.Expired) Notice(stringResource(R.string.auth_expired), R.drawable.ic_lock)
                    Welcome(state, model::signIn)
                }
                SessionState.Denied -> Panel {
                    ScreenTitle(R.string.auth_denied_title)
                    Text(stringResource(R.string.auth_denied))
                    SignOut(state.busy, model::signOut)
                }
                is SessionState.Restricted -> Panel {
                    ScreenTitle(if (session.suspended) R.string.auth_suspended else R.string.auth_restricted)
                    Text(stringResource(R.string.auth_account_help))
                    SignOut(state.busy, model::signOut)
                }
                is SessionState.Retry -> Panel {
                    ScreenTitle(R.string.error_unavailable)
                    Notice(stringResource(session.failure.kind.label()), R.drawable.ic_report, true)
                    session.failure.requestId?.let { Text(stringResource(R.string.request_reference, it)) }
                    Button(onClick = model::retrySession, enabled = !state.busy) { Text(stringResource(R.string.try_again)) }
                    SignOut(state.busy, model::signOut)
                }
                is SessionState.MfaRequired -> MfaPanel(session.factors, state.busy, model::verifyFactor, model::signOut)
                is SessionState.Onboarding -> OnboardingPanel(session, state.busy, model::saveOnboarding, model::signOut)
                is SessionState.Member -> Panel {
                    ScreenTitle(R.string.account)
                    val name = session.displayName ?: session.username
                    if (name != null) {
                        Avatar(name.take(1).uppercase(), name,
                            if (session.verified) stringResource(R.string.auth_verified) else null)
                        session.username?.let { Text("@$it", style = MaterialTheme.typography.bodyMedium) }
                    }
                    SignOut(state.busy, model::signOut)
                }
            }
        }
    }
}

@Composable
internal fun ScreenTitle(@StringRes label: Int) {
    Text(stringResource(label), Modifier.semantics { heading() }, style = MaterialTheme.typography.headlineSmall)
}

@Composable
internal fun SignOut(busy: Boolean, action: () -> Unit) {
    OutlinedButton(onClick = action, enabled = !busy) { Text(stringResource(R.string.auth_sign_out)) }
}

@Composable
private fun Welcome(state: FoundationState, signIn: (String, String) -> Unit) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var visible by remember { mutableStateOf(false) }
    val focus = LocalFocusManager.current
    val valid = isDisposableEmail(email) && password.isNotEmpty()
    val submit = {
        if (valid && !state.busy && state.authEnabled) {
            val submitted = password
            password = ""
            visible = false
            focus.clearFocus()
            signIn(email, submitted)
        }
    }
    Panel {
        Image(painterResource(R.drawable.brand_mark), null, Modifier.size(56.dp))
        ScreenTitle(R.string.auth_welcome)
        Text(stringResource(R.string.auth_intro))
        if (state.authEnabled) {
            Text(stringResource(R.string.auth_test_email), style = MaterialTheme.typography.bodyMedium)
            OutlinedTextField(email, { email = it.take(254) }, Modifier.fillMaxWidth()
                .semantics { contentType = ContentType.Username + ContentType.EmailAddress },
                label = { Text(stringResource(R.string.auth_email)) }, singleLine = true, enabled = !state.busy,
                isError = email.isNotBlank() && !isDisposableEmail(email),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next))
            OutlinedTextField(password, { password = it.take(1024) }, Modifier.fillMaxWidth()
                .semantics { contentType = ContentType.Password }, enabled = !state.busy, singleLine = true,
                label = { Text(stringResource(R.string.auth_password)) },
                visualTransformation = if (visible) VisualTransformation.None else PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { submit() }),
                trailingIcon = {
                    TextButton(onClick = { visible = !visible }) {
                        Text(stringResource(if (visible) R.string.auth_hide else R.string.auth_show))
                    }
                })
            Button(onClick = submit, enabled = valid && !state.busy, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.auth_sign_in))
            }
            if (state.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
        } else {
            Notice(stringResource(R.string.auth_disabled), R.drawable.ic_lock)
        }
    }
    Panel {
        Text(stringResource(R.string.auth_registration_closed))
        Text(stringResource(R.string.auth_recovery_unavailable), style = MaterialTheme.typography.bodyMedium)
        Text(stringResource(R.string.auth_legal_unavailable), style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun MfaPanel(factors: Int, busy: Boolean, verify: (Int, String) -> Unit, cancel: () -> Unit) {
    var index by remember { mutableIntStateOf(0) }
    var code by remember { mutableStateOf("") }
    Panel {
        ScreenTitle(R.string.auth_mfa)
        Text(stringResource(if (factors > 0) R.string.auth_mfa_description else R.string.auth_no_factor))
        if (factors > 1) {
            repeat(factors) { option ->
                Row(Modifier.fillMaxWidth().heightIn(min = 48.dp)
                    .selectable(index == option, enabled = !busy, role = Role.RadioButton, onClick = { index = option }),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    RadioButton(selected = index == option, onClick = null, enabled = !busy)
                    Text(stringResource(R.string.auth_factor, option + 1))
                }
            }
        }
        if (factors > 0) {
            OutlinedTextField(code, { code = it.filter { digit -> digit in '0'..'9' }.take(6) }, Modifier.fillMaxWidth(),
                label = { Text(stringResource(R.string.auth_code)) }, enabled = !busy, singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword))
            Button(onClick = { val entered = code; code = ""; verify(index, entered) }, enabled = !busy && code.length == 6) {
                Text(stringResource(R.string.auth_verify))
            }
        }
        if (busy) LinearProgressIndicator(Modifier.fillMaxWidth())
        // Cancellation is available while a challenge is in flight.
        SignOut(false, cancel)
    }
}

@Composable
private fun Page(content: androidx.compose.foundation.lazy.LazyListScope.() -> Unit) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp), content = content)
}

@Composable
private fun Settings(
    state: FoundationState, changeLanguage: (AppLanguage) -> Unit, changeTheme: (AppTheme) -> Unit,
    checkNetwork: () -> Unit,
) {
    var dialog by rememberSaveable { mutableStateOf<String?>(null) }
    val languageNames = mapOf(AppLanguage.CREOLE to R.string.lang_ht, AppLanguage.FRENCH to R.string.lang_fr,
        AppLanguage.ENGLISH to R.string.lang_en, AppLanguage.SPANISH to R.string.lang_es)
    val themeNames = mapOf(AppTheme.SYSTEM to R.string.theme_system, AppTheme.LIGHT to R.string.theme_light, AppTheme.DARK to R.string.theme_dark)
    Page {
        item { Panel {
            SectionHeader(stringResource(R.string.preferences))
            ActionRow(stringResource(R.string.setting_value, stringResource(R.string.language),
                stringResource(languageNames.getValue(state.preferences.language))), R.drawable.ic_globe) { dialog = "language" }
            ActionRow(stringResource(R.string.setting_value, stringResource(R.string.theme),
                stringResource(themeNames.getValue(state.preferences.theme))), R.drawable.ic_settings) { dialog = "theme" }
        } }
        item { Panel {
            SectionHeader(stringResource(R.string.connection))
            Text(stringResource(when (state.online) {
                true -> R.string.online
                false -> R.string.offline_banner
                null -> R.string.checking
            }))
            when (val result = state.health) {
                ConnectivityResult.Available -> Notice(stringResource(R.string.api_available), R.drawable.ic_check)
                is ConnectivityResult.Problem -> {
                    Notice(stringResource(result.error.kind.label()), R.drawable.ic_report, true)
                    result.error.requestId?.let { Text(stringResource(R.string.request_reference, it), style = MaterialTheme.typography.bodySmall) }
                }
                null -> if (state.checking) {
                    LinearProgressIndicator(Modifier.fillMaxWidth())
                    Skeleton()
                }
            }
            Button(onClick = checkNetwork, enabled = !state.checking) {
                Text(stringResource(if (state.health is ConnectivityResult.Problem) R.string.try_again else R.string.check_connection))
            }
        } }
        item { Panel {
            SectionHeader(stringResource(R.string.build))
            Text(stringResource(R.string.setting_value, stringResource(R.string.app_version), BuildConfig.VERSION_NAME))
            Text(stringResource(if (BuildConfig.API_ENVIRONMENT == "remote") R.string.remote_environment else R.string.local_environment))
        } }
    }
    if (dialog == "language") ChoiceDialog(R.string.language, languageNames, state.preferences.language,
        onSelect = { changeLanguage(it); dialog = null }, onClose = { dialog = null })
    if (dialog == "theme") ChoiceDialog(R.string.theme, themeNames, state.preferences.theme,
        onSelect = { changeTheme(it); dialog = null }, onClose = { dialog = null })
}

@Composable
private fun <T> ChoiceDialog(@StringRes title: Int, items: Map<T, Int>, selected: T,
                            onSelect: (T) -> Unit, onClose: () -> Unit) {
    val titleText = stringResource(title)
    val closeText = stringResource(R.string.close)
    val choices = items.entries.map { it.key to stringResource(it.value) }
    AlertDialog(onDismissRequest = onClose, title = { Text(titleText) }, text = {
        Column { choices.forEach { (key, label) ->
            Row(Modifier.fillMaxWidth().heightIn(min = 48.dp)
                .selectable(selected = key == selected, role = Role.RadioButton, onClick = { onSelect(key) }),
                verticalAlignment = Alignment.CenterVertically) {
                RadioButton(selected = key == selected, onClick = null, modifier = Modifier.padding(12.dp))
                Text(label)
            }
        } }
    }, confirmButton = { TextButton(onClick = onClose) { Text(closeText) } })
}

@StringRes
private fun FailureKind.label(): Int = when (this) {
    FailureKind.OFFLINE -> R.string.error_offline
    FailureKind.TIMEOUT -> R.string.error_timeout
    FailureKind.TLS -> R.string.error_tls
    FailureKind.BAD_REQUEST -> R.string.error_bad_request
    FailureKind.UNAUTHORIZED -> R.string.error_unauthorized
    FailureKind.FORBIDDEN -> R.string.error_forbidden
    FailureKind.NOT_FOUND -> R.string.error_not_found
    FailureKind.CONFLICT -> R.string.error_conflict
    FailureKind.RATE_LIMITED -> R.string.error_rate
    FailureKind.SERVER -> R.string.error_server
    FailureKind.UNAVAILABLE -> R.string.error_unavailable
    FailureKind.UNEXPECTED -> R.string.error_unexpected
    FailureKind.COLD_START -> R.string.error_cold_start
}
