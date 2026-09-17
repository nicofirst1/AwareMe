/**
 * Issue 23 — the seed content module resolves statically in every tool
 * that consumes it.
 *
 * `src/db/seed/stems.ts` imports `./stems.content`; on a git-faithful tree
 * (fresh clone, CI — no owner-local `stems.content.ts`) the module
 * resolvers serve that import from the committed
 * `stems.content.example.ts`. This suite pins that rule at the bundler
 * level, so a CI run fails if the seam breaks again — without needing an
 * Android build to notice. (The jest side is pinned implicitly: every
 * suite in this repo resolves through the same rule.)
 *
 * The rule (`content-overlay.js`) is exercised hermetically with
 * throwaway directories in both shapes, so both branches are covered on
 * every tree; the last test ties the rule to THIS tree's real state.
 *
 * `expo/metro-config` is mocked: the probe exercises metro.config.js's
 * wiring, not Expo's base config, and must not drag the Metro toolchain
 * into jest.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { CONTENT } from '../seed/stems.content.example';

jest.mock('expo/metro-config', () => ({
  getDefaultConfig: () => ({ resolver: {} }),
}));

interface MetroResolution {
  type: string;
  filePath: string;
}
interface MetroResolverContext {
  originModulePath: string;
  resolveRequest(context: unknown, moduleName: string, platform: string): MetroResolution;
}
interface MetroConfigWithResolver {
  resolver?: {
    resolveRequest?: (context: MetroResolverContext, moduleName: string, platform: string) => MetroResolution;
  };
}
interface ContentOverlay {
  CONTENT_SPECIFIER: string;
  EXAMPLE_SPECIFIER: string;
  hasOwnerContent(fromDir: string): boolean;
  servesExampleFallback(moduleName: string, fromDir: string): boolean;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const overlay = require('../../../content-overlay') as ContentOverlay;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const metroConfig = require('../../../metro.config.js') as MetroConfigWithResolver;

const SEED_DIR = path.join(__dirname, '..', 'seed');
const OWNER_CONTENT_PRESENT = fs.existsSync(path.join(SEED_DIR, 'stems.content.ts'));

/** A stub Metro context that records every delegated request. */
function recordingContext(originModulePath: string): { context: MetroResolverContext; served: string[] } {
  const served: string[] = [];
  const sentinel: MetroResolution = { type: 'sourceFile', filePath: '/probe-sentinel' };
  const context: MetroResolverContext = {
    originModulePath,
    resolveRequest(_ctx, moduleName) {
      served.push(moduleName);
      return sentinel;
    },
  };
  return { context, served };
}

describe('content-overlay rule (shared by metro.config.js and jest.resolver.js)', () => {
  it('serves the example fallback only for the content specifier while the owner module is absent', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'content-overlay-'));
    try {
      expect(overlay.hasOwnerContent(dir)).toBe(false);
      expect(overlay.servesExampleFallback(overlay.CONTENT_SPECIFIER, dir)).toBe(true);
      expect(overlay.servesExampleFallback('./stems.content.example', dir)).toBe(false);
      expect(overlay.servesExampleFallback('react', dir)).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('resolves natively (no fallback) once the owner module exists', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'content-overlay-'));
    try {
      fs.writeFileSync(path.join(dir, 'stems.content.ts'), '// owner module\n', 'utf-8');
      expect(overlay.hasOwnerContent(dir)).toBe(true);
      expect(overlay.servesExampleFallback(overlay.CONTENT_SPECIFIER, dir)).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('the committed example module exists and exports the CONTENT contract', () => {
    expect(fs.existsSync(path.join(SEED_DIR, 'stems.content.example.ts'))).toBe(true);
    expect(Array.isArray(CONTENT.programmeStems)).toBe(true);
    expect(typeof CONTENT.weeklyMetaStem).toBe('string');
  });
});

describe('metro.config.js wiring (issue 23)', () => {
  const resolveRequest = metroConfig.resolver?.resolveRequest;

  it('installs the overlay resolver', () => {
    expect(typeof resolveRequest).toBe('function');
  });

  it('serves the committed example module when the importing directory lacks the owner module', () => {
    if (!resolveRequest) throw new Error('metro.config.js must install the overlay resolver');

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'content-overlay-'));
    try {
      const { context, served } = recordingContext(path.join(dir, 'stems.ts'));
      const resolution = resolveRequest(context, overlay.CONTENT_SPECIFIER, 'android');
      expect(served).toEqual([overlay.EXAMPLE_SPECIFIER]);
      expect(resolution.type).toBe('sourceFile');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('passes every other request through untouched', () => {
    if (!resolveRequest) throw new Error('metro.config.js must install the overlay resolver');

    const { context, served } = recordingContext(path.join(os.tmpdir(), 'somewhere.ts'));
    const resolution = resolveRequest(context, 'react', 'android');
    expect(served).toEqual(['react']);
    expect(resolution.type).toBe('sourceFile');
  });

  it('matches this tree: the real seed module is served per its own directory state', () => {
    if (!resolveRequest) throw new Error('metro.config.js must install the overlay resolver');

    const { context, served } = recordingContext(path.join(SEED_DIR, 'stems.ts'));
    resolveRequest(context, overlay.CONTENT_SPECIFIER, 'android');
    if (OWNER_CONTENT_PRESENT) {
      expect(served).toEqual([overlay.CONTENT_SPECIFIER]);
    } else {
      expect(served).toEqual([overlay.EXAMPLE_SPECIFIER]);
    }
  });
});
