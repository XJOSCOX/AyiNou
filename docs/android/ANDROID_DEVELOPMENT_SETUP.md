# Android development setup

Open `apps/android` as the existing Gradle project in Android Studio. The monorepo is the Git root. The verified toolchain is Android Studio 2026.2.2, bundled OpenJDK 25.0.4.1, Gradle 9.6.0, AGP 9.5.3, Kotlin Compose plugin 2.2.10, SDK 37, and minimum SDK 26. The Gradle daemon uses the generated JVM toolchain criteria. API 26 remains the minimum supported device level. Gradle versions and dependency pins are in the wrapper and `gradle/libs.versions.toml`.

Set the SDK path from Android Studio or with an ignored `local.properties`. Installed SDK, build tools, emulator image and Platform Tools are separate prerequisites. From `apps/android` on Windows:

```powershell
.\gradlew.bat clean :app:assembleDebug :app:testDebugUnitTest
.\gradlew.bat :app:connectedDebugAndroidTest
```

The default local build uses `http://10.0.2.2:3000/`. A physical-device development configuration can set `-PayinouLocalUrl=http://192.168.1.20:3000/` to an exact private IPv4 host supplied by the developer. Use the correct physical test host in place of the example. The separate debug build `-PayinouEnvironment=remote` uses `https://api-dev.ayinou.com/`. Its only implemented request is the public health route. Production is reserved at `https://api.ayinou.com/` and the release variant is disabled at A1.

## APK installation

- Android Studio can install using **Run** with the debug variant and a selected emulator.
- For ADB, run `adb -s emulator-5554 install -r app/build/outputs/apk/debug/app-debug.apk` from `apps/android`, adjusting the device serial to the authorized target.
- For manual installation, copy `app-debug.apk` to an authorized device, open it in Files, and use Android’s install prompt. An existing installation with a different signing key requires a separate migration decision before replacing it.
- This is the locally signed `com.ayinou.app` development package, version `1.0-dev`, with minimum Android 8.0. Keep the APK local. The source history contains the wrapper and build instructions.
