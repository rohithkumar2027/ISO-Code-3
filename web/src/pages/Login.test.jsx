import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Login from './Login';
import { SessionProvider } from '../lib/SessionContext';
import { api, ApiError } from '../lib/api';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual('../lib/api');
  return { ...actual, api: { session: vi.fn(), login: vi.fn() } };
});

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <SessionProvider><Login /></SessionProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  api.session.mockResolvedValue({ patient: null });
  api.login.mockReset();
});

describe('Login', () => {
  test('submits the mobile number entered and calls the API', async () => {
    api.login.mockResolvedValue({ ok: true, maskedMobile: '+91 ••••• ••001' });
    renderLogin();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/mobile number/i), '9000000001');
    await user.click(screen.getByRole('button', { name: /send code/i }));
    await waitFor(() => expect(api.login).toHaveBeenCalledWith('9000000001'));
  });

  test('shows a translated error and does not navigate when the server rejects the number', async () => {
    api.login.mockRejectedValue(new ApiError(400, 'mobile_invalid'));
    renderLogin();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/mobile number/i), '123');
    await user.click(screen.getByRole('button', { name: /send code/i }));
    expect(await screen.findByText(/valid 10-digit mobile number/i)).toBeInTheDocument();
  });

  test('shows a wait message with the seconds the server returned when rate-limited', async () => {
    const err = new ApiError(429, 'wait', { retryAfterSec: 25 });
    api.login.mockRejectedValue(err);
    renderLogin();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/mobile number/i), '9000000001');
    await user.click(screen.getByRole('button', { name: /send code/i }));
    expect(await screen.findByText(/25 seconds/)).toBeInTheDocument();
  });
});
