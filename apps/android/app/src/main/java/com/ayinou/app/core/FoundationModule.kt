package com.ayinou.app.core

import com.ayinou.app.BuildConfig
import com.ayinou.app.core.auth.AccountRepository
import com.ayinou.app.core.auth.accountApi
import com.ayinou.app.core.auth.authApi
import com.ayinou.app.core.auth.CredentialStore
import com.ayinou.app.core.auth.KeystoreCredentialStore
import com.ayinou.app.core.network.ApiEnvironment
import com.ayinou.app.core.network.Endpoint
import com.ayinou.app.core.network.HealthRepository
import com.ayinou.app.core.network.platformApi
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import java.util.Locale
import javax.inject.Singleton
import okhttp3.HttpUrl.Companion.toHttpUrl

@Module
@InstallIn(SingletonComponent::class)
abstract class StorageBindings {
    @Binds abstract fun credentials(implementation: KeystoreCredentialStore): CredentialStore
}

@Module
@InstallIn(SingletonComponent::class)
object FoundationModule {
    @Provides @Singleton fun endpoint(): Endpoint = Endpoint(
        ApiEnvironment.valueOf(BuildConfig.API_ENVIRONMENT.uppercase(Locale.ROOT)),
        BuildConfig.API_BASE_URL.toHttpUrl(), BuildConfig.DEBUG,
    )

    @Provides @Singleton fun accounts(endpoint: Endpoint, credentials: CredentialStore): AccountRepository {
        if (BuildConfig.DEBUG && endpoint.environment == ApiEnvironment.REMOTE) {
            val key = BuildConfig.REMOTE_AUTH_KEY
            val origin = "https://hcbxulyfmdmuyccgrujs.supabase.co/".toHttpUrl()
            val enabled = key.startsWith("sb_publishable_")
            return AccountRepository(
                if (enabled) authApi(origin, key) else null,
                if (enabled) accountApi(endpoint) else null,
                credentials,
                origin.resolve("auth/v1").toString(),
                remoteReadOnly = true,
            )
        }
        val key = BuildConfig.DISPOSABLE_AUTH_KEY
        val port = BuildConfig.DISPOSABLE_AUTH_PORT
        val enabled = BuildConfig.DEBUG && endpoint.environment == ApiEnvironment.LOCAL &&
            endpoint.url.host == "10.0.2.2" && port == 55321 && key.startsWith("sb_publishable_")
        val origin = "http://10.0.2.2:$port/".toHttpUrl()
        return AccountRepository(
            if (enabled) authApi(origin, key) else null,
            if (enabled) accountApi(endpoint) else null,
            credentials,
            "http://127.0.0.1:$port/auth/v1",
        )
    }

    @Provides @Singleton fun health(endpoint: Endpoint): HealthRepository =
        HealthRepository(platformApi(endpoint), endpoint.environment)
}
