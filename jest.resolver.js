/**
 * Jest module resolver (issue 23): the seed's content module is owner-local.
 *
 * `src/db/seed/stems.ts` imports `./stems.content` statically, and jest
 * must resolve it in both tree shapes. Same rule as metro.config.js,
 * applied at resolution time — never at runtime:
 *
 *   owner module (`src/db/seed/stems.content.ts`, gitignored) if present,
 *   otherwise the committed `stems.content.example` module.
 *
 * The shared rule lives in `content-overlay.js` (pinned by
 * `src/db/__tests__/contentModuleResolution.test.ts`).
 */
'use strict';

const { EXAMPLE_SPECIFIER, servesExampleFallback } = require('./content-overlay');

module.exports = function resolve(request, options) {
  if (servesExampleFallback(request, options.basedir)) {
    return options.defaultResolver(EXAMPLE_SPECIFIER, options);
  }
  return options.defaultResolver(request, options);
};
