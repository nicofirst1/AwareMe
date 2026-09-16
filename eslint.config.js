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
    // DECISIONS.md 2026-09-16. Remaining sites (after the o10 session-state
    // pass, issue 17: 7 -> 4, three debt sites cleared — queue advance, badge
    // assembly, stem-timer reset):
    // - write.tsx mount loader + useWritingSession.ts mount resume: ADR-0001
    //   cold-start design — side-effect-entangled DB reads at mount, impure
    //   as a lazy init under StrictMode; restructuring is out of scope.
    // - write.tsx + review.tsx reflection-completion effects: dispositioned
    //   debt (issue 17 Comments) — the review row must be written before the
    //   phase flips, and the timeout path has no event to attach either to.
    // "warn" keeps surfacing future sites without failing gates.
    files: ["**/*.{js,jsx,ts,tsx}"],
    rules: {
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);
