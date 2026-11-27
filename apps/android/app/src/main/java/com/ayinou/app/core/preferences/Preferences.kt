package com.ayinou.app.core.preferences

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map

enum class AppLanguage(val tag: String) { CREOLE("ht"), FRENCH("fr"), ENGLISH("en"), SPANISH("es") }
enum class AppTheme { SYSTEM, LIGHT, DARK }

data class Preferences(
    val language: AppLanguage = AppLanguage.CREOLE,
    val theme: AppTheme = AppTheme.SYSTEM,
    val recoveredStorageFailure: Boolean = false,
)

private val Context.ayinouPreferences by preferencesDataStore("ayinou_preferences")

@Singleton
class PreferencesRepository @Inject constructor(@ApplicationContext context: Context) {
    private val store = context.ayinouPreferences
    private val language = stringPreferencesKey("language")
    private val theme = stringPreferencesKey("theme")

    val values = store.data.map { data ->
        Preferences(
            language = AppLanguage.entries.firstOrNull { it.tag == data[language] } ?: AppLanguage.CREOLE,
            theme = AppTheme.entries.firstOrNull { it.name == data[theme] } ?: AppTheme.SYSTEM,
        )
    }.catch {
        if (it !is IOException) throw it
        emit(Preferences(recoveredStorageFailure = true))
    }

    suspend fun setLanguage(value: AppLanguage) { store.edit { it[language] = value.tag } }
    suspend fun setTheme(value: AppTheme) { store.edit { it[theme] = value.name } }
}
