import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { Card } from '@/components/card';

describe('Card', () => {
  it('renders its children', () => {
    render(
      <Card>
        <Text>Session content</Text>
      </Card>,
    );
    expect(screen.getByText('Session content')).toBeTruthy();
  });
});
