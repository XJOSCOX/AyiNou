package com.ayinou.app

import android.security.NetworkSecurityPolicy
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.ayinou.app.core.auth.Credentials
import com.ayinou.app.core.auth.KeystoreCredentialStore
import java.io.File
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class FoundationUiTest {
    @org.junit.Before fun excludesRemoteAccountStorage() {
        assumeTrue(BuildConfig.API_ENVIRONMENT != "remote")
    }

    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test fun navigatesAndRestoresThemeAndAllLanguageChoices() {
        useCreole()
        show("Nou kontan wè w ankò").assertIsDisplayed()
        compose.onNodeWithText("Manm egzanp").assertDoesNotExist()
        show("Èd pou kont ou").performClick()
        show("Ou pa ka rekipere modpas nan anviwònman sa a.").assertIsDisplayed()
        show("Kache èd la").performClick()
        compose.onNodeWithText("Ou pa ka rekipere modpas nan anviwònman sa a.").assertDoesNotExist()
        compose.onNodeWithTag("open-settings").performClick()
        show("Lang · Kreyòl ayisyen").performClick()
        show("Français").performClick()
        show("Langue · Français").assertIsDisplayed()
        show("Langue · Français").performClick()
        show("English").performClick()
        show("Language · English").assertIsDisplayed()
        show("Language · English").performClick()
        show("Español").performClick()
        show("Idioma · Español").assertIsDisplayed()
        val themeSelector = compose.onNode(hasText("Tema ·", substring = true))
        themeSelector.performClick()
        show("Oscuro").performClick()
        show("Tema · Oscuro").assertIsDisplayed()

        compose.activityRule.scenario.recreate()
        show("Idioma · Español").assertIsDisplayed()
        show("Tema · Oscuro").assertIsDisplayed()
        show("Tema · Oscuro").performClick()
        show("Claro").performClick()
        show("Tema · Claro").assertIsDisplayed()
        show("Tema · Claro").performClick()
        show("Seguir al sistema").performClick()
        show("Idioma · Español").performClick()
        show("Kreyòl ayisyen").performClick()
        show("Lang · Kreyòl ayisyen").assertIsDisplayed()
        compose.onNodeWithTag("navigate-back").performClick()
        show("Nou kontan wè w ankò").assertIsDisplayed()
    }

    private fun useCreole() {
        val creole = "Nou kontan wè w ankò"
        val welcome = hasText(creole) or hasText("Welcome back") or
            hasText("Bon retour") or hasText("Qué gusto verte de nuevo")
        compose.waitUntil(timeoutMillis = 8_000) { compose.onAllNodes(welcome).fetchSemanticsNodes().size == 1 }
        if (compose.onAllNodesWithText(creole).fetchSemanticsNodes().isNotEmpty()) return

        compose.onNodeWithTag("open-settings").performClick()
        val language = hasText("Language ·", substring = true) or
            hasText("Langue ·", substring = true) or hasText("Idioma ·", substring = true)
        compose.onNode(language).performClick()
        show("Kreyòl ayisyen").performClick()
        compose.onNodeWithTag("navigate-back").performClick()
    }

    private fun show(label: String): androidx.compose.ui.test.SemanticsNodeInteraction {
        compose.waitUntil(timeoutMillis = 8_000) { compose.onAllNodesWithText(label).fetchSemanticsNodes().size == 1 }
        return compose.onNodeWithText(label)
    }

    @Test fun limitsCleartextAndEncryptsFixtureCredentialsOutsideBackup() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val network = NetworkSecurityPolicy.getInstance()
        assertFalse(network.isCleartextTrafficPermitted("api-dev.ayinou.com"))
        assertEquals(BuildConfig.API_ENVIRONMENT == "local" && BuildConfig.API_BASE_URL.contains("10.0.2.2"),
            network.isCleartextTrafficPermitted("10.0.2.2"))
        val store = KeystoreCredentialStore(context)
        try {
            store.write(Credentials("fixture-access", "fixture-refresh", 123))
            val sealed = File(context.noBackupFilesDir, "session.aesgcm").readBytes()
            assertFalse(sealed.decodeToString().contains("fixture-access"))
            assertEquals("fixture-refresh", store.read()?.refreshToken)
            File(context.noBackupFilesDir, "session.aesgcm").writeBytes(sealed.copyOf(18))
            assertNull(store.read())
        } finally {
            store.clear()
        }
        assertNull(store.read())
    }
}
