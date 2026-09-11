import { render, screen } from '@testing-library/react-native';

import { EmptyState } from '@/components/empty-state';

describe('EmptyState', () => {
  it('renders the given message', () => {
    render(<EmptyState message="No stems match." />);
    expect(screen.getByText('No stems match.')).toBeTruthy();
  });
});
