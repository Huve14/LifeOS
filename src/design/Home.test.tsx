import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PackingList } from './Home';

const sampleItems = [
  { id: 'p1', name: 'Passport', category: 'Documents', checked: true },
  { id: 'p2', name: 'Phone', category: 'Electronics', checked: false },
];

describe('PackingList', () => {
  it('renders all items', () => {
    render(<PackingList items={sampleItems} onToggle={() => {}} />);
    expect(screen.getByText('Passport')).toBeInTheDocument();
    expect(screen.getByText('Phone')).toBeInTheDocument();
  });

  it('shows checked items as checked', () => {
    render(<PackingList items={sampleItems} onToggle={() => {}} />);
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();
  });
});
