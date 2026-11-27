package com.ayinou.app.core.auth

import com.ayinou.app.core.network.Failure
import com.ayinou.app.core.network.FailureKind
import java.io.IOException
import java.security.GeneralSecurityException
import java.security.ProviderException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okio.ByteString.Companion.decodeBase64
import retrofit2.Response

sealed interface SessionState {
    data object Loading : SessionState
    data object SignedOut : SessionState
    data object Expired : SessionState
    data object Denied : SessionState
    data class Restricted(val suspended: Boolean) : SessionState
    data class Retry(val failure: Failure) : SessionState
    data class MfaRequired(val factors: Int) : SessionState
    data class Onboarding(val profile: AccountProfile, val editable: Boolean) : SessionState
    data class Member(val displayName: String?, val username: String?, val verified: Boolean) : SessionState
}

internal fun isSignInEmail(email: String, remote: Boolean): Boolean {
    val address = email.trim()
    if (address.length > 254) return false
    return if (remote) address.matches(Regex("[^@\\s]+@[^@\\s]+"))
    else address.matches(Regex("[A-Za-z0-9._+-]{1,64}@example\\.test", RegexOption.IGNORE_CASE))
}

enum class AuthNotice { INVALID_SIGN_IN, EMAIL_UNCONFIRMED, INVALID_CODE, REMOTE_SIGN_OUT_UNCONFIRMED, STORAGE_UNAVAILABLE }

