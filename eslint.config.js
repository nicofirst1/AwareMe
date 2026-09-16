// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // react-hooks/set-state-in-effect (Compiler-generation rule) downgraded per
    // DECISIONS.md 2026-09-16: the two mount sites are ADR-0001 cold-start design
    // (side-effect-entangled DB resume, lazy-init impure under StrictMode); the
    // remaining sites are documented session-state refactor debt. "warn" keeps
    // surfacing future sites without failing gates.
    files: ["**/*.{js,jsx,ts,tsx}"],
    rules: {
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);
