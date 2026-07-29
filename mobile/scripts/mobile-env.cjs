const fs = require('fs');
const path = require('path');

function parseEnvFile(filePath) {
  const values = {};
  const content = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) continue;

    const name = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (!name) continue;

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[name] = value;
  }

  return values;
}

function resolveMobileEnvFile() {
  const explicitPath = process.env.MOBILE_ENV_FILE || process.env.ENV_FILE;
  if (explicitPath) return path.resolve(explicitPath);

  const defaultPath = path.join(process.cwd(), '.env.preview');
  if (fs.existsSync(defaultPath)) return defaultPath;

  return null;
}

function loadMobileEnv({ override = true } = {}) {
  const envFile = resolveMobileEnvFile();
  if (!envFile) return null;

  if (!fs.existsSync(envFile)) {
    throw new Error(`No existe el archivo de entorno mobile: ${envFile}`);
  }

  const values = parseEnvFile(envFile);
  for (const [name, value] of Object.entries(values)) {
    if (override || !process.env[name]) {
      process.env[name] = value;
    }
  }

  return envFile;
}

module.exports = {
  loadMobileEnv,
  parseEnvFile,
  resolveMobileEnvFile,
};
