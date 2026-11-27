package com.ayinou.app.core.network

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.IOException
import java.net.SocketTimeoutException
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton
import javax.net.ssl.SSLException
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import okhttp3.HttpUrl
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import retrofit2.http.GET

enum class ApiEnvironment { LOCAL, REMOTE, PRODUCTION }

data class Endpoint(val environment: ApiEnvironment, val url: HttpUrl, val debug: Boolean) {
    init {
        val bare = url.encodedPath == "/" && url.encodedQuery == null && url.fragment == null &&
            url.username.isEmpty() && url.password.isEmpty()
        val octets = url.host.split(".")
        val parts = octets.mapNotNull(String::toIntOrNull)
        val local = octets.size == 4 && octets.all { it.matches(Regex("0|[1-9][0-9]{0,2}")) } &&
            parts.size == 4 && parts.all { it in 0..255 } &&
            (parts[0] in listOf(10, 127) || parts.take(2) == listOf(192, 168) ||
                (parts[0] == 172 && parts[1] in 16..31))
        require(bare && when (environment) {
            ApiEnvironment.LOCAL -> debug && local && url.scheme == "http"
            ApiEnvironment.REMOTE -> debug && url.toString() == "https://api-dev.ayinou.com/"
            ApiEnvironment.PRODUCTION -> !debug && url.toString() == "https://api.ayinou.com/"
        })
    }
}

@Serializable data class HealthDto(val status: String, val service: String)
@Serializable private data class ErrorEnvelope(val error: ErrorDto)
@Serializable private data class ErrorDto(val code: String, val message: String, val requestId: String? = null, val retryable: Boolean? = null)

interface PlatformApi { @GET("health") suspend fun health(): Response<HealthDto> }

enum class FailureKind {
    OFFLINE, TIMEOUT, TLS, BAD_REQUEST, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, CONFLICT,
    RATE_LIMITED, SERVER, UNAVAILABLE, UNEXPECTED, COLD_START
}

data class Failure(val kind: FailureKind, val requestId: String? = null)

sealed interface ConnectivityResult {
    data object Available : ConnectivityResult
    data class Problem(val error: Failure) : ConnectivityResult
}

private val wireJson = Json { ignoreUnknownKeys = true }

internal fun guardedClient(origin: HttpUrl, publishableKey: String? = null, readOnly: Boolean = false): OkHttpClient =
    OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(12, TimeUnit.SECONDS)
        .callTimeout(15, TimeUnit.SECONDS)
        .followRedirects(false)
        .followSslRedirects(false)
        .retryOnConnectionFailure(false)
        .addInterceptor(Interceptor { chain ->
            val request = chain.request()
            if (request.url.host != origin.host || request.url.scheme != origin.scheme ||
                request.url.port != origin.port) throw IOException("Unexpected API origin")
            if (readOnly && request.method !in setOf("GET", "HEAD")) throw IOException("Read-only API")
            val outgoing = request.newBuilder().removeHeader("apikey")
            if (request.url.encodedPath == "/health") outgoing.removeHeader("Authorization")
            if (publishableKey != null) outgoing.header("apikey", publishableKey)
            chain.proceed(outgoing.build())
        }).build()

fun platformApi(endpoint: Endpoint): PlatformApi {
    return Retrofit.Builder().baseUrl(endpoint.url).client(guardedClient(endpoint.url))
        .addConverterFactory(wireJson.asConverterFactory("application/json".toMediaType()))
        .build().create(PlatformApi::class.java)
}

class HealthRepository(private val api: PlatformApi, private val environment: ApiEnvironment) {
    suspend fun check(): ConnectivityResult = try {
        val first = api.health()
        val retry = waitForRetry(first)
        val result = if (retry != null) {
            first.errorBody()?.close()
            delay(retry)
            api.health()
        } else first
        interpret(result)
    } catch (_: SSLException) {
        ConnectivityResult.Problem(Failure(FailureKind.TLS))
    } catch (_: SocketTimeoutException) {
        ConnectivityResult.Problem(Failure(FailureKind.TIMEOUT))
    } catch (_: SerializationException) {
        ConnectivityResult.Problem(Failure(FailureKind.UNEXPECTED))
    } catch (_: IOException) {
        ConnectivityResult.Problem(Failure(FailureKind.OFFLINE))
    }

    private fun waitForRetry(response: Response<HealthDto>): Long? {
        if (response.code() !in setOf(429, 502, 503, 504)) return null
        val header = response.headers()["Retry-After"] ?: return if (response.code() == 429) null else 400
        // Retry-After values beyond the manual-check budget, including dates, defer to a manual retry.
        val seconds = header.toLongOrNull() ?: return null
        return seconds.takeIf { it in 0..2 }?.times(1000)
    }

    private fun interpret(response: Response<HealthDto>): ConnectivityResult {
        if (response.isSuccessful) {
            val payload = response.body()
            return if (payload?.status == "ok" && payload.service == "ayinou-api") ConnectivityResult.Available
            else ConnectivityResult.Problem(Failure(FailureKind.UNEXPECTED))
        }
        val error = response.errorBody()?.use { body ->
            val source = body.source()
            if (source.request(16385)) null else
                runCatching { wireJson.decodeFromString<ErrorEnvelope>(source.readUtf8()).error }.getOrNull()
        }
        val kind = when (response.code()) {
            400 -> FailureKind.BAD_REQUEST
            401 -> FailureKind.UNAUTHORIZED
            403 -> FailureKind.FORBIDDEN
            404 -> FailureKind.NOT_FOUND
            409 -> FailureKind.CONFLICT
            429 -> FailureKind.RATE_LIMITED
            500 -> FailureKind.SERVER
            502, 503, 504 -> if (environment == ApiEnvironment.REMOTE && error == null)
                FailureKind.COLD_START else FailureKind.UNAVAILABLE
            else -> FailureKind.UNEXPECTED
        }
        val reference = (error?.requestId ?: response.headers()["X-Request-ID"])
            ?.takeIf { it.matches(Regex("[A-Za-z0-9-]{1,64}")) }
        return ConnectivityResult.Problem(Failure(kind, reference))
    }
}

@Singleton
class ConnectivityMonitor @Inject constructor(@ApplicationContext context: Context) {
    private val manager = context.getSystemService(ConnectivityManager::class.java)

    val online = callbackFlow {
        fun publish() {
            trySend(manager.getNetworkCapabilities(manager.activeNetwork)
                ?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) == true)
        }
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) = publish()
            override fun onLost(network: Network) = publish()
        }
        manager.registerDefaultNetworkCallback(callback)
        publish()
        awaitClose { manager.unregisterNetworkCallback(callback) }
    }.distinctUntilChanged()
}
