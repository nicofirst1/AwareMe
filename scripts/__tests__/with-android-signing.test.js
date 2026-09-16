/**
 * Tests for the Android signing config plugin (`scripts/with-android-signing.js`).
 *
 * The plugin edits the prebuild-generated `android/app/build.gradle` (a file
 * we can't run here), so the tests assert on the Groovy it produces against a
 * faithful fixture of Expo SDK 57's generated `app/build.gradle`: the block is
 * appended, marked, idempotent, overrides the release buildType's signing
 * config, falls back to the debug keystore, and fails loudly on a broken
 * keystore.properties.
 */
const withAndroidSigning = require("../with-android-signing");

/** Trimmed but structurally faithful excerpt of the SDK 57 prebuild output. */
const TEMPLATE = `apply plugin: "com.android.application"
apply plugin: "com.facebook.react"

android {
    ndkVersion rootProject.ext.ndkVersion

    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            signingConfig signingConfigs.debug
            minifyEnabled false
        }
    }
}

dependencies {
    implementation("com.facebook.react:react-android")
}
`;

/** Runs the plugin's build.gradle mod against `contents`, returns the new contents. */
function apply(contents) {
  let captured;
  const mod = { modResults: { contents, language: "groovy" } };
  const { withAppBuildGradle } = require("expo/config-plugins");
  withAppBuildGradle.mockImplementationOnce((_config, modFn) => {
    captured = modFn({ modResults: { contents, language: "groovy" } });
  });
  withAndroidSigning({});
  return captured.modResults.contents;
}

jest.mock("expo/config-plugins", () => ({
  withAppBuildGradle: jest.fn((config, _modFn) => config),
}));

describe("with-android-signing config plugin", () => {
  it("appends the signing block and points the release buildType at it", () => {
    const out = apply(TEMPLATE);

    expect(out).toContain("@six-endings-signing");
    // The appended block must come after the template's own assignment so the
    // last (our) signingConfig wins.
    expect(out.lastIndexOf("signingConfig signingConfigs.release")).toBeGreaterThan(
      out.lastIndexOf("signingConfig signingConfigs.debug"),
    );
    // Prebuild wipes android/ wholesale, so the properties file is looked up
    // at the repo root FIRST, then next to build.gradle.
    expect(out.indexOf('rootProject.file("../keystore.properties")')).toBeGreaterThan(-1);
    expect(out.indexOf('rootProject.file("keystore.properties")')).toBeGreaterThan(
      out.indexOf('rootProject.file("../keystore.properties")'),
    );
    // Debug fallback is spelled out for the no-keystore case.
    expect(out).toContain('storeFile file("debug.keystore")');
  });

  it("is idempotent: a second prebuild does not stack a second block", () => {
    const once = apply(TEMPLATE);
    const twice = apply(once);

    expect(twice).toBe(once);
    expect(twice.split("@six-endings-signing").length - 1).toBe(2); // start + end markers only
  });

  it("fails loudly (GradleException) when keystore.properties names a missing storeFile", () => {
    const out = apply(TEMPLATE);

    // The point: a half-configured production keystore must never silently
    // produce a debug-signed store artifact.
    expect(out).toContain("throw new GradleException");
    expect(out).toContain("keystore.properties exists but storeFile");
  });

  it("does not touch the debug buildType's signing", () => {
    const out = apply(TEMPLATE);

    // Template keeps both its own debug references (debug buildType + the
    // template's release line, which our appended block overrides by order).
    expect(out.match(/signingConfig signingConfigs\.debug/g)).toHaveLength(2);
    expect(out.match(/signingConfig signingConfigs\.release/g)).toHaveLength(1);
  });
});
