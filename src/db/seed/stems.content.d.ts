/**
 * Type declaration for the seed-content module path (issue 23).
 *
 * `stems.ts` statically imports `./stems.content` — the owner-local module
 * holding the licensed programme text (gitignored; see README, "Seed
 * content"). On an owner tree the real `stems.content.ts` sits beside this
 * file and shadows the declaration. On every other tree (fresh clone, CI)
 * this declaration is what lets TypeScript resolve the import, while the
 * RUNTIME value is served by the committed example module via the resolver
 * rule (metro.config.js / jest.resolver.js). Types only — no runtime code.
 */
import type { SeedContent } from './stems.content.example';

export declare const CONTENT: SeedContent;
