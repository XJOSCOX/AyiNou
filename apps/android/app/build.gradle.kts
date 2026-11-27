import java.net.URI
import org.gradle.api.DefaultTask
import org.gradle.api.file.DirectoryProperty
import org.gradle.api.provider.Property
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.OutputDirectory
import org.gradle.api.tasks.TaskAction

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.hilt)
    alias(libs.plugins.ksp)
}

abstract class LocalNetworkConfig : DefaultTask() {
    @get:Input abstract val cleartextHost: Property<String>
    @get:OutputDirectory abstract val resources: DirectoryProperty

    @TaskAction fun writeResources() {
        val host = cleartextHost.get()
        val domain = if (host.isEmpty()) "" else
            """<domain-config cleartextTrafficPermitted="true"><domain includeSubdomains="false">$host</domain></domain-config>"""
        val output = resources.file("xml/network_security_config.xml").get().asFile
        output.parentFile.mkdirs()
        output.writeText("""<network-security-config><base-config cleartextTrafficPermitted="false"/>$domain</network-security-config>""")
    }
}

val environment = providers.gradleProperty("ayinouEnvironment").orElse("local").get()
val localOverride = providers.gradleProperty("ayinouLocalUrl").orNull
val local = URI(localOverride ?: "http://10.0.2.2:3000")
val octets = local.host.orEmpty().split(".")
val hostParts = octets.mapNotNull(String::toIntOrNull)
val privateIpv4 = octets.size == 4 && octets.all { it.matches(Regex("0|[1-9][0-9]{0,2}")) } &&
    hostParts.size == 4 && hostParts.all { it in 0..255 } &&
    (hostParts[0] == 10 || hostParts[0] == 127 || hostParts.take(2) == listOf(192, 168) ||
        (hostParts[0] == 172 && hostParts[1] in 16..31))
require(environment in setOf("local", "remote")) { "Choose local or remote for a debug build." }
val disposableAuthKey = providers.environmentVariable("AYINOU_ANDROID_DISPOSABLE_PUBLISHABLE_KEY").orNull.orEmpty()
require(disposableAuthKey.isEmpty() || (environment == "local" && local.host == "10.0.2.2" &&
    disposableAuthKey.matches(Regex("sb_publishable_[A-Za-z0-9_-]{10,200}")))) {
    "Disposable authentication requires the emulator loopback and a local Supabase publishable key."
}
val disposableAuthPort = 55321
require(localOverride == null || environment == "local") { "Local overrides apply only to local development." }
require(local.scheme == "http" && privateIpv4 && local.port in 1..65535 &&
    local.userInfo == null && local.rawQuery == null && local.rawFragment == null &&
    local.rawPath in listOf("", "/")) { "Use an HTTP private IPv4 base URL with an explicit port." }
val debugUrl = if (environment == "local") local.toString().trimEnd('/') + "/" else "https://api-dev.ayinou.com/"

android {
    namespace = "com.ayinou.app"
    compileSdk { version = release(37) }

    defaultConfig {
        applicationId = "com.ayinou.app"
        minSdk = 26
        targetSdk = 37
        versionCode = 1
        versionName = "1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    buildTypes {
        debug {
            versionNameSuffix = "-dev"
            buildConfigField("String", "API_BASE_URL", "\"$debugUrl\"")
            buildConfigField("String", "API_ENVIRONMENT", "\"$environment\"")
            buildConfigField("String", "DISPOSABLE_AUTH_KEY", "\"$disposableAuthKey\"")
            buildConfigField("int", "DISPOSABLE_AUTH_PORT", "$disposableAuthPort")
        }
        release {
            buildConfigField("String", "API_BASE_URL", "\"https://api.ayinou.com/\"")
            buildConfigField("String", "API_ENVIRONMENT", "\"production\"")
            buildConfigField("String", "DISPOSABLE_AUTH_KEY", "\"\"")
            buildConfigField("int", "DISPOSABLE_AUTH_PORT", "0")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

androidComponents {
    // Release and signing remain locked until the separately authorized release phase.
    beforeVariants(selector().withBuildType("release")) { it.enable = false }
    onVariants(selector().withBuildType("debug")) { variant ->
        val config = tasks.register<LocalNetworkConfig>("generateDebugNetworkConfig") {
            cleartextHost.set(if (environment == "local") local.host else "")
            resources.set(layout.buildDirectory.dir("generated/ayinou/debugNetworkConfig"))
        }
        variant.sources.res?.addGeneratedSourceDirectory(config, LocalNetworkConfig::resources)
    }
}

dependencies {
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.lifecycle.compose)
    implementation(libs.navigation.compose)
    implementation(libs.datastore)
    implementation(libs.splashscreen)
    implementation(libs.coroutines)
    implementation(libs.hilt)
    ksp(libs.hilt.compiler)
    implementation(libs.retrofit)
    implementation(libs.retrofit.serialization)
    implementation(libs.okhttp)
    implementation(libs.serialization.json)
    implementation(libs.coil.compose)
    testImplementation(libs.junit)
    testImplementation(libs.coroutines.test)
    testImplementation(libs.mockwebserver)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.junit)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
    debugImplementation(libs.androidx.compose.ui.tooling)
}
