package com.ayinou.app.core

import com.ayinou.app.BuildConfig
import com.ayinou.app.core.auth.AccessTokenSource
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

    @Provides @Singleton fun health(endpoint: Endpoint): HealthRepository =
        HealthRepository(platformApi(endpoint, AccessTokenSource { null }), endpoint.environment)
}
