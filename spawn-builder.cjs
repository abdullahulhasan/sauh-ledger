const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const logFile = '/tmp/complete-build.log';
console.log('Spawning complete Node.js build worker daemon...');

// Pre-create/clean log file
fs.writeFileSync(logFile, '=== INITIALIZING BUILD WORKER DAEMON ===\n');

const workerPath = path.join(__dirname, 'build-worker.cjs');

const subprocess = spawn('node', [workerPath], {
  detached: true,
  stdio: 'ignore', // Let the worker cjs handle writing to its own log files robustly
  env: process.env
});

subprocess.unref();

console.log('Build worker daemon launched in background successfully! Tracking progress at /tmp/complete-build.log');
