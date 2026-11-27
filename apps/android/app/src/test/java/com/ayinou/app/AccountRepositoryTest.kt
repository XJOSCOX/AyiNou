package com.ayinou.app

import com.ayinou.app.core.auth.*
import com.ayinou.app.core.network.ApiEnvironment
import com.ayinou.app.core.network.Endpoint
import com.ayinou.app.core.network.FailureKind
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import java.util.concurrent.TimeUnit
import okio.ByteString.Companion.encodeUtf8
import org.junit.Assert.*
import org.junit.Test

class AccountRepositoryTest {
    @Test fun invalidCredentialsAndUnconfirmedEmailNeverReadPrivateData() = fixture {
        auth.enqueue(response("""{"error_code":"invalid_credentials"}""", 400))
        auth.enqueue(response("""{"error_code":"email_not_confirmed"}""", 400))
        repository.validate()
        repository.signIn("member@example.test", "fixture")
        assertEquals(AuthNotice.INVALID_SIGN_IN, repository.notice.value)
        repository.signIn("member@example.test", "fixture")
        assertEquals(AuthNotice.EMAIL_UNCONFIRMED, repository.notice.value)
        assertEquals(SessionState.SignedOut, repository.state.value)
        assertEquals(0, api.requestCount)
        assertNull(storage.value)
    }

    @Test fun enrollmentRequiresMfaBeforeAnyPrivateApiCall() = fixture {
        auth.enqueue(response(grant()))
        auth.enqueue(response("""{"id":"test","factors":[{"id":"fixture","factor_type":"totp","status":"verified"}]}"""))
        repository.signIn("member@example.test", "fixture")
        assertEquals(SessionState.MfaRequired(1), repository.state.value)
        assertEquals(0, api.requestCount)
        auth.enqueue(response("""{"id":"challenge"}"""))
        auth.enqueue(response("""{"error_code":"mfa_verification_failed"}""", 422))
        repository.verifyFactor(0, "000000")
        assertEquals(AuthNotice.INVALID_CODE, repository.notice.value)
        auth.enqueue(response("""{"id":"new-challenge"}"""))
        auth.enqueue(response(grant("aal2")))
        auth.enqueue(response(user))
        member()
        repository.verifyFactor(0, "123456")
        assertEquals(SessionState.Member("Fixture", "fixture", true), repository.state.value)
    }

    @Test fun concurrentRestorationRotatesOnceAndEachReadUsesReplacement() = fixture {
        storage.value = Credentials(token(), "old-refresh", 1)
        auth.enqueue(response(grant()))
        repeat(2) { auth.enqueue(response(user)); member() }
        kotlinx.coroutines.coroutineScope {
            val first = async { repository.validate() }
            val second = async { repository.validate() }
            first.await()
            second.await()
        }
        assertEquals("new-refresh", storage.value?.refreshToken)
        assertEquals(1, storage.writes)
        assertEquals(3, auth.requestCount)
        assertTrue(auth.takeRequest().path!!.endsWith("grant_type=refresh_token"))
        assertEquals("Bearer ${token()}", api.takeRequest().getHeader("Authorization"))
        assertNull(api.takeRequest().getHeader("apikey"))
    }

    @Test fun unauthorizedReadRetriesOnceAndRestrictedAccountHasNoMemberShell() = fixture {
        auth.enqueue(response(grant()))
        auth.enqueue(response(user))
        api.enqueue(response("{}", 401))
        auth.enqueue(response(grant()))
        api.enqueue(response("{}", 401))
        api.enqueue(response("""{"restriction":"suspended"}"""))
        repository.signIn("member@example.test", "fixture")
        assertEquals(SessionState.Restricted(true), repository.state.value)
        assertEquals(3, api.requestCount)
    }

    @Test fun transientFailurePreservesSessionAndForbiddenNeverRefreshes() = fixture {
        storage.value = Credentials(token(), "old-refresh", 1000)
        auth.enqueue(response(user))
        api.enqueue(response("{}", 503))
        repository.validate()
        assertEquals(FailureKind.UNAVAILABLE, (repository.state.value as SessionState.Retry).failure.kind)
        assertEquals("old-refresh", storage.value?.refreshToken)
        auth.enqueue(response(user))
        api.enqueue(response("{}", 403))
        repository.validate()
        assertEquals(SessionState.Denied, repository.state.value)
        assertEquals(2, auth.requestCount)
    }

    @Test fun revokedCredentialsClearAndOnboardingUsesServerDecision() = fixture {
        storage.value = Credentials(token(), "revoked-refresh", 5)
        auth.enqueue(response("""{"error_code":"refresh_token_not_found"}""", 400))
        api.enqueue(response("{}", 401))
        repository.validate()
        assertEquals(SessionState.Expired, repository.state.value)
        assertNull(storage.value)
        auth.enqueue(response(grant()))
        auth.enqueue(response(user))
        api.enqueue(response(profile(access = false)))
        repository.signIn("member@example.test", "fixture")
        val next = repository.state.value as SessionState.Onboarding
        assertTrue(next.editable)
        assertEquals(0, next.profile.onboardingStep)
        assertEquals(2, api.requestCount)
    }

