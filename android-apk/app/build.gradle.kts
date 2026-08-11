plugins {
    id("com.android.application")
}

android {
    namespace = "com.nexcompra.erp"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.nexcompra.erp"
        minSdk = 24
        targetSdk = 35
        versionCode = 5
        versionName = "5.3.5"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}
