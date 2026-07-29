const { spawnSync } = require('child_process');
const path = require('path');
const { loadMobileEnv } = require('./mobile-env.cjs');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || process.cwd(),
    env: process.env,
    shell: true,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

const envFile = loadMobileEnv({ override: true });
if (envFile) {
  console.log(`Loaded mobile build environment from ${envFile}`);
}

process.env.NODE_ENV = process.env.NODE_ENV || 'production';

run('node', ['scripts/check-env.cjs']);
run('npx', ['expo', 'prebuild', '--platform', 'android', '--clean']);
run('node', ['scripts/patch-android-local-build.cjs']);
run('gradlew.bat', ['assembleRelease'], { cwd: path.join(process.cwd(), 'android') });
