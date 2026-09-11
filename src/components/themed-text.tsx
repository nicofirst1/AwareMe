import { StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  /**
   * `stem` uses the serif face for stems/endings; the rest are sans chrome.
   * `eyebrow` (2026-09-11 design-system foundation) is a small label-above-
   * a-group style — section labels, category labels — the one gap the
   * existing scale had no name for (distinct from `small` body text).
   */
  type?: 'default' | 'title' | 'subtitle' | 'small' | 'stem' | 'eyebrow';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text
      style={[
        { color: theme[themeColor ?? (type === 'eyebrow' ? 'textSecondary' : 'text')] },
        type === 'default' && styles.default,
        type === 'title' && styles.title,
        type === 'subtitle' && styles.subtitle,
        type === 'small' && styles.small,
        type === 'stem' && styles.stem,
        type === 'eyebrow' && styles.eyebrow,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  default: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    lineHeight: 24,
  },
  title: {
    fontFamily: Fonts.sans,
    fontSize: 32,
    fontWeight: '600',
    lineHeight: 44,
  },
  subtitle: {
    fontFamily: Fonts.sans,
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 30,
  },
  small: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    lineHeight: 22,
  },
  stem: {
    fontFamily: Fonts.serif,
    fontSize: 22,
    lineHeight: 34,
  },
  eyebrow: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
});
