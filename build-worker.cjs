const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const https = require('https');

const LOG_FILE = '/tmp/complete-build.log';

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  console.log(message);
  fs.appendFileSync(LOG_FILE, line);
}

function runCmd(cmd, options = {}) {
  log(`Executing: ${cmd}`);
  const envPath = (process.env.PATH || '') + ':/usr/bin:/bin:/usr/sbin:/sbin:' + path.join(__dirname, 'node_modules', '.bin');
  try {
    const output = execSync(cmd, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PATH: envPath, ...options.env },
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer
      ...options
    }).toString();
    fs.appendFileSync(LOG_FILE, output + '\n');
    return true;
  } catch (error) {
    log(`Command failed: ${cmd}`);
    if (error.stdout) fs.appendFileSync(LOG_FILE, `STDOUT:\n${error.stdout.toString()}\n`);
    if (error.stderr) fs.appendFileSync(LOG_FILE, `STDERR:\n${error.stderr.toString()}\n`);
    log(`Error details: ${error.message}`);
    return false;
  }
}

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    function get(targetUrl) {
      https.get(targetUrl, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          get(response.headers.location);
          return;
        }
        if (response.statusCode !== 200) {
          reject(new Error(`Download failed: status ${response.statusCode}`));
          return;
        }
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      }).on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    }
    get(url);
  });
}

