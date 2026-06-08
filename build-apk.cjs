const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const logFile = '/tmp/build.log';
const out = fs.openSync(logFile, 'w');
const err = fs.openSync(logFile, 'a');

console.log('Spawning the build shell script in background...');
console.log('Logs will be written to:', logFile);

// Resolve the path to the bash script in our workspace
const scriptPath = path.join(__dirname, 'run-build.sh');

const subprocess = spawn('bash', [scriptPath], {
  detached: true,
  stdio: [ 'ignore', out, err ],
  env: { ...process.env, JAVA_HOME: '/tmp/jdk21' }
});

subprocess.unref();

fs.writeFileSync('/tmp/build-status.json', JSON.stringify({ status: 'running', startTime: new Date().toISOString() }));

console.log('Background build worker initialized!');
