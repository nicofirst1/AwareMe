import { fireEvent, render, screen } from '@testing-library/react-native';

import { FilterChip } from '@/components/filter-chip';

describe('FilterChip', () => {
  it('renders plain, category, and color variants and fires onPress', () => {
    const onPress = jest.fn();
    render(<FilterChip label="Awareness" selected onPress={onPress} category="awareness" />);
    expect(screen.getByText('Awareness')).toBeTruthy();

    render(<FilterChip label="Active" selected={false} onPress={onPress} />);
    render(<FilterChip label="Custom" selected onPress={onPress} color={{ bg: '#F6EAE4', text: '#B5541A' }} />);

    fireEvent.press(screen.getByText('Custom'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
