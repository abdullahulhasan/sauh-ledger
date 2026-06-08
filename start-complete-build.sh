#!/bin/bash
# Complete background Android builder for Sauh Ledger
set -e

# Redirect all stdout/stderr to a persistent log file in workspace
exec >/tmp/complete-build.log 2>&1

echo "=========================================="
echo "=== SAUH LEDGER ANDROID BUILD TRIGGERED ==="
echo "Date: $(date)"
echo "=========================================="

echo "Step 1/10: Installing Capacitor core, cli and android packages..."
npm install @capacitor/core @capacitor/cli @capacitor/android --no-audit --no-fund

echo "Step 2/10: Initializing Capacitor app config..."
npx cap init "Sauh Ledger" "com.sauhinc.sauhleger" --web-dir=dist

echo "Step 3/10: Adding Android native platform..."
npx cap add android

echo "Step 4/10: Copying google-services.json to Android app target..."
cp /google-services.json /android/app/google-services.json || cp google-services.json android/app/google-services.json

echo "Step 5/10: Setting up portable JDK 21..."
# Create directory jdk
mkdir -p /tmp/jdk21
# Download JDK 21 using node fetch or curl or wget
node -e "
const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');

const url = 'https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse';
const dest = '/tmp/jdk21.tar.gz';

console.log('Downloading JDK 21 from Adoptium...');
const file = fs.createWriteStream(dest);

function download(targetUrl) {
  https.get(targetUrl, (res) => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      download(res.headers.location);
      return;
    }
    if (res.statusCode !== 200) {
      console.error('Failed to download JDK: code ' + res.statusCode);
      process.exit(1);
    }
    res.pipe(file);
    file.on('finish', () => {
      file.close();
      console.log('JDK download complete. Extracting...');
      try {
        execSync('tar -xzf /tmp/jdk21.tar.gz -C /tmp/jdk21 --strip-components=1');
        console.log('JDK extraction complete!');
        fs.unlinkSync(dest);
      } catch (err) {
        console.error('Extraction failed:', err.message);
        process.exit(1);
      }
    });
  }).on('error', (err) => {
    console.error('Download error:', err.message);
    process.exit(1);
  });
}
download(url);
"

# Wait for extraction to complete by verifying java existence in loop
for i in {1..120}; do
  if [ -f "/tmp/jdk21/bin/java" ]; then
    echo "JDK successfully verified!"
    break
  fi
  sleep 2
done

if [ ! -f "/tmp/jdk21/bin/java" ]; then
  echo "Error: JDK 21 installation timed out or failed!"
  exit 1
fi

echo "Step 6/10: Setting up pre-approved Android SDK licenses..."
mkdir -p /tmp/android-sdk/licenses
echo -e "8933bad161ad5d8c1655679f88e0eb412c07a5e1\nd56f5187479451eabf109f547d900020d3e8e503\n24333f8a63b6825ea9c5514f83c2829b004d1fee\n7c25c71a361bc265e31fa023e3cb7be1f07e5b1f\n21332f1a63b6825ea9c5514f03c2829b004d1fee" > /tmp/android-sdk/licenses/android-sdk-license
echo -e "84831b9409646a918e30573bab4c9c91346d8abd" > /tmp/android-sdk/licenses/android-sdk-preview-license
echo -e "33b6a985e12ec617196a183b97455d315e21937f" > /tmp/android-sdk/licenses/google-gdk-license
echo -e "601085b96cd289133c9447432c7e09ab9fa157a9" > /tmp/android-sdk/licenses/android-googletv-license
echo -e "e9acabf3b5c75bf13c87e2124584615a6c0c2e64" > /tmp/android-sdk/licenses/mips-android-sysimage-license
echo "Android SDK licenses configured."

echo "Step 7/10: Building Vite web production assets..."
npm run build

echo "Step 8/10: Syncing Capacitor assets..."
npx cap sync

echo "Step 9/10: Compiling Android app to Release APK..."
export JAVA_HOME=/tmp/jdk21
export ANDROID_HOME=/tmp/android-sdk

# Run Cap build which triggers Gradle to build release APK
# If there's no keystore file inside android/app or android dir, gradle uses the release-unsigned build type
npx cap build android --androidreleasetype APK

echo "Step 10/10: Copying resulting APK to workspace assets..."
# Search where the build compiled APK is located and copy to /assets/
mkdir -p /assets
# Find the apk file in the android/app build directory
APK_FILE=$(find android/app/build/outputs/apk/ -name "*.apk" | head -n 1)
if [ -n "$APK_FILE" ]; then
  echo "Found compiled APK at: $APK_FILE"
  cp "$APK_FILE" /assets/sauh-ledger-release.apk
  cp "$APK_FILE" ./sauh-ledger-release.apk
  echo "Success! APK copied to ./sauh-ledger-release.apk and /assets/sauh-ledger-release.apk"
else
  echo "Error: Could not locate compiled APK output in android/app/build/outputs/apk/"
  exit 1
fi

echo "=========================================="
echo "=== SAUH LEDGER BUILD COMPLETED SUCCESSFULLY ==="
echo "Date: $(date)"
echo "=========================================="
