package com.ayinou.app.ui

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.ayinou.app.R
import com.ayinou.app.core.auth.SessionState
import com.ayinou.app.core.preferences.AppLanguage
import java.util.Locale
import kotlinx.serialization.json.*

@Composable
internal fun OnboardingPanel(
    session: SessionState.Onboarding,
    busy: Boolean,
    save: (JsonObject) -> Unit,
    signOut: () -> Unit,
) {
    Panel {
        ScreenTitle(R.string.auth_onboarding)
        if (session.editable) {
            key(session.profile.onboardingStep) { OnboardingStep(session, busy, save) }
        } else {
            Notice(stringResource(R.string.auth_onboarding_blocked), R.drawable.ic_lock)
        }
        SignOut(busy, signOut)
    }
}

private val languages = mapOf(AppLanguage.CREOLE to R.string.lang_ht, AppLanguage.FRENCH to R.string.lang_fr,
    AppLanguage.ENGLISH to R.string.lang_en, AppLanguage.SPANISH to R.string.lang_es)
private val interests = mapOf(
    "education" to R.string.auth_interest_education, "peace" to R.string.auth_interest_peace,
    "healthcare" to R.string.auth_interest_healthcare, "agriculture" to R.string.auth_interest_agriculture,
    "technology" to R.string.auth_interest_technology, "entrepreneurship" to R.string.auth_interest_entrepreneurship,
    "employment" to R.string.auth_interest_employment, "environment" to R.string.auth_interest_environment,
    "infrastructure" to R.string.auth_interest_infrastructure, "culture" to R.string.auth_interest_culture,
)

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun OnboardingStep(session: SessionState.Onboarding, busy: Boolean, save: (JsonObject) -> Unit) {
    val profile = session.profile
    val policy = profile.experience?.policy ?: return
    val step = profile.onboardingStep ?: return
    var firstName by remember { mutableStateOf(profile.firstName.orEmpty()) }
    var lastName by remember { mutableStateOf(profile.lastName.orEmpty()) }
    var category by remember { mutableStateOf(profile.membershipCategory) }
    var locale by remember { mutableStateOf(AppLanguage.entries.firstOrNull { it.tag == profile.preferredLocale } ?: AppLanguage.CREOLE) }
    var country by remember { mutableStateOf(profile.residenceCountryCode.orEmpty()) }
    var department by remember { mutableStateOf(profile.residenceDepartmentCode?.removePrefix("HT-").orEmpty()) }
    var diaspora by remember { mutableStateOf(profile.diasporaDepartmentCode?.removePrefix("HT-").orEmpty()) }
    var displayName by remember { mutableStateOf(profile.displayName.orEmpty()) }
    var username by remember { mutableStateOf(profile.username.orEmpty()) }
    var selected by remember { mutableStateOf(profile.interests.toSet()) }
    val normalizedUsername = username.trim().lowercase(Locale.ROOT)
    val countryCode = country.trim().uppercase(Locale.ROOT)
    val placeCode = (if (countryCode == "HT") department else diaspora).trim().uppercase(Locale.ROOT)
    val validPlaces = setOf("AR", "CE", "GA", "NI", "ND", "NE", "NO", "OU", "SD", "SE")
    val valid = when (step) {
        0 -> firstName.isNotBlank() && lastName.isNotBlank() && category != null
        1 -> (countryCode.matches(Regex("[A-Z]{2}")) || countryCode.isEmpty() && !policy.requireCountry) &&
            (placeCode in validPlaces || placeCode.isEmpty() && (countryCode != "HT" || !policy.requireDepartment))
        2 -> displayName.trim().length in 2..80 &&
            (normalizedUsername == profile.username || normalizedUsername.matches(Regex("[a-z][a-z0-9_]{2,23}")))
        3 -> selected.isNotEmpty() || !policy.requireInterests
        else -> false
    }
    when (step) {
        0 -> {
            ProfileField(R.string.auth_first_name, firstName, 80, busy) { firstName = it }
            ProfileField(R.string.auth_last_name, lastName, 80, busy) { lastName = it }
            FlowRow {
                FilterChip(category == "haitian", { category = "haitian" }, { Text(stringResource(R.string.auth_haitian)) }, enabled = !busy)
                FilterChip(category == "international_supporter", { category = "international_supporter" },
                    { Text(stringResource(R.string.auth_supporter)) }, enabled = !busy)
            }
            Text(stringResource(R.string.language))
            FlowRow {
                languages.forEach { (choice, label) ->
                    FilterChip(locale == choice, { locale = choice }, { Text(stringResource(label)) }, enabled = !busy)
                }
            }
        }
        1 -> {
            ProfileField(R.string.auth_country, country, 2, busy) { country = it }
            if (countryCode == "HT") ProfileField(R.string.auth_department, department, 2, busy) { department = it }
            else if (countryCode.isNotEmpty()) ProfileField(R.string.auth_diaspora, diaspora, 2, busy) { diaspora = it }
        }
        2 -> {
            ProfileField(R.string.auth_display_name, displayName, 80, busy) { displayName = it }
            ProfileField(R.string.auth_username, username, 24, busy || profile.username != null) { username = it }
        }
        3 -> {
            Text(stringResource(R.string.auth_interests))
            FlowRow {
                interests.forEach { (interest, label) ->
                    FilterChip(interest in selected, {
                        selected = if (interest in selected) selected - interest else selected + interest
                    }, { Text(stringResource(label)) }, enabled = !busy)
                }
            }
        }
    }
    if (busy) LinearProgressIndicator(Modifier.fillMaxWidth())
    Button(enabled = valid && !busy, onClick = {
        save(buildJsonObject {
            put("onboardingStep", step + 1)
            when (step) {
                0 -> {
                    put("firstName", firstName.trim())
                    put("lastName", lastName.trim())
                    put("membershipCategory", category)
                    put("preferredLocale", locale.tag)
                }
                1 -> {
                    put("residenceCountryCode", countryCode.takeIf(String::isNotEmpty))
                    val code = placeCode.takeIf { it in validPlaces }?.let { "HT-$it" }
                    put("residenceDepartmentCode", code.takeIf { countryCode == "HT" })
                    put("diasporaDepartmentCode", code.takeIf { countryCode.isNotEmpty() && countryCode != "HT" })
                }
                2 -> {
                    put("displayName", displayName.trim())
                    if (profile.username == null) put("username", normalizedUsername)
                }
                3 -> putJsonArray("interests") { selected.sorted().forEach { add(it) } }
            }
        })
    }) { Text(stringResource(R.string.auth_continue)) }
}

@Composable
private fun ProfileField(@StringRes label: Int, value: String, limit: Int, busy: Boolean, change: (String) -> Unit) {
    OutlinedTextField(value, { change(it.take(limit)) }, Modifier.fillMaxWidth(), enabled = !busy,
        singleLine = true, label = { Text(stringResource(label)) })
}
