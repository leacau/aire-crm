const fs = require("fs");
const path = require("path");

const settingsPath = path.join(__dirname, "..", "android", "settings.gradle");

if (!fs.existsSync(settingsPath)) {
  console.error("android/settings.gradle was not found. Run expo prebuild first.");
  process.exit(1);
}

const original = fs.readFileSync(settingsPath, "utf8");
const defaultCall = "expoAutolinking.useExpoVersionCatalog()";
const patchedCall = `expoAutolinking.useExpoVersionCatalog(
  new File(expoAutolinking.reactNativeGradlePlugin, "gradle/libs.versions.toml").absolutePath,
  null
)`;

if (original.includes(patchedCall)) {
  console.log("Android settings already patched for local Gradle builds.");
  process.exit(0);
}

if (!original.includes(defaultCall)) {
  console.error("Could not find the Expo version catalog call in android/settings.gradle.");
  process.exit(1);
}

fs.writeFileSync(settingsPath, original.replace(defaultCall, patchedCall));
console.log("Patched android/settings.gradle for local Gradle builds.");
