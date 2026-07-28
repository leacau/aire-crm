const fs = require("fs");
const path = require("path");

const settingsPath = path.join(__dirname, "..", "android", "settings.gradle");
const gradlePropertiesPath = path.join(__dirname, "..", "android", "gradle.properties");

if (!fs.existsSync(settingsPath)) {
  console.error("android/settings.gradle was not found. Run expo prebuild first.");
  process.exit(1);
}

const originalSettings = fs.readFileSync(settingsPath, "utf8");
const defaultCall = "expoAutolinking.useExpoVersionCatalog()";
const patchedCall = `expoAutolinking.useExpoVersionCatalog(
  new File(expoAutolinking.reactNativeGradlePlugin, "gradle/libs.versions.toml").absolutePath,
  null
)`;

let settings = originalSettings;
if (!settings.includes(patchedCall)) {
  if (!settings.includes(defaultCall)) {
    console.error("Could not find the Expo version catalog call in android/settings.gradle.");
    process.exit(1);
  }

  settings = settings.replace(defaultCall, patchedCall);
}

if (!fs.existsSync(gradlePropertiesPath)) {
  console.error("android/gradle.properties was not found. Run expo prebuild first.");
  process.exit(1);
}

const originalGradleProperties = fs.readFileSync(gradlePropertiesPath, "utf8");
let gradleProperties = originalGradleProperties
  .replace(/^expo\.gif\.enabled=.*$/m, "expo.gif.enabled=false")
  .replace(/^expo\.webp\.enabled=.*$/m, "expo.webp.enabled=false")
  .replace(/^expo\.webp\.animated=.*$/m, "expo.webp.animated=false");

if (!/^expo\.gif\.enabled=/m.test(gradleProperties)) {
  gradleProperties += "\nexpo.gif.enabled=false";
}

if (!/^expo\.webp\.enabled=/m.test(gradleProperties)) {
  gradleProperties += "\nexpo.webp.enabled=false";
}

if (!/^expo\.webp\.animated=/m.test(gradleProperties)) {
  gradleProperties += "\nexpo.webp.animated=false";
}

if (settings !== originalSettings) {
  fs.writeFileSync(settingsPath, settings);
  console.log("Patched android/settings.gradle for local Gradle builds.");
} else {
  console.log("android/settings.gradle already patched for local Gradle builds.");
}

if (gradleProperties !== originalGradleProperties) {
  fs.writeFileSync(gradlePropertiesPath, gradleProperties);
  console.log("Disabled optional Fresco image codecs for local Gradle builds.");
} else {
  console.log("Optional Fresco image codecs already disabled for local Gradle builds.");
}