    @Test fun signOutClearsBeforeRemoteFailureAndCannotRestoreOldSession() = fixture {
        storage.value = Credentials(token(), "old-refresh", 1000)
        auth.enqueue(response(user))
        member()
        repository.validate()
        auth.enqueue(response("{}", 503))
        repository.signOut()
        assertNull(storage.value)
        assertEquals(SessionState.SignedOut, repository.state.value)
        assertEquals(AuthNotice.REMOTE_SIGN_OUT_UNCONFIRMED, repository.notice.value)
        repository.validate()
        assertEquals(SessionState.SignedOut, repository.state.value)
    }

    @Test fun logoutAfterAnInterruptedRefreshClearsThePreviousSession() = fixture {
        storage.value = Credentials(token(), "old-refresh", 5)
        auth.enqueue(response(grant()).setBodyDelay(3, TimeUnit.SECONDS))
        val validation = kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.Default)
            .async { repository.validate() }
        try {
            assertNotNull(auth.takeRequest(5, TimeUnit.SECONDS))
        } finally {
            validation.cancel()
            validation.join()
        }
        auth.enqueue(response("{}", 204))
        repository.signOut()
        assertNull(storage.value)
        assertEquals(SessionState.SignedOut, repository.state.value)
    }

    @Test fun disconnectedLogoutClearsLocalDataAndAllowsAnotherAccount() = fixture {
        storage.value = Credentials(token(), "current", 1000)
        auth.enqueue(response(user))
        member()
        repository.validate()
        auth.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST))
        repository.signOut()
        assertEquals(AuthNotice.REMOTE_SIGN_OUT_UNCONFIRMED, repository.notice.value)
        assertNull(storage.value)
        auth.enqueue(response(grant(subject = "other")))
        auth.enqueue(response("""{"id":"other"}"""))
        api.enqueue(response(profile(access = true).replace("\"test\"", "\"other\"")))
        api.enqueue(response("""{"verified":false}"""))
        repository.signIn("other@example.test", "fixture")
        assertEquals(SessionState.Member("Fixture", "fixture", false), repository.state.value)
    }

    @Test fun hostedAddressesNeverReachDisposableAuth() = fixture {
        repository.signIn("real.member@ayinou.com", "fixture")
        assertEquals(AuthNotice.INVALID_SIGN_IN, repository.notice.value)
        assertEquals(0, auth.requestCount)
    }

    @Test fun unexpectedTokenIssuerAndRedirectAreRejectedBeforeForwardingCredentials() = fixture {
        auth.enqueue(response(grant(issuer = "https://unrelated.invalid/auth/v1")))
        repository.signIn("member@example.test", "fixture")
        assertEquals(SessionState.Expired, repository.state.value)
        assertEquals(0, api.requestCount)
        auth.enqueue(response("{}", 302).addHeader("Location", api.url("/")))
        repository.signIn("member@example.test", "fixture")
        assertEquals(0, api.requestCount)
        assertNull(storage.value)
    }

    private fun fixture(test: suspend Fixture.() -> Unit) = runBlocking {
        MockWebServer().use { auth ->
            MockWebServer().use { api ->
                val storage = MemoryStore()
                val endpoint = Endpoint(ApiEnvironment.LOCAL, api.url("/").newBuilder().host("127.0.0.1").build(), true)
                val repository = AccountRepository(authApi(auth.url("/"), "sb_publishable_fixture_only"),
                    accountApi(endpoint), storage, issuer) { 100 }
                Fixture(auth, api, storage, repository).test()
            }
        }
    }

    private class Fixture(val auth: MockWebServer, val api: MockWebServer, val storage: MemoryStore,
        val repository: AccountRepository) {
        fun member() {
            api.enqueue(response(profile(access = true)))
            api.enqueue(response("""{"verified":true}"""))
        }
    }

    private class MemoryStore : CredentialStore {
        var value: Credentials? = null
        var writes = 0
        override suspend fun read() = value
        override suspend fun write(credentials: Credentials) { value = credentials; writes++ }
        override suspend fun clear() { value = null }
    }

    private companion object {
        const val issuer = "http://127.0.0.1:55321/auth/v1"
        const val user = """{"id":"test"}"""
        fun token(aal: String = "aal1", issuer: String = this.issuer, subject: String = "test"): String {
            val payload = """{"iss":"$issuer","role":"authenticated","sub":"$subject","session_id":"session","aal":"$aal"}"""
            return "e30.${payload.encodeUtf8().base64Url().trimEnd('=')}.fixture"
        }
        fun response(body: String, status: Int = 200) = MockResponse().setResponseCode(status)
            .addHeader("Content-Type", "application/json").setBody(body)
        fun grant(aal: String = "aal1", issuer: String = this.issuer, subject: String = "test") =
            """{"access_token":"${token(aal, issuer, subject)}","refresh_token":"new-refresh","expires_in":3600}"""
        fun profile(access: Boolean) = """
            {"profile":{"userId":"test","displayName":"Fixture","username":"fixture","preferredLocale":"ht",
            "onboardingStep":0,"experience":{"memberAccess":$access,"applies":true,"policy":{"onboardingEnabled":true,
            "profilesEnabled":true,"profileEdits":true,"requireCountry":false,"requireDepartment":false,"requireInterests":false,"allowSkip":true}}}}
        """.trimIndent()
    }
}
