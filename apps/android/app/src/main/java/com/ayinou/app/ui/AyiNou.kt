package com.ayinou.app.ui

import androidx.annotation.DrawableRes
import androidx.annotation.StringRes
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import coil3.compose.AsyncImage
import com.ayinou.app.BuildConfig
import com.ayinou.app.R
import com.ayinou.app.core.auth.SessionState
import com.ayinou.app.core.network.ConnectivityResult
import com.ayinou.app.core.network.FailureKind
import com.ayinou.app.core.preferences.AppLanguage
import com.ayinou.app.core.preferences.AppTheme
import java.text.DateFormat
import java.util.Date

internal enum class Destination(@param:StringRes val title: Int, @param:DrawableRes val icon: Int) {
    Dashboard(R.string.dashboard, R.drawable.ic_home), Feed(R.string.feed, R.drawable.ic_messages),
    Create(R.string.create, R.drawable.ic_create), Discover(R.string.discover, R.drawable.ic_search),
    More(R.string.more, R.drawable.ic_more), Notifications(R.string.notifications, R.drawable.ic_notification),
    Profile(R.string.profile, R.drawable.ic_profile), Settings(R.string.settings, R.drawable.ic_settings),
    Communities(R.string.communities, R.drawable.ic_communities), Groups(R.string.groups, R.drawable.ic_communities),
    Organizations(R.string.organizations, R.drawable.ic_organization), Projects(R.string.projects, R.drawable.ic_projects),
    Events(R.string.events, R.drawable.ic_check), Opportunities(R.string.opportunities, R.drawable.ic_opportunities),
    Volunteering(R.string.volunteering, R.drawable.ic_follow), Mentorship(R.string.mentorship, R.drawable.ic_following),
    Impact(R.string.impact, R.drawable.ic_globe), Account(R.string.account, R.drawable.ic_profile),
    Security(R.string.security, R.drawable.ic_lock), Privacy(R.string.privacy, R.drawable.ic_lock),
    Blocked(R.string.blocked, R.drawable.ic_block), Muted(R.string.muted, R.drawable.ic_mute),
    Storage(R.string.storage, R.drawable.ic_save), Help(R.string.help, R.drawable.ic_messages),
    Legal(R.string.legal, R.drawable.ic_check),
}

