package com.ayinou.app.core.auth

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import java.io.IOException
import java.security.GeneralSecurityException
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json

sealed interface SessionState {
    data object SignedOut : SessionState
    data object Expired : SessionState
    data object MfaRequired : SessionState
    data class Member(val subject: String) : SessionState
}

interface AuthenticationRepository {
    val state: StateFlow<SessionState>
    suspend fun signOut()
    suspend fun revokeSession()
}

fun interface AccessTokenSource { fun currentAccessToken(): String? }
fun interface TokenRefreshCoordinator { suspend fun refresh(rejectedAccessToken: String): Boolean }

@Serializable
class Credentials(val accessToken: String, val refreshToken: String, val expiresAtEpochSeconds: Long) {
    override fun toString(): String = "Credentials(redacted)"
}

interface CredentialStore {
    suspend fun read(): Credentials?
    suspend fun write(credentials: Credentials)
    suspend fun clear()
}

@Singleton
class KeystoreCredentialStore @Inject constructor(@ApplicationContext context: Context) : CredentialStore {
    private val file = AtomicFile(File(context.noBackupFilesDir, "session.aesgcm"))
    private val mutex = Mutex()
    private val alias = "ayinou.session.v1"

    override suspend fun read(): Credentials? = withContext(Dispatchers.IO) {
        mutex.withLock {
            try {
                if (!file.baseFile.exists() || file.baseFile.length() !in 29..65536) return@withLock null
                val bytes = file.readFully()
                if (bytes[0] != 1.toByte()) return@withLock null
                val key = keyStore().getKey(alias, null) as? SecretKey ?: return@withLock null
                val cipher = Cipher.getInstance("AES/GCM/NoPadding")
                cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, bytes.copyOfRange(1, 13)))
                Json.decodeFromString<Credentials>(cipher.doFinal(bytes, 13, bytes.size - 13).decodeToString())
            } catch (_: GeneralSecurityException) {
                null
            } catch (_: IOException) {
                null
            } catch (_: SerializationException) {
                null
            }
        }
    }

    override suspend fun write(credentials: Credentials) = withContext(Dispatchers.IO) {
        mutex.withLock {
            val plaintext = Json.encodeToString(Credentials.serializer(), credentials).encodeToByteArray()
            require(plaintext.size <= 65507)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, existingOrNewKey())
            val sealed = byteArrayOf(1) + cipher.iv + cipher.doFinal(plaintext)
            val output = file.startWrite()
            try {
                output.write(sealed)
                file.finishWrite(output)
            } catch (error: IOException) {
                file.failWrite(output)
                throw error
            }
        }
    }

    override suspend fun clear() = withContext(Dispatchers.IO) {
        mutex.withLock {
            val store = keyStore()
            if (store.containsAlias(alias)) store.deleteEntry(alias)
            file.delete()
        }
    }

    private fun keyStore(): KeyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

    private fun existingOrNewKey(): SecretKey = (keyStore().getKey(alias, null) as? SecretKey) ?:
        KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build())
        }.generateKey()
}
