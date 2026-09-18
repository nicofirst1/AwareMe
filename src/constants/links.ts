/**
 * The app’s outbound link to the creator’s site, tagged for site analytics
 * (issue 09): visits coming from the app carry `utm_source=awareme`.
 *
 * `withAppTag` is the one seam every creator-site link flows through. It
 * tags only the bare site URL; every other URL — deep links (`awareme://…`),
 * other domains, an already-tagged URL — passes through unchanged, so the
 * tag can never double and no other link can pick it up.
 */
export const CREATOR_SITE_URL = 'https://nicolobrandizzi.com/';

const APP_TAG = 'utm_source=awareme';

export function withAppTag(url: string): string {
  if (url !== CREATOR_SITE_URL) {
    return url;
  }
  return `${CREATOR_SITE_URL}?${APP_TAG}`;
}