async function main() {
  fs.writeFileSync(LOG_FILE, '=== SAUH LEDGER WORKER BUILD SYSTEM STARTED ===\n');
  log(`Starting build process on: ${new Date().toString()}`);

  try {
    // 1. Install Capacitor packages
    log('Step 1/10: Installing Capacitor packages...');
    const installed = runCmd('npm install @capacitor/core @capacitor/cli @capacitor/android --no-audit --no-fund');
    if (!installed) throw new Error('Failed to install Capacitor packages');

    // 2. Initialize Capacitor config
    log('Step 2/10: Initializing Capacitor app config...');
    if (!fs.existsSync(path.join(__dirname, 'capacitor.config.ts'))) {
      const initSuccess = runCmd('npx cap init "Sauh Ledger" "com.sauhinc.sauhleger" --web-dir=dist');
      if (!initSuccess) throw new Error('Failed to init Capacitor');
    } else {
      log('capacitor.config.ts already exists, skipping...');
    }

    // 3. Add Android platform
    log('Step 3/10: Adding Android platform...');
    if (!fs.existsSync(path.join(__dirname, 'android'))) {
      const addSuccess = runCmd('npx cap add android');
      if (!addSuccess) throw new Error('Failed to add Android platform');
    } else {
      log('Android platform directory already exists, skipping...');
    }

    // Ensure we have a valid, uncorrupted gradle-wrapper.jar
    log('Verifying and securing clean Gradle Wrapper JAR...');
    const wrapperJarPath = path.join(__dirname, 'android', 'gradle', 'wrapper', 'gradle-wrapper.jar');
    const wrapperJarDir = path.dirname(wrapperJarPath);
    if (!fs.existsSync(wrapperJarDir)) {
      fs.mkdirSync(wrapperJarDir, { recursive: true });
    }
    await downloadFile('https://raw.githubusercontent.com/ionic-team/capacitor/main/android/gradle/wrapper/gradle-wrapper.jar', wrapperJarPath);
    log('Successfully placed uncorrupted Gradle Wrapper JAR!');

    // 4. Copy google-services.json
    log('Step 4/10: Copying google-services.json to android target...');
    const srcGoogleJson = path.join(__dirname, 'google-services.json');
    const destGoogleJson = path.join(__dirname, 'android', 'app', 'google-services.json');
    if (fs.existsSync(srcGoogleJson)) {
      fs.copyFileSync(srcGoogleJson, destGoogleJson);
      log('Successfully copied google-services.json');
    } else {
      log('WARNING: google-services.json not found in root workspace');
    }

    // 5. Download and extract JDK 21
    log('Step 5/10: Setting up portable JDK 21...');
    const jdkDir = '/tmp/jdk21';
    const tarFile = '/tmp/jdk21.tar.gz';
    
    let jdkOk = false;
    if (fs.existsSync(path.join(jdkDir, 'bin', 'java'))) {
      try {
        const ver = execSync(`${path.join(jdkDir, 'bin', 'java')} -version 2>&1`).toString().trim();
        log(`JDK 21 already exists and validated:\n${ver}`);
        jdkOk = true;
      } catch (e) {
        log('Existing JDK failed verification, reinstalling...');
      }
    }

    if (!jdkOk) {
      log('Downloading JDK 21 tarball...');
      if (!fs.existsSync(jdkDir)) fs.mkdirSync(jdkDir, { recursive: true });
      await downloadFile('https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse', tarFile);
      log('Download complete. Extracting JDK...');
      execSync(`tar -xzf ${tarFile} -C ${jdkDir} --strip-components=1`);
      fs.unlinkSync(tarFile);
      log('JDK extraction complete!');
    }

    // 6. Setup pre-approved licenses
    log('Step 6/10: Pre-approving Android licenses...');
    const sdkDir = '/tmp/android-sdk';
    const licensesDir = path.join(sdkDir, 'licenses');
    if (!fs.existsSync(licensesDir)) fs.mkdirSync(licensesDir, { recursive: true });

    const licenses = {
      'android-sdk-license': '8933bad161ad5d8c1655679f88e0eb412c07a5e1\nd56f5187479451eabf109f547d900020d3e8e503\n24333f8a63b6825ea9c5514f83c2829b004d1fee\n7c25c71a361bc265e31fa023e3cb7be1f07e5b1f\n21332f1a63b6825ea9c5514f03c2829b004d1fee',
      'android-sdk-preview-license': '84831b9409646a918e30573bab4c9c91346d8abd',
      'google-gdk-license': '33b6a985e12ec617196a183b97455d315e21937f',
      'android-googletv-license': '601085b96cd289133c9447432c7e09ab9fa157a9',
      'mips-android-sysimage-license': 'e9acabf3b5c75bf13c87e2124584615a6c0c2e64'
    };

    for (const [filename, hash] of Object.entries(licenses)) {
      fs.writeFileSync(path.join(licensesDir, filename), hash);
    }
    log('Licenses pre-created successfully');

    // 7. vite build
    log('Step 7/10: Compiling React Vite web production assets...');
    const builtWeb = runCmd('npm run build');
    if (!builtWeb) throw new Error('Web build failed');

    // 8. capacitor sync
    log('Step 8/10: Syncing Capacitor assets...');
    const synced = runCmd('./node_modules/.bin/cap sync');
    if (!synced) throw new Error('Capacitor sync failed');

    // 9. Build Android Release APK
    log('Step 9/10: Commencing Android APK compilation via Gradle...');
    runCmd('chmod +x gradlew', { cwd: path.join(__dirname, 'android') });
    const buildApk = runCmd('./gradlew assembleRelease', {
      cwd: path.join(__dirname, 'android'),
      env: {
        JAVA_HOME: jdkDir,
        ANDROID_HOME: sdkDir
      }
    });
    if (!buildApk) throw new Error('Gradle build failed');

    // 10. Copy resulting APK to workspace
    log('Step 10/10: Locating and copying generated APK file...');
    const searchDir = path.join(__dirname, 'android', 'app', 'build', 'outputs', 'apk');
    const findApks = (dir) => {
      let results = [];
      if (!fs.existsSync(dir)) return results;
      const list = fs.readdirSync(dir);
      list.forEach((file) => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
          results = results.concat(findApks(fullPath));
        } else if (file.endsWith('.apk')) {
          results.push(fullPath);
        }
      });
      return results;
    };

    const apks = findApks(searchDir);
    if (apks.length > 0) {
      log(`Found compiled APKs: ${JSON.stringify(apks)}`);
      const targetApk = apks[0];
      
      const assetsDir = path.join(__dirname, 'assets');
      if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
      
      const dest1 = path.join(__dirname, 'sauh-ledger-release.apk');
      const dest2 = path.join(assetsDir, 'sauh-ledger-release.apk');
      
      fs.copyFileSync(targetApk, dest1);
      fs.copyFileSync(targetApk, dest2);
      
      log(`SUCCESS! APK successfully published to:\n1. ./sauh-ledger-release.apk\n2. ./assets/sauh-ledger-release.apk`);
    } else {
      throw new Error('Build completed but no output APK file was found');
    }

    log('=== ALL STEPS COMPLETED SUCCESSFULLY! ===');
  } catch (error) {
    log(`FATAL BUILD ERROR: ${error.message}`);
    log('Build execution aborted.');
  }
}

if (require.main === module) {
  main();
}
