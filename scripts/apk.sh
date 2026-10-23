#!/usr/bin/env bash
# Builds the Android APK: web build → copy into the Android project → Gradle debug build.
# Uses the JDK 21 and Android SDK in your home folder (Android's build tools don't support newer Java).
set -euo pipefail
cd "$(dirname "$0")/.."
export JAVA_HOME="${JAVA_HOME_21:-$HOME/.local/share/jdk-21}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
npx vite build
npx cap sync android
(cd android && ./gradlew assembleDebug --console=plain -q)
cp android/app/build/outputs/apk/debug/app-debug.apk ./Reelog.apk
echo "APK ready: $(pwd)/Reelog.apk"
