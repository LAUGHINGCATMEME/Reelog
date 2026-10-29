#!/usr/bin/env bash
# Builds the Android APK: web build → copy into the Android project → Gradle build.
# Uses the JDK 21 and Android SDK in your home folder (Android's build tools don't support newer Java).
#
# With android/keystore.properties present (see android/app/build.gradle) this makes a signed
# release build; otherwise a debug build, signed with this computer's debug key.
# Android only installs an update signed with the same key as the installed app.
set -euo pipefail
cd "$(dirname "$0")/.."
export JAVA_HOME="${JAVA_HOME_21:-$HOME/.local/share/jdk-21}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
version=$(node -p "require('./package.json').version")
npx tsc -b
npx vite build
npx cap sync android
if [[ -f android/keystore.properties ]]; then
  (cd android && ./gradlew assembleRelease --console=plain -q)
  src=android/app/build/outputs/apk/release/app-release.apk
else
  echo "No android/keystore.properties: building a debug APK."
  (cd android && ./gradlew assembleDebug --console=plain -q)
  src=android/app/build/outputs/apk/debug/app-debug.apk
fi
# Only the newest build is kept in the folder.
rm -f ./Reelog*.apk
cp "$src" "./Reelog-$version.apk"
echo "APK ready: $(pwd)/Reelog-$version.apk"
