/**
 * Metro configuration (issue 23): the seed's content module is owner-local.
 *
 * `src/db/seed/stems.ts` imports `./stems.content` STATICALLY, so the
 * bundler must always be able to resolve it. The overlay resolver decides
 * per request, at bundle time — never at runtime: when the importing
 * module's directory holds the owner-local content module it resolves
 * natively; otherwise the committed example module is served (original
 * example content; README, "Seed content").
 *
 * The rule lives in `content-overlay.js` and is pinned by
 * `src/db/__tests__/contentModuleResolution.test.ts`. Because the import
 * is static, a tree where neither module resolves fails the BUILD loudly
 * instead of crashing the app at launch (issue 23).
 */
const { getDefaultConfig } = require('expo/metro-config');
const { metroResolveRequest } = require('./content-overlay');

const config = getDefaultConfig(__dirname);

config.resolver.resolveRequest = metroResolveRequest(config.resolver.resolveRequest);

module.exports = config;
