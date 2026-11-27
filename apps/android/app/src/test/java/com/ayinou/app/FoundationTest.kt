package com.ayinou.app

import com.ayinou.app.core.network.*
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.yield
import retrofit2.Response
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.*
import org.junit.Test

class FoundationTest {
    @Test fun environmentsRejectPublicCleartextAndCrossEnvironmentOrigins() {
        Endpoint(ApiEnvironment.LOCAL, "http://10.0.2.2:3000/".toHttpUrl(), true)
        Endpoint(ApiEnvironment.REMOTE, "https://api-dev.ayinou.com/".toHttpUrl(), true)
        Endpoint(ApiEnvironment.PRODUCTION, "https://api.ayinou.com/".toHttpUrl(), false)
        val invalid = listOf(
            Triple(ApiEnvironment.LOCAL, "http://8.8.8.8:3000/", true),
            Triple(ApiEnvironment.LOCAL, "http://10.bad.0.0.2:3000/", true),
            Triple(ApiEnvironment.LOCAL, "http://10.0.2.2:3000/", false),
            Triple(ApiEnvironment.REMOTE, "http://api-dev.ayinou.com/", true),
            Triple(ApiEnvironment.PRODUCTION, "https://api-dev.ayinou.com/", false),
            Triple(ApiEnvironment.PRODUCTION, "https://api.ayinou.com:8443/", false),
        )
        invalid.forEach { (mode, url, debug) ->
            assertThrows(IllegalArgumentException::class.java) { Endpoint(mode, url.toHttpUrl(), debug) }
        }
    }

    @Test fun retriesOneSafeReadAndNeverAttachesCredentialsToHealth() = runTest {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setResponseCode(503).addHeader("Retry-After", "0"))
            server.enqueue(MockResponse().setBody("""{"status":"ok","service":"ayinou-api"}"""))
            assertEquals(ConnectivityResult.Available, repository(server).check())
            assertEquals(2, server.requestCount)
            repeat(2) {
                val request = server.takeRequest()
                assertEquals("GET", request.method)
                assertEquals("/health", request.path)
                assertNull(request.getHeader("Authorization"))
            }
        }
    }

    @Test fun longRetryAfterDefersAndStructuredErrorsCarryOnlySafeReference() = runTest {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setResponseCode(429).addHeader("Retry-After", "120")
                .setBody("""{"error":{"code":"RATE_LIMITED","message":"Internal test detail","requestId":"sample-34"}}"""))
            assertEquals(ConnectivityResult.Problem(Failure(FailureKind.RATE_LIMITED, "sample-34")), repository(server).check())
            assertEquals(1, server.requestCount)
        }
    }

    @Test fun rejectsUnexpectedPayloadAndDoesNotFollowRedirects() = runTest {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setBody("""{"status":"ok","service":"wrong"}"""))
            server.enqueue(MockResponse().setResponseCode(302).addHeader("Location", "/different"))
            val repository = repository(server)
            repeat(2) { assertEquals(ConnectivityResult.Problem(Failure(FailureKind.UNEXPECTED)), repository.check()) }
            assertEquals(2, server.requestCount)
        }
    }

    @Test fun cancellationInterruptsTheHealthRequestWithoutRetrying() = runTest {
        var calls = 0
        var cancelled = false
        val api = object : PlatformApi {
            override suspend fun health(): Response<HealthDto> {
                calls++
                try { awaitCancellation() } finally { cancelled = true }
            }
        }
        val job = launch { HealthRepository(api, ApiEnvironment.LOCAL).check() }
        yield()
        job.cancel()
        job.join()
        assertTrue(cancelled)
        assertEquals(1, calls)
    }

    private fun repository(server: MockWebServer): HealthRepository {
        val endpoint = Endpoint(ApiEnvironment.LOCAL, server.url("/").newBuilder().host("127.0.0.1").build(), true)
        return HealthRepository(platformApi(endpoint), endpoint.environment)
    }
}