private val tabs = listOf(Destination.Dashboard, Destination.Feed, Destination.Create, Destination.Discover, Destination.More)
private val resources = listOf(Destination.Communities, Destination.Groups, Destination.Organizations, Destination.Projects,
    Destination.Events, Destination.Opportunities, Destination.Volunteering, Destination.Mentorship, Destination.Impact)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun AyiNou(
    state: FoundationState,
    changeLanguage: (AppLanguage) -> Unit,
    changeTheme: (AppTheme) -> Unit,
    checkNetwork: () -> Unit,
    dismissNotice: () -> Unit,
) {
    if (!state.ready) return
    if (!BuildConfig.DEBUG) {
        Box(Modifier.fillMaxSize().safeDrawingPadding(), contentAlignment = Alignment.Center) {
            Text(stringResource(R.string.release_unavailable))
        }
        return
    }
    val nav = rememberNavController()
    val entry by nav.currentBackStackEntryAsState()
    val current = Destination.entries.firstOrNull { it.name == entry?.destination?.route } ?: Destination.Dashboard
    val snackbar = remember { SnackbarHostState() }
    val storageError = stringResource(R.string.storage_error)
    LaunchedEffect(state.preferenceError, storageError) {
        if (state.preferenceError) {
            snackbar.showSnackbar(storageError)
            dismissNotice()
        }
    }
    val navigate: (Destination) -> Unit = { dest ->
        nav.navigate(dest.name) { launchSingleTop = true }
    }
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        if (current in tabs) Image(painterResource(R.drawable.brand_mark), null, Modifier.size(31.dp))
                        Text(stringResource(current.title), maxLines = 1, overflow = TextOverflow.Ellipsis,
                            fontWeight = FontWeight.SemiBold)
                    }
                },
                navigationIcon = {
                    if (current !in tabs) IconButton(onClick = { nav.popBackStack() }, modifier = Modifier.testTag("navigate-back")) {
                        AIcon(R.drawable.ic_arrow_left, stringResource(R.string.back))
                    }
                },
                actions = {
                    if (current in tabs) IconButton(onClick = { navigate(Destination.Notifications) }) {
                        AIcon(R.drawable.ic_notification, stringResource(R.string.notifications))
                    }
                })
        },
        bottomBar = {
            if (current in tabs) NavigationBar {
                tabs.forEach { tab ->
                    val tabLabel = stringResource(tab.title)
                    NavigationBarItem(selected = current == tab, modifier = Modifier.testTag("tab-" + tab.name)
                        .semantics { contentDescription = tabLabel }, onClick = {
                        if (current != tab) nav.navigate(tab.name) {
                            popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                            launchSingleTop = true
                            restoreState = true
                        }
                    }, icon = { AIcon(tab.icon) }, label = {
                        Text(stringResource(tab.title), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }, alwaysShowLabel = false)
                }
            }
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { insets ->
        Column(Modifier.padding(insets).fillMaxSize()) {
            if (state.online == false) Column(Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) {
                Notice(stringResource(R.string.offline_banner), R.drawable.ic_globe)
            }
            NavHost(nav, startDestination = Destination.Dashboard.name, modifier = Modifier.weight(1f)) {
                Destination.entries.forEach { dest ->
                    composable(dest.name) {
                        when (dest) {
                            Destination.Dashboard -> Dashboard(state.session, navigate)
                            Destination.Feed -> Feed()
                            Destination.Discover -> Discover(navigate)
                            Destination.More -> Directory(listOf(Destination.Profile, Destination.Settings) + resources, navigate)
                            Destination.Settings -> Settings(state, changeLanguage, changeTheme, checkNetwork, navigate)
                            else -> PreviewScreen(dest)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Page(content: androidx.compose.foundation.lazy.LazyListScope.() -> Unit) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
        LazyColumn(Modifier.widthIn(max = 680.dp).fillMaxWidth(),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp), content = content)
    }
}

@Composable
private fun PreviewTag() {
    Text(stringResource(R.string.preview), style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
}

@Composable
private fun Dashboard(session: SessionState, navigate: (Destination) -> Unit) = Page {
    item {
        Card(shape = androidx.compose.foundation.shape.RoundedCornerShape(20.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
            AsyncImage(model = R.drawable.ayinou_coast, contentDescription = null,
                modifier = Modifier.fillMaxWidth().height(135.dp), contentScale = ContentScale.Crop)
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                PreviewTag()
                Text(stringResource(R.string.greeting), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text(stringResource(if (session is SessionState.Member) R.string.member_workspace else R.string.preview_dashboard))
            }
        }
    }
    item { Panel {
        SectionHeader(stringResource(R.string.profile))
        Text(stringResource(R.string.preview_totals), color = MaterialTheme.colorScheme.onSurfaceVariant)
        OutlinedButton(onClick = { navigate(Destination.Profile) }) { Text(stringResource(R.string.profile)) }
    } }
    item { SectionHeader(stringResource(R.string.explore)) }
    items(listOf(Destination.Communities, Destination.Projects, Destination.Events)) { dest ->
        ActionRow(stringResource(dest.title), dest.icon) { navigate(dest) }
    }
    items(listOf(R.string.announcements, R.string.attention_notices)) { title -> Panel {
        SectionHeader(stringResource(title))
        Text(stringResource(R.string.preview_no_records), color = MaterialTheme.colorScheme.onSurfaceVariant)
    } }
}

@Composable
private fun Feed() = Page {
    item { Notice(stringResource(R.string.feed_preview), R.drawable.ic_messages) }
    item {
        Panel {
            Avatar("A", stringResource(R.string.sample_author), stringResource(R.string.sample_verified))
            val locale = LocalConfiguration.current.locales[0]
            Text(DateFormat.getDateInstance(DateFormat.MEDIUM, locale).format(Date(0)),
                style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(stringResource(R.string.sample_post))
            Surface(color = MaterialTheme.colorScheme.surfaceVariant, shape = MaterialTheme.shapes.medium) {
                Box(Modifier.fillMaxWidth().height(96.dp), contentAlignment = Alignment.Center) {
                    AIcon(R.drawable.ic_image, stringResource(R.string.preview_image))
                }
            }
            HorizontalDivider()
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                listOf(R.drawable.ic_like to R.string.like, R.drawable.ic_comment to R.string.comment,
                    R.drawable.ic_share to R.string.share, R.drawable.ic_save to R.string.bookmark,
                    R.drawable.ic_more to R.string.post_menu).forEach { (icon, label) ->
                    IconButton(onClick = {}, enabled = false) { AIcon(icon, stringResource(label)) }
                }
            }
        }
    }
}

@Composable
private fun Discover(navigate: (Destination) -> Unit) {
    var query by rememberSaveable { mutableStateOf("") }
    val results = resources.map { it to stringResource(it.title) }.filter { it.second.contains(query.trim(), ignoreCase = true) }
    Page {
        item { PreviewTag() }
        item { OutlinedTextField(query, { query = it }, modifier = Modifier.fillMaxWidth(),
            label = { Text(stringResource(R.string.search_sections)) }, leadingIcon = { AIcon(R.drawable.ic_search) },
            trailingIcon = if (query.isNotEmpty()) {{ IconButton(onClick = { query = "" }) {
                AIcon(R.drawable.ic_close, stringResource(R.string.clear_search))
            }}} else null, singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done), keyboardActions = KeyboardActions.Default) }
        if (results.isEmpty()) item { Notice(stringResource(R.string.no_matches), R.drawable.ic_search) }
        items(results) { (dest, label) -> ActionRow(label, dest.icon) { navigate(dest) } }
    }
}

@Composable
private fun Directory(destinations: List<Destination>, navigate: (Destination) -> Unit) = Page {
    item { PreviewTag() }
    items(destinations) { dest -> ActionRow(stringResource(dest.title), dest.icon) { navigate(dest) } }
}

@Composable
private fun PreviewScreen(destination: Destination) = Page {
    item { Panel {
        PreviewTag()
        AIcon(destination.icon)
        SectionHeader(stringResource(destination.title))
        Text(stringResource(R.string.preview_unavailable))
    } }
}

@Composable
private fun Settings(
    state: FoundationState, changeLanguage: (AppLanguage) -> Unit, changeTheme: (AppTheme) -> Unit,
    checkNetwork: () -> Unit, navigate: (Destination) -> Unit,
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
        items(listOf(Destination.Account, Destination.Security, Destination.Privacy, Destination.Notifications,
            Destination.Blocked, Destination.Muted, Destination.Storage, Destination.Help, Destination.Legal)) { dest ->
            ActionRow(stringResource(dest.title), dest.icon) { navigate(dest) }
        }
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
