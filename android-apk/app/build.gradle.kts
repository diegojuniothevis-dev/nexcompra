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
        versionCode = 937
        versionName = "9.3.7"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}
