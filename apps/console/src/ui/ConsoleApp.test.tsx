import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ConsoleApp } from './ConsoleApp';

describe('ConsoleApp', () => {
  it('shows title', () => {
    render(<ConsoleApp />);
    expect(screen.getByText('Deca Console')).toBeInTheDocument();
  });

  it('updates message on start', async () => {
    const user = userEvent.setup();
    render(<ConsoleApp />);
    await user.click(screen.getByRole('button', { name: 'Start Session' }));
    expect(screen.getByText('Deca Console Ready')).toBeInTheDocument();
  });
});
