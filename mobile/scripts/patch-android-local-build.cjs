const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

function runNpmPack(packageName, destination) {
  if (process.platform === "win32") {
    execFileSync("cmd.exe", ["/d", "/s", "/c", `npm pack ${packageName} --pack-destination "${destination}"`], {
      stdio: "ignore",
    });
    return;
  }

  execFileSync("npm", ["pack", packageName, "--pack-destination", destination], {
    stdio: "ignore",
  });
}

const settingsPath = path.join(__dirname, "..", "android", "settings.gradle");
const gradlePropertiesPath = path.join(__dirname, "..", "android", "gradle.properties");
const localPropertiesPath = path.join(__dirname, "..", "android", "local.properties");
const reactNativePath = path.join(__dirname, "..", "node_modules", "react-native");

function copyFileEnsuringDirectory(sourcePath, destinationPath) {
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(sourcePath, destinationPath);
}

function ensureReactNativeGradleFiles() {
  const packageJsonPath = path.join(reactNativePath, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    console.error("react-native is not installed. Run npm install first.");
    process.exit(1);
  }

  const reactNativeVersion = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")).version;
  const requiredFiles = [
    "gradle.properties",
    "gradle/libs.versions.toml",
    "ReactAndroid/gradle.properties",
    "ReactAndroid/hermes-engine/gradle.properties",
    "sdks/hermes-engine/version.properties",
  ];

  const missingFiles = requiredFiles.filter(relativePath => !fs.existsSync(path.join(reactNativePath, relativePath)));
  if (missingFiles.length === 0) {
    console.log("React Native Gradle files are present.");
    return;
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aire-crm-rn-"));
  runNpmPack(`react-native@${reactNativeVersion}`, tempDir);

  const tarballPath = path.join(tempDir, `react-native-${reactNativeVersion}.tgz`);
  execFileSync("tar", ["-xzf", tarballPath, "-C", tempDir], {
    stdio: "ignore",
  });

  for (const relativePath of missingFiles) {
    const sourcePath = path.join(tempDir, "package", relativePath);
    if (!fs.existsSync(sourcePath)) {
      console.error(`The react-native package did not include ${relativePath}.`);
      process.exit(1);
    }

    copyFileEnsuringDirectory(sourcePath, path.join(reactNativePath, relativePath));
  }

  console.log(`Restored missing React Native Gradle files: ${missingFiles.join(", ")}.`);
}

function resolveAndroidSdkPath() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Android", "Sdk") : "",
  ].filter(Boolean);

  return candidates.find(candidate => fs.existsSync(candidate));
}

function ensureAndroidLocalProperties() {
  const sdkPath = resolveAndroidSdkPath();
  if (!sdkPath) {
    console.warn("Android SDK path was not found. Set ANDROID_HOME or create android/local.properties manually.");
    return;
  }

  const normalizedSdkPath = sdkPath.replace(/\\/g, "/");
  const sdkLine = `sdk.dir=${normalizedSdkPath}`;
  const existing = fs.existsSync(localPropertiesPath) ? fs.readFileSync(localPropertiesPath, "utf8") : "";

  if (/^sdk\.dir=/m.test(existing)) {
    const next = existing.replace(/^sdk\.dir=.*$/m, sdkLine);
    if (next !== existing) {
      fs.writeFileSync(localPropertiesPath, next);
      console.log("Updated android/local.properties with the Android SDK path.");
    } else {
      console.log("android/local.properties already points to the Android SDK.");
    }
    return;
  }

  fs.writeFileSync(localPropertiesPath, `${existing}${existing && !existing.endsWith("\n") ? "\n" : ""}${sdkLine}\n`);
  console.log("Created android/local.properties with the Android SDK path.");
}

if (!fs.existsSync(settingsPath)) {
  console.error("android/settings.gradle was not found. Run expo prebuild first.");
  process.exit(1);
}

ensureReactNativeGradleFiles();
ensureAndroidLocalProperties();

const originalSettings = fs.readFileSync(settingsPath, "utf8");
const defaultCall = "expoAutolinking.useExpoVersionCatalog()";
const legacyPatchedCall = `expoAutolinking.useExpoVersionCatalog(
  new File(expoAutolinking.reactNativeGradlePlugin, "gradle/libs.versions.toml").absolutePath,
  null
)`;
const patchedCall = `expoAutolinking.useExpoVersionCatalog(
  new File(expoAutolinking.reactNative, "gradle/libs.versions.toml").absolutePath,
  null
)`;

let settings = originalSettings;
if (!settings.includes(patchedCall)) {
  if (settings.includes(legacyPatchedCall)) {
    settings = settings.replace(legacyPatchedCall, patchedCall);
  } else if (settings.includes(defaultCall)) {
    settings = settings.replace(defaultCall, patchedCall);
  } else {
    console.error("Could not find the Expo version catalog call in android/settings.gradle.");
    process.exit(1);
  }
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
