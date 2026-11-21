plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val webAppUrl = providers.gradleProperty("nuvioWebUrl")
    .orElse(providers.environmentVariable("NUVIO_WEB_URL"))
    .orElse("https://YOUR-VERCEL-DOMAIN.invalid/")
    .get()

android {
    namespace = "tv.nuvio.webhost"
    compileSdk = 35

    defaultConfig {
        applicationId = "tv.nuvio.webhost"
        minSdk = 24
        targetSdk = 35
        versionCode = 103
        versionName = "1.0.4"
        buildConfigField("String", "WEB_APP_URL", "\"${webAppUrl.replace("\\", "\\\\").replace("\"", "\\\"")}\"")
    }

    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    packaging { jniLibs { useLegacyPackaging = false } }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.media3:media3-exoplayer:1.8.0")
    implementation("androidx.media3:media3-exoplayer-hls:1.8.0")
    implementation("androidx.media3:media3-exoplayer-dash:1.8.0")
    implementation("androidx.media3:media3-ui:1.8.0")
    // Same Android libmpv artifact/version declared by the upstream Nuvio Mobile project.
    implementation("io.github.abdallahmehiz:mpv-android-lib:0.2.1")
}
