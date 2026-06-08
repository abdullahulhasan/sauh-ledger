const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');

const JDK_URL = 'https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse';
const TMP_DIR = '/tmp/jdk21';
const TAR_FILE = '/tmp/jdk21.tar.gz';

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    
    function get(url) {
      https.get(url, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          // Follow redirect
          get(response.headers.location);
          return;
        }
        
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: ${response.statusCode} ${response.statusMessage}`));
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
  try {
    console.log('Checking if JDK 21 is already installed at:', TMP_DIR);
    let isInstalled = false;
    try {
      if (fs.existsSync(path.join(TMP_DIR, 'bin', 'java'))) {
        const ver = execSync(`${path.join(TMP_DIR, 'bin', 'java')} -version 2>&1`).toString().trim();
        console.log('JDK is already installed! Version info:\n', ver);
        isInstalled = true;
      }
    } catch (e) {
      console.log('Existing JDK validation failed, reinstalling...', e.message);
    }
    
    if (!isInstalled) {
      console.log('Creating directory:', TMP_DIR);
      if (!fs.existsSync(TMP_DIR)) {
        fs.mkdirSync(TMP_DIR, { recursive: true });
      }
      
      console.log('Downloading JDK 21 from:', JDK_URL);
      await downloadFile(JDK_URL, TAR_FILE);
      console.log('Download finished. Extracting to:', TMP_DIR);
      
      execSync(`tar -xzf ${TAR_FILE} -C ${TMP_DIR} --strip-components=1`);
      console.log('Extraction complete!');
      
      // Clean up tar file
      if (fs.existsSync(TAR_FILE)) {
        fs.unlinkSync(TAR_FILE);
        console.log('Cleaned up temp tar file.');
      }
      
      const javaPath = path.join(TMP_DIR, 'bin', 'java');
      const ver = execSync(`${javaPath} -version 2>&1`).toString().trim();
      console.log('Successfully set up JDK 21! Java Version:\n', ver);
    }
    
    // Set JAVA_HOME in current process (doesn't persist across separate execs, but verifies)
    process.env.JAVA_HOME = TMP_DIR;
    console.log('JAVA_HOME verified at:', process.env.JAVA_HOME);

    // Setup Android SDK directory and pre-approved licenses
    const sdkDir = '/tmp/android-sdk';
    const licensesDir = path.join(sdkDir, 'licenses');
    console.log('Setting up Android SDK directory at:', sdkDir);
    if (!fs.existsSync(licensesDir)) {
      fs.mkdirSync(licensesDir, { recursive: true });
    }

    const licenses = {
      'android-sdk-license': '8933bad161ad5d8c1655679f88e0eb412c07a5e1\nd56f5187479451eabf109f547d900020d3e8e503\n24333f8a63b6825ea9c5514f83c2829b004d1fee\n7c25c71a361bc265e31fa023e3cb7be1f07e5b1f\n21332f1a63b6825ea9c5514f03c2829b004d1fee',
      'android-sdk-preview-license': '84831b9409646a918e30573bab4c9c91346d8abd',
      'google-gdk-license': '33b6a985e12ec617196a183b97455d315e21937f',
      'android-googletv-license': '601085b96cd289133c9447432c7e09ab9fa157a9',
      'mips-android-sysimage-license': 'e9acabf3b5c75bf13c87e2124584615a6c0c2e64'
    };

    for (const [filename, hash] of Object.entries(licenses)) {
      const filepath = path.join(licensesDir, filename);
      fs.writeFileSync(filepath, hash);
      console.log(`Wrote Android license approval: ${filename}`);
    }
  } catch (error) {
    console.error('Fatal setup error:', error);
    process.exit(1);
  }
}

main();
