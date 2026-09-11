import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { CelebrationColors, Spacing } from '@/constants/theme';
import type { BadgeDef } from '@/session/badges';

/**
 * One badge tile (gamification proposal §2): earned tiles get
 * `CelebrationColors.glowSoft` fill; unearned render as a plain `Card` at
 * reduced opacity (silhouette, not hidden — shows what's achievable without
 * a checklist-style locked-criteria list). Reused by the completion-screen
 * reveal (cycle 2, always `earned`) and the Progress screen grid (cycle 3,
 * both states).
 *
 * Sans type throughout (§10: badges are chrome, not the user's writing).
 *
 * Earned cards also get a `CelebrationColors.glow` left-edge stripe (color
 * audit 2026-09-11, cycle 3) via `Card`'s existing `accentColor` prop —
 * decorative only, on top of the `glowSoft` fill, never the badge text color
 * (`glow` isn't AA-safe as text — see theme.ts). Unearned cards pass no
 * `accentColor`, unchanged.
 */
export function BadgeCard({ badge, earned }: { badge: BadgeDef; earned: boolean }) {
  return (
    <Card
      style={[styles.card, earned && { backgroundColor: CelebrationColors.glowSoft }]}
      accentColor={earned ? CelebrationColors.glow : undefined}
    >
      <View style={!earned && styles.unearnedContent}>
        <ThemedText type="default">{badge.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {badge.description}
        </ThemedText>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.half,
  },
  // Silhouette treatment for unearned badges (proposal §2) — dimmed, not
  // absent, and no lock icon/"locked" copy that would read as a checklist.
  unearnedContent: {
    opacity: 0.5,
  },
});
