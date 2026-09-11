import { render, screen } from '@testing-library/react-native';

import { BadgeCard } from '@/components/badge-card';
import type { BadgeDef } from '@/session/badges';

const badge: BadgeDef = { id: 'first_words', name: 'First Words', description: 'Completed your first session.' };

describe('BadgeCard', () => {
  it('renders the badge name and description when earned', () => {
    render(<BadgeCard badge={badge} earned />);
    expect(screen.getByText('First Words')).toBeTruthy();
    expect(screen.getByText('Completed your first session.')).toBeTruthy();
  });

  it('renders the same content, dimmed, when unearned', () => {
    render(<BadgeCard badge={badge} earned={false} />);
    expect(screen.getByText('First Words')).toBeTruthy();
    expect(screen.getByText('Completed your first session.')).toBeTruthy();
  });
});
