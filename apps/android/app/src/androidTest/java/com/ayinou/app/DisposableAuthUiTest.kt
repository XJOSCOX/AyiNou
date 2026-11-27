package com.ayinou.app

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.nio.ByteBuffer
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

@RunWith(AndroidJUnit4::class)
class DisposableAuthUiTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test fun actualDisposableAccountSignsInRestoresAndSignsOut() {
        val args = InstrumentationRegistry.getArguments()
        val password = args.getString("a2FixturePassword")
        assumeTrue(BuildConfig.DISPOSABLE_AUTH_KEY.isNotEmpty() && password != null)
        val email = args.getString("a2FixtureEmail") ?: error("Missing disposable fixture address")
        require(email.endsWith("@example.test"))
        val start = android.os.SystemClock.elapsedRealtime()
        compose.onNodeWithText("Adrès imel").performTextInput(email)
        compose.onNodeWithText("Modpas").performTextInput(requireNotNull(password))
        compose.onNodeWithText("Konekte", substring = false).performClick()
        signedIn()
        println("A2 disposable sign-in UI to authorized shell ms=${android.os.SystemClock.elapsedRealtime() - start}")
        compose.activityRule.scenario.recreate()
        signedIn()
        compose.onNodeWithText("Dekonekte", substring = false).performClick()
        compose.waitUntil(15_000) { compose.onAllNodesWithText("Nou kontan wè w ankò").fetchSemanticsNodes().size == 1 }
    }

    @Test fun mandatoryOnboardingAfterTotp() {
        val args = InstrumentationRegistry.getArguments()
        val secret = args.getString("a2FixtureTotp")
        assumeTrue(BuildConfig.DISPOSABLE_AUTH_KEY.isNotEmpty() && secret != null)
        val email = requireNotNull(args.getString("a2FixtureEmail"))
        val password = requireNotNull(args.getString("a2FixturePassword"))
        require(email.endsWith("@example.test"))
        useCreole()
        field("Adrès imel", email)
        field("Modpas", password)
        compose.onNodeWithText("Konekte", substring = false).performClick()
        waitFor("Verifikasyon an de etap").assertIsDisplayed()
        field("Kòd verifikasyon", totp(requireNotNull(secret)))
        waitFor("Verifye").performScrollTo().performClick()

        waitFor("Konplete pwofil ou").assertIsDisplayed()
        field("Prenon", "Android")
        field("Siyati", "Fixture")
        waitFor("Manm ayisyen").performScrollTo().performClick()
        next()
        field("Kòd peyi", "HT")
        field("Kòd depatman", "OU")
        next()
        field("Non piblik", "Android MFA fixture")
        field("Non itilizatè", "androidmfa")
        next()
        waitFor("Edikasyon").performScrollTo().performClick()
        next()
        signedIn()
        // Leave the encrypted session for the separate cold-process restoration check.
    }

    @Test fun restoresCompletedAccountInNewProcess() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("a2FixtureColdRestore") == "true")
        val start = android.os.SystemClock.elapsedRealtime()
        signedIn()
        println("A2 disposable cold instrumentation restore ms=${android.os.SystemClock.elapsedRealtime() - start}")
        waitFor("Dekonekte").performScrollTo().performClick()
        waitFor("Nou kontan wè w ankò").assertIsDisplayed()
    }

    private fun useCreole() {
        val welcome = hasText("Nou kontan wè w ankò") or hasText("Welcome back") or
            hasText("Bon retour") or hasText("Qué gusto verte de nuevo")
        compose.waitUntil(15_000) { compose.onAllNodes(welcome).fetchSemanticsNodes().size == 1 }
        if (compose.onAllNodesWithText("Nou kontan wè w ankò").fetchSemanticsNodes().isNotEmpty()) return
        compose.onNodeWithTag("open-settings").performClick()
        val languagePreference = hasText("Language ·", substring = true) or
            hasText("Langue ·", substring = true) or hasText("Idioma ·", substring = true)
        compose.onNode(languagePreference).performClick()
        waitFor("Kreyòl ayisyen").performClick()
        compose.onNodeWithTag("navigate-back").performClick()
        waitFor("Nou kontan wè w ankò")
    }

    private fun field(label: String, value: String) {
        waitFor(label).performScrollTo().performTextReplacement(value)
    }

    private fun next() { waitFor("Kontinye").performScrollTo().performClick() }

    private fun waitFor(label: String): SemanticsNodeInteraction {
        compose.waitUntil(30_000) { compose.onAllNodesWithText(label, substring = false).fetchSemanticsNodes().size == 1 }
        return compose.onNodeWithText(label, substring = false)
    }

    private fun totp(secret: String): String {
        val alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
        val bits = secret.trimEnd('=').flatMap { character ->
            val value = alphabet.indexOf(character)
            require(value >= 0)
            (4 downTo 0).map { (value shr it) and 1 }
        }
        val key = bits.chunked(8).filter { it.size == 8 }
            .map { byte -> byte.fold(0) { acc, bit -> (acc shl 1) or bit }.toByte() }.toByteArray()
        val counter = ByteBuffer.allocate(8).putLong(System.currentTimeMillis() / 30_000).array()
        val mac = Mac.getInstance("HmacSHA1")
        mac.init(SecretKeySpec(key, "HmacSHA1"))
        val hash = mac.doFinal(counter)
        val offset = hash.last().toInt() and 15
        val value = ByteBuffer.wrap(hash, offset, 4).int and Int.MAX_VALUE
        return (value % 1_000_000).toString().padStart(6, '0')
    }

    private fun signedIn() {
        waitFor("Kont").assertIsDisplayed()
        waitFor("Dekonekte").assertIsDisplayed()
    }
}
