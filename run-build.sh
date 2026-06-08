#!/bin/bash
# Exit immediately if any command fails
set -e

echo "=== STARTING BULID PROCESS ==="
echo "Date: $(date)"

echo "Step 1: Building Vite Web Assets..."
npm run build

echo "Step 2: Syncing Capacitor..."
npx cap sync

echo "Step 3: Building Android APK..."
export JAVA_HOME=/tmp/jdk21
export ANDROID_HOME=/tmp/android-sdk
npx cap build android --androidreleasetype APK --keystorepath /rootDir/debug.keystore --keystorepass android --keystorealias androiddebugkey --keystorealiaspass android

echo "=== BUILD COMPLETED SUCCESSFULLY ==="
echo "Date: $(date)"
