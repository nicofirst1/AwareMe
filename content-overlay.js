/**
 * The seed-content overlay rule (issue 10 seam; issue 23 static resolution).
 *
 * `src/db/seed/stems.ts` imports `./stems.content` statically. The owner
 * module (`src/db/seed/stems.content.ts`, gitignored) holds the licensed
 * programme text and exists only on owner trees; the committed
 * `stems.content.example` module stands in everywhere else. One rule, two
 * consumers, decided at resolution time — never at runtime:
 *
 *   serve the owner module when it exists, else the example module.
 *
 * - `metro.config.js` wires `metroResolveRequest` into the bundle graph.
 * - `jest.resolver.js` applies the same predicate to jest resolution.
 * - `src/db/__tests__/contentModuleResolution.test.ts` pins the rule for CI.
 *
 * Because the import is static, a tree where neither module resolves fails
 * the build loudly instead of crashing the app at launch (issue 23).
 */
'use strict';

const fs = require('fs');
const path = require('path');

/** The import specifier `stems.ts` uses for the content module. */
const CONTENT_SPECIFIER = './stems.content';
/** The committed fallback module specifier, relative to the same directory. */
const EXAMPLE_SPECIFIER = './stems.content.example';
/** The owner-local file name looked up next to the importing module. */
const CONTENT_FILE = 'stems.content.ts';

/**
 * Whether the owner-local content module is on disk in `fromDir`
 * (the directory of the module that imports the content specifier).
 */
function hasOwnerContent(fromDir) {
  return fs.existsSync(path.join(fromDir, CONTENT_FILE));
}

/**
 * Whether a request for the content specifier must be served the example
 * fallback (the owner module is absent). Everything else resolves
 * natively — including the owner module itself when present.
 */
function servesExampleFallback(moduleName, fromDir) {
  return moduleName === CONTENT_SPECIFIER && !hasOwnerContent(fromDir);
}

/**
 * Build a Metro `resolveRequest` implementing the overlay. `previous` is
 * the resolver entry the config had before (if any); requests this rule
 * does not claim pass through unchanged.
 */
function metroResolveRequest(previous) {
  return (context, moduleName, platform) => {
    if (servesExampleFallback(moduleName, path.dirname(context.originModulePath))) {
      return context.resolveRequest(context, EXAMPLE_SPECIFIER, platform);
    }
    return previous
      ? previous(context, moduleName, platform)
      : context.resolveRequest(context, moduleName, platform);
  };
}

module.exports = { CONTENT_SPECIFIER, EXAMPLE_SPECIFIER, hasOwnerContent, servesExampleFallback, metroResolveRequest };