class AccountRepository internal constructor(
    private val auth: AuthApi?,
    private val platform: AccountApi?,
    private val store: CredentialStore,
    private val issuer: String,
    private val remoteReadOnly: Boolean = false,
    private val clock: () -> Long = { System.currentTimeMillis() / 1000 },
) {
    private val lock = Mutex()
    private val session = MutableStateFlow<SessionState>(SessionState.Loading)
    val state = session.asStateFlow()
    private val feedback = MutableStateFlow<Failure?>(null)
    val failure = feedback.asStateFlow()
    private val message = MutableStateFlow<AuthNotice?>(null)
    val notice = message.asStateFlow()
    val enabled = auth != null && platform != null
    private var credentials: Credentials? = null
    private var factors = emptyList<Factor>()
    private var restored = false
    private var storageLocked = false

    suspend fun validate() = lock.withLock {
        if (!enabled || storageLocked) {
            session.value = SessionState.SignedOut
            return@withLock
        }
        feedback.value = null
        message.value = null
        session.value = SessionState.Loading
        try {
            if (!restored) {
                credentials = store.read()
                restored = true
            }
            if (credentials == null) session.value = SessionState.SignedOut
            else establish()
        } catch (error: RequestFailure) {
            handleValidationFailure(error)
        } catch (_: GeneralSecurityException) {
            storageFailure()
        } catch (_: IOException) {
            storageFailure()
        } catch (_: ProviderException) {
            storageFailure()
        }
    }

    suspend fun signIn(email: String, password: String) = lock.withLock {
        if (!enabled || storageLocked || credentials != null) return@withLock
        feedback.value = null
        message.value = null
        if (!isSignInEmail(email, remoteReadOnly)) {
            message.value = AuthNotice.INVALID_SIGN_IN
            return@withLock
        }
        val grant = try {
            request { auth!!.signIn(PasswordGrant(email.trim(), password)).required() }
        } catch (error: RequestFailure) {
            when {
                error.code == "email_not_confirmed" -> message.value = AuthNotice.EMAIL_UNCONFIRMED
                error.failure.kind in setOf(FailureKind.BAD_REQUEST, FailureKind.UNAUTHORIZED, FailureKind.FORBIDDEN) ->
                    message.value = AuthNotice.INVALID_SIGN_IN
                else -> feedback.value = error.failure
            }
            return@withLock
        }
        session.value = SessionState.Loading
        commitAndEstablish(grant)
    }

    suspend fun verifyFactor(index: Int, code: String) = lock.withLock {
        if (session.value !is SessionState.MfaRequired || !Regex("[0-9]{6}").matches(code)) return@withLock
        val factor = factors.getOrNull(index) ?: return@withLock
        feedback.value = null
        message.value = null
        val grant = try {
            request {
                val token = activeToken()
                val challenge = auth!!.challenge(bearer(token), factor.id).required()
                auth.verify(bearer(token), factor.id, VerifyFactor(challenge.id, code)).required()
            }
        } catch (error: RequestFailure) {
            when (error.failure.kind) {
                FailureKind.UNAUTHORIZED -> handleValidationFailure(error)
                FailureKind.BAD_REQUEST, FailureKind.FORBIDDEN, FailureKind.CONFLICT, FailureKind.NOT_FOUND ->
                    message.value = AuthNotice.INVALID_CODE
                else -> feedback.value = error.failure
            }
            return@withLock
        }
        commitAndEstablish(grant)
    }

    suspend fun saveOnboarding(details: JsonObject) = lock.withLock {
        if ((session.value as? SessionState.Onboarding)?.editable != true) return@withLock
        feedback.value = null
        try {
            val token = activeToken()
            request { platform!!.onboard(bearer(token), details).required() }
        } catch (error: RequestFailure) {
            if (error.failure.kind == FailureKind.UNAUTHORIZED) handleValidationFailure(error)
            else feedback.value = error.failure
            return@withLock
        }
        try {
            establish()
        } catch (error: RequestFailure) {
            handleValidationFailure(error)
        }
    }

    suspend fun signOut() = lock.withLock {
        val token = credentials?.accessToken
        feedback.value = null
        message.value = null
        session.value = SessionState.SignedOut
        clear()
        if (token != null && auth != null) {
            try {
                request {
                    val response = auth.signOut(bearer(token))
                    if (!response.isSuccessful) throw response.failure()
                }
            } catch (_: RequestFailure) {
                if (!storageLocked) message.value = AuthNotice.REMOTE_SIGN_OUT_UNCONFIRMED
            }
        }
    }

    private suspend fun establish() {
        val user = read { auth!!.user(it) }
        val claims = checkedClaims(credentials!!.accessToken)
        if (user.id != claims.subject) throw RequestFailure(Failure(FailureKind.UNAUTHORIZED))
        val verified = user.factors.filter { it.status == "verified" }
        if (verified.isNotEmpty() && claims.aal != "aal2") {
            factors = verified.filter { it.type == "totp" }
            session.value = SessionState.MfaRequired(factors.size)
            return
        }
        factors = emptyList()
        val profile = read { platform!!.profile(it) }.profile
        if (profile == null || profile.userId != user.id || profile.experience == null) {
            throw RequestFailure(Failure(FailureKind.UNEXPECTED))
        }
        val experience = profile.experience
        session.value = if (!experience.memberAccess) {
            SessionState.Onboarding(profile, !remoteReadOnly && experience.applies && experience.policy.onboardingEnabled &&
                experience.policy.profilesEnabled && experience.policy.profileEdits &&
                profile.onboardingStep in 0..3)
        } else {
            val badge = read { platform!!.badge(it) }
            SessionState.Member(profile.displayName, profile.username, badge.verified)
        }
    }

    private suspend fun <T> read(call: suspend (String) -> Response<T>): T = request {
        val token = activeToken()
        val response = call(bearer(token))
        if (response.code() != 401) return@request response.required()
        response.errorBody()?.close()
        val replacement = refresh(token)
        call(bearer(replacement)).required()
    }

    private suspend fun activeToken(): String {
        val current = credentials ?: throw RequestFailure(Failure(FailureKind.UNAUTHORIZED))
        checkedClaims(current.accessToken)
        return if (current.expiresAtEpochSeconds > clock() + 30) current.accessToken
        else refresh(current.accessToken)
    }

    // The same mutex covers refresh, durable rotation, establishment and logout.
    private suspend fun refresh(previous: String): String {
        val current = credentials ?: throw RequestFailure(Failure(FailureKind.UNAUTHORIZED))
        if (current.accessToken != previous) return current.accessToken
        val grant = try {
            request { auth!!.refresh(RefreshGrant(current.refreshToken)).required() }
        } catch (error: RequestFailure) {
            if (error.failure.kind in setOf(FailureKind.BAD_REQUEST, FailureKind.UNAUTHORIZED, FailureKind.FORBIDDEN)) {
                throw RequestFailure(Failure(FailureKind.UNAUTHORIZED))
            }
            throw error
        }
        val next = grant.credentials(clock())
        val oldClaims = checkedClaims(previous)
        val nextClaims = checkedClaims(next.accessToken)
        if (nextClaims.subject != oldClaims.subject || nextClaims.sessionId != oldClaims.sessionId) {
            throw RequestFailure(Failure(FailureKind.UNAUTHORIZED))
        }
        try {
            commit(next)
        } catch (_: GeneralSecurityException) {
            throw storageProblem()
        } catch (_: IOException) {
            throw storageProblem()
        } catch (_: ProviderException) {
            throw storageProblem()
        }
        return next.accessToken
    }

    private suspend fun commitAndEstablish(grant: TokenGrant) {
        try {
            val next = grant.credentials(clock())
            val claims = checkedClaims(next.accessToken)
            credentials?.let {
                val previous = checkedClaims(it.accessToken)
                if (claims.subject != previous.subject || claims.sessionId != previous.sessionId || claims.aal != "aal2") {
                    throw RequestFailure(Failure(FailureKind.UNAUTHORIZED))
                }
            }
            commit(next)
            establish()
        } catch (error: RequestFailure) {
            handleValidationFailure(error)
        } catch (_: GeneralSecurityException) {
            storageFailure()
        } catch (_: IOException) {
            storageFailure()
        } catch (_: ProviderException) {
            storageFailure()
        }
    }

    private suspend fun commit(next: Credentials) = withContext(NonCancellable) {
        credentials = next
        store.write(next)
    }

    private suspend fun handleValidationFailure(error: RequestFailure) {
        when (error.failure.kind) {
            FailureKind.UNAUTHORIZED -> checkRestriction()
            FailureKind.FORBIDDEN -> session.value = SessionState.Denied
            else -> session.value = SessionState.Retry(error.failure)
        }
    }

    private suspend fun checkRestriction() {
        val token = credentials?.accessToken
        if (token != null && platform != null && !storageLocked) {
            try {
                val current = request { platform.standing(bearer(token)).required() }
                if (current.restriction in setOf("suspended", "banned")) {
                    session.value = SessionState.Restricted(current.restriction == "suspended")
                    return
                }
            } catch (error: RequestFailure) {
                if (error.failure.kind !in setOf(FailureKind.UNAUTHORIZED, FailureKind.FORBIDDEN, FailureKind.NOT_FOUND)) {
                    session.value = SessionState.Retry(error.failure)
                    return
                }
            }
        }
        clear()
        session.value = SessionState.Expired
    }

    private suspend fun clear() = withContext(NonCancellable) {
        credentials = null
        factors = emptyList()
        restored = true
        try {
            store.clear()
        } catch (_: GeneralSecurityException) {
            markStorageLocked()
        } catch (_: IOException) {
            markStorageLocked()
        } catch (_: ProviderException) {
            markStorageLocked()
        }
    }

    private fun markStorageLocked() {
        storageLocked = true
        message.value = AuthNotice.STORAGE_UNAVAILABLE
    }

    private suspend fun storageFailure() {
        clear()
        markStorageLocked()
        session.value = SessionState.SignedOut
    }

    private suspend fun storageProblem(): RequestFailure {
        storageFailure()
        return RequestFailure(Failure(FailureKind.UNEXPECTED))
    }

    private fun bearer(token: String): String = "Bearer ${token.also { checkedClaims(it) }}"

    // These fields bind transport and session rotation. They never authorize platform access.
    private fun checkedClaims(token: String): TokenIdentity {
        val claims = runCatching {
            val parts = token.split('.')
            require(parts.size == 3 && token.length <= 8192)
            val payload = Json.parseToJsonElement(parts[1].decodeBase64()!!.utf8()).jsonObject
            require(payload["iss"]?.jsonPrimitive?.content == issuer)
            require(payload["role"]?.jsonPrimitive?.content == "authenticated")
            require(payload["is_anonymous"]?.jsonPrimitive?.content != "true")
            TokenIdentity(payload.getValue("sub").jsonPrimitive.content,
                payload.getValue("session_id").jsonPrimitive.content, payload["aal"]?.jsonPrimitive?.content)
        }.getOrNull()
        return claims ?: throw RequestFailure(Failure(FailureKind.UNAUTHORIZED))
    }

    private data class TokenIdentity(val subject: String, val sessionId: String, val aal: String?)
}
