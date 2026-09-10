import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ api: vi.fn(), update: vi.fn(), recover: vi.fn() }));
vi.mock('../../web/src/lib/supabase', () => ({
  api: mocks.api,
  supabase: { auth: { updateUser: mocks.update, resetPasswordForEmail: mocks.recover } },
}));
import { requestPasswordRecovery, saveOwnerPassword } from '../../web/src/lib/passwordRecovery';

describe('DEADSET owner password recovery', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.api.mockResolvedValue({ email: 'owner@example.com' });
    mocks.update.mockResolvedValue({ error: null });
    mocks.recover.mockResolvedValue({ error: null });
  });
  it('sends recovery back to the exact site reset route', async () => {
    await requestPasswordRecovery(' owner@example.com ', 'https://hq.example.com');
    expect(mocks.recover).toHaveBeenCalledWith('owner@example.com', { redirectTo: 'https://hq.example.com/reset-password' });
  });
  it('surfaces recovery delivery errors', async () => {
    mocks.recover.mockResolvedValue({ error: new Error('Rate limited') });
    await expect(requestPasswordRecovery('owner@example.com', 'https://hq.example.com')).rejects.toThrow('Rate limited');
  });
  it('rejects mismatched confirmation before touching authentication', async () => {
    await expect(saveOwnerPassword('test-password', 'different-password')).rejects.toThrow('do not match');
    expect(mocks.api).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('rejects short passwords', async () => {
    await expect(saveOwnerPassword('short', 'short')).rejects.toThrow('8 characters');
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('never updates a password when the owner session is rejected', async () => {
    mocks.api.mockRejectedValue(new Error('Owner sign-in required'));
    await expect(saveOwnerPassword('test-password', 'test-password')).rejects.toThrow('Owner sign-in required');
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('updates the authenticated owner through Supabase', async () => {
    await saveOwnerPassword('test-password', 'test-password');
    expect(mocks.api).toHaveBeenCalledWith('/me');
    expect(mocks.update).toHaveBeenCalledWith({ password: 'test-password' });
  });
  it('does not report success if Supabase rejects the password', async () => {
    mocks.update.mockResolvedValue({ error: new Error('Reauthentication required') });
    await expect(saveOwnerPassword('test-password', 'test-password')).rejects.toThrow('Reauthentication required');
  });
});
