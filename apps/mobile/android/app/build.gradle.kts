import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

val localProperties = Properties()
val localPropertiesFile = rootProject.file("local.properties")
if (localPropertiesFile.exists()) {
    localPropertiesFile.inputStream().use { localProperties.load(it) }
}

val mapsApiKey: String = project.findProperty("MAPS_API_KEY") as? String
    ?: localProperties.getProperty("MAPS_API_KEY")
    ?: System.getenv("MAPS_API_KEY")
    ?: ""

if (mapsApiKey.isEmpty()) {
    logger.warn("=========================================================================================")
    logger.warn("[Prakaro Build Warning] MAPS_API_KEY is not set in local.properties or environment!")
    logger.warn("Google Maps SDK will load a blank beige canvas with the Google logo due to empty API key.")
    logger.warn("Add 'MAPS_API_KEY=AIzaSy...' to apps/mobile/android/local.properties to fix.")
    logger.warn("=========================================================================================")
}

android {
    namespace = "com.prakaro.prakaro"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "com.prakaro.app"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName

        manifestPlaceholders["mapsApiKey"] = mapsApiKey
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
