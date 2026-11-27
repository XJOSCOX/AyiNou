package com.ayinou.app.core.auth

import com.ayinou.app.core.network.ApiEnvironment
import com.ayinou.app.core.network.Endpoint
import com.ayinou.app.core.network.Failure
import com.ayinou.app.core.network.FailureKind
import com.ayinou.app.core.network.guardedClient
import java.io.IOException
import java.net.SocketTimeoutException
import javax.net.ssl.SSLException
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import okhttp3.HttpUrl
import okhttp3.MediaType.Companion.toMediaType
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path

private val json = Json { ignoreUnknownKeys = true }

@Serializable internal class PasswordGrant(val email: String, val password: String)
@Serializable internal class RefreshGrant(@SerialName("refresh_token") val token: String)
@Serializable internal class VerifyFactor(@SerialName("challenge_id") val challenge: String, val code: String)
@Serializable internal class Challenge(val id: String)
@Serializable internal class TokenGrant(
    @SerialName("access_token") val accessToken: String,
    @SerialName("refresh_token") val refreshToken: String,
    @SerialName("expires_in") val expiresIn: Long,
) {
    fun credentials(now: Long): Credentials {
        if (accessToken.isBlank() || refreshToken.isBlank() || expiresIn !in 1..86400) {
            throw RequestFailure(Failure(FailureKind.UNEXPECTED))
        }
        return Credentials(accessToken, refreshToken, now + expiresIn)
    }
}

@Serializable internal class AuthUser(
    val id: String,
    val factors: List<Factor> = emptyList(),
)

@Serializable internal class Factor(
    val id: String,
    val status: String,
    @SerialName("factor_type") val type: String,
)

@Serializable data class ProfileEnvelope(val profile: AccountProfile?)

@Serializable data class AccountProfile(
    val userId: String,
    val displayName: String?,
    val username: String? = null,
    val firstName: String? = null,
    val lastName: String? = null,
    val membershipCategory: String? = null,
    val preferredLocale: String,
    val onboardingStep: Int? = null,
    val residenceCountryCode: String? = null,
    val residenceDepartmentCode: String? = null,
    val diasporaDepartmentCode: String? = null,
    val interests: List<String> = emptyList(),
    val experience: MemberExperience? = null,
)

@Serializable data class MemberExperience(val memberAccess: Boolean, val applies: Boolean, val policy: MemberPolicy)

@Serializable data class MemberPolicy(
    val onboardingEnabled: Boolean,
    val profilesEnabled: Boolean,
    val profileEdits: Boolean,
    val requireCountry: Boolean,
    val requireDepartment: Boolean,
    val requireInterests: Boolean,
    val allowSkip: Boolean,
)

@Serializable internal class Badge(val verified: Boolean)
@Serializable internal class AccountStanding(val restriction: String)


internal interface AuthApi {
    @POST("auth/v1/token?grant_type=password")
    suspend fun signIn(@Body grant: PasswordGrant): Response<TokenGrant>

    @POST("auth/v1/token?grant_type=refresh_token")
    suspend fun refresh(@Body grant: RefreshGrant): Response<TokenGrant>

    @GET("auth/v1/user")
    suspend fun user(@Header("Authorization") bearer: String): Response<AuthUser>

    @POST("auth/v1/factors/{id}/challenge")
    suspend fun challenge(@Header("Authorization") bearer: String, @Path("id") id: String,
        @Body body: JsonObject = JsonObject(emptyMap())): Response<Challenge>

    @POST("auth/v1/factors/{id}/verify")
    suspend fun verify(@Header("Authorization") bearer: String, @Path("id") id: String,
        @Body proof: VerifyFactor): Response<TokenGrant>

    @POST("auth/v1/logout?scope=local")
    suspend fun signOut(@Header("Authorization") bearer: String): Response<Unit>
}

internal interface AccountApi {
    @GET("api/v1/me/profile")
    suspend fun profile(@Header("Authorization") bearer: String): Response<ProfileEnvelope>

    @GET("api/v1/me/verification-badge")
    suspend fun badge(@Header("Authorization") bearer: String): Response<Badge>

    @GET("api/v1/me/account-standing")
    suspend fun standing(@Header("Authorization") bearer: String): Response<AccountStanding>

    @PATCH("api/v1/me/profile/details")
    suspend fun onboard(@Header("Authorization") bearer: String, @Body details: JsonObject): Response<ProfileEnvelope>
}

internal fun authApi(origin: HttpUrl, publishableKey: String): AuthApi =
    retrofit(origin, publishableKey).create(AuthApi::class.java)

internal fun accountApi(endpoint: Endpoint): AccountApi =
    retrofit(endpoint.url, readOnly = endpoint.environment == ApiEnvironment.REMOTE).create(AccountApi::class.java)

private fun retrofit(origin: HttpUrl, publishableKey: String? = null, readOnly: Boolean = false): Retrofit =
    Retrofit.Builder().baseUrl(origin).client(guardedClient(origin, publishableKey, readOnly))
        .addConverterFactory(json.asConverterFactory("application/json".toMediaType())).build()

internal class RequestFailure(val failure: Failure, val code: String? = null) : Exception()

@Serializable private class ErrorWire(val error: PlatformError? = null, val error_code: String? = null)
@Serializable private class PlatformError(val code: String, val requestId: String? = null)

internal fun Response<*>.failure(): RequestFailure {
    val payload = errorBody()?.use {
        val source = it.source()
        if (source.request(16_385)) null else
            runCatching { json.decodeFromString<ErrorWire>(source.readUtf8()) }.getOrNull()
    }
    val kind = when (code()) {
        400, 422 -> FailureKind.BAD_REQUEST
        401 -> FailureKind.UNAUTHORIZED
        403 -> FailureKind.FORBIDDEN
        404 -> FailureKind.NOT_FOUND
        409 -> FailureKind.CONFLICT
        429 -> FailureKind.RATE_LIMITED
        502, 503, 504 -> FailureKind.UNAVAILABLE
        500 -> FailureKind.SERVER
        else -> FailureKind.UNEXPECTED
    }
    val ref = payload?.error?.requestId?.takeIf { it.matches(Regex("[A-Za-z0-9-]{1,64}")) }
    return RequestFailure(Failure(kind, ref), payload?.error?.code ?: payload?.error_code)
}

internal fun <T> Response<T>.required(): T =
    if (isSuccessful) body() ?: throw RequestFailure(Failure(FailureKind.UNEXPECTED))
    else throw failure()

internal suspend fun <T> request(call: suspend () -> T): T = try {
    call()
} catch (_: SSLException) {
    throw RequestFailure(Failure(FailureKind.TLS))
} catch (_: SocketTimeoutException) {
    throw RequestFailure(Failure(FailureKind.TIMEOUT))
} catch (_: IOException) {
    throw RequestFailure(Failure(FailureKind.OFFLINE))
} catch (_: SerializationException) {
    throw RequestFailure(Failure(FailureKind.UNEXPECTED))
}
