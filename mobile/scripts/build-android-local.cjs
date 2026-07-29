const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { loadMobileEnv } = require('./mobile-env.cjs');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || process.cwd(),
    env: process.env,
    shell: true,
    stdio: 'inherit',
  });

  if (result.status !== 0 && !options.allowFailure) {
    process.exit(result.status || 1);
  }

  return result;
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function stopGradleDaemons() {
  const androidDir = path.join(process.cwd(), 'android');
  const gradlewPath = path.join(androidDir, 'gradlew.bat');

  if (!fs.existsSync(gradlewPath)) return;

  console.log('Stopping local Gradle daemons before regenerating android code...');
  run('gradlew.bat', ['--stop'], { cwd: androidDir, allowFailure: true });
}

function hasAndroidProject() {
  return fs.existsSync(path.join(process.cwd(), 'android', 'gradlew.bat'));
}

function shouldSkipPrebuild() {
  return process.argv.includes('--skip-prebuild') || process.env.SKIP_EXPO_PREBUILD === '1';
}

function runExpoPrebuildClean() {
  stopGradleDaemons();

  const firstAttempt = run('npx', ['expo', 'prebuild', '--platform', 'android', '--clean'], { allowFailure: true });
  if (firstAttempt.status === 0) return;

  console.log('expo prebuild could not clean android on the first attempt. Waiting and retrying once...');
  stopGradleDaemons();
  sleep(2500);

  const secondAttempt = run('npx', ['expo', 'prebuild', '--platform', 'android', '--clean'], { allowFailure: true });
  if (secondAttempt.status === 0) return;

  console.error('');
  if (hasAndroidProject()) {
    console.error('No se pudo limpiar la carpeta android. Se reutilizara el proyecto Android existente para compilar el APK.');
    console.error('Si cambiaste app.json, plugins nativos o dependencias nativas, cierra procesos que bloqueen mobile/android y vuelve a correr el build completo.');
    return;
  }

  console.error('No se pudo limpiar la carpeta android y no existe un proyecto Android reutilizable. Cierra Android Studio, emuladores, exploradores abiertos dentro de mobile/android y vuelve a intentar.');
  process.exit(secondAttempt.status || 1);
}

const envFile = loadMobileEnv({ override: true });
if (envFile) {
  console.log(`Loaded mobile build environment from ${envFile}`);
}

process.env.NODE_ENV = process.env.NODE_ENV || 'production';

run('node', ['scripts/check-env.cjs']);
if (shouldSkipPrebuild()) {
  if (!hasAndroidProject()) {
    console.error('No existe mobile/android para reutilizar. Ejecuta primero el build completo sin --skip-prebuild.');
    process.exit(1);
  }
  console.log('Skipping expo prebuild and reusing the existing android project.');
} else {
  runExpoPrebuildClean();
}
run('node', ['scripts/patch-android-local-build.cjs']);
run('gradlew.bat', ['assembleRelease'], { cwd: path.join(process.cwd(), 'android') });
