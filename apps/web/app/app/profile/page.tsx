'use client';
import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPost, ApiError } from '../../../lib/api';
import { useSession } from '../../../lib/session';
import { useToast } from '../../../lib/toast';

function errMsg(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.problem.detail ?? e.problem.title : fallback;
}

export default function ProfilePage() {
  const { user } = useSession();
  const qc = useQueryClient();
  const toast = useToast();

  if (!user) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <div className="h-eyebrow">Account</div>
        <h1 className="h-display mt-1">Profile</h1>
        <p className="mt-2 text-sm text-paper-600">
          Manage your credentials and two-factor authentication.
        </p>
      </div>

      <IdentitySection email={user.email} />
      <PasswordSection />
      <TotpSection totpEnabled={user.totpEnabled} />
      <SessionsSection />
    </div>
  );
}

function IdentitySection({ email }: { email: string }) {
  return (
    <section className="panel p-6">
      <h2 className="font-display text-lg font-medium tracking-tight-er text-ink">Identity</h2>
      <div className="mt-4">
        <div className="h-eyebrow">Email</div>
        <div className="mt-1 text-sm text-ink">{email}</div>
      </div>
    </section>
  );
}

function PasswordSection() {
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const change = useMutation({
    mutationFn: () =>
      apiPost('/api/v1/auth/password/change', { currentPassword, newPassword }),
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.push({ kind: 'success', message: 'Password changed', description: 'Other sessions have been signed out.' });
    },
    onError: (e) => toast.push({ kind: 'error', message: errMsg(e, 'Could not change password') }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.push({ kind: 'error', message: 'Passwords do not match' });
      return;
    }
    change.mutate();
  }

  return (
    <section className="panel p-6">
      <h2 className="font-display text-lg font-medium tracking-tight-er text-ink">Password</h2>
      <p className="mt-1 text-sm text-paper-600">
        Changing your password will sign out all other sessions.
      </p>
      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <label className="block">
          <span className="h-eyebrow">Current password</span>
          <input
            type="password"
            className="input mt-1"
            required
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="h-eyebrow">New password</span>
          <input
            type="password"
            className="input mt-1"
            required
            minLength={8}
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="h-eyebrow">Confirm new password</span>
          <input
            type="password"
            className="input mt-1"
            required
            minLength={8}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </label>
        <div className="flex justify-end pt-1">
          <button
            type="submit"
            className="btn"
            disabled={change.isPending || !currentPassword || !newPassword || !confirmPassword}
          >
            {change.isPending ? 'Changing…' : 'Change password'}
          </button>
        </div>
      </form>
    </section>
  );
}

function TotpSection({ totpEnabled }: { totpEnabled: boolean }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [enrolling, setEnrolling] = useState(false);
  const [secret, setSecret] = useState('');
  const [qrUrl, setQrUrl] = useState('');
  const [code, setCode] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [showDisable, setShowDisable] = useState(false);

  const enable = useMutation({
    mutationFn: () => apiPost<{ data: { secret: string; qrCodeUrl: string } }>('/api/v1/auth/totp/enable', {}),
    onSuccess: (res) => {
      setSecret(res.data.secret);
      setQrUrl(res.data.qrCodeUrl);
      setEnrolling(true);
    },
    onError: (e) => toast.push({ kind: 'error', message: errMsg(e, 'Could not start TOTP setup') }),
  });

  const confirm = useMutation({
    mutationFn: () => apiPost('/api/v1/auth/totp/confirm', { code }),
    onSuccess: () => {
      setEnrolling(false);
      setSecret('');
      setQrUrl('');
      setCode('');
      qc.invalidateQueries({ queryKey: ['me'] });
      toast.push({ kind: 'success', message: 'Two-factor authentication enabled' });
    },
    onError: (e) => toast.push({ kind: 'error', message: errMsg(e, 'Invalid code') }),
  });

  const disable = useMutation({
    mutationFn: () =>
      apiPost('/api/v1/auth/totp/disable', { password: disablePassword, code: disableCode }),
    onSuccess: () => {
      setShowDisable(false);
      setDisableCode('');
      setDisablePassword('');
      qc.invalidateQueries({ queryKey: ['me'] });
      toast.push({ kind: 'success', message: 'Two-factor authentication disabled' });
    },
    onError: (e) => toast.push({ kind: 'error', message: errMsg(e, 'Could not disable TOTP') }),
  });

  return (
    <section className="panel p-6">
      <h2 className="font-display text-lg font-medium tracking-tight-er text-ink">
        Two-factor authentication
      </h2>
      <p className="mt-1 text-sm text-paper-600">
        {totpEnabled
          ? 'TOTP is enabled. You will need your authenticator app to sign in.'
          : 'Add an extra layer of security by requiring a code from an authenticator app.'}
      </p>

      {!totpEnabled && !enrolling ? (
        <div className="mt-4">
          <button
            type="button"
            className="btn"
            onClick={() => enable.mutate()}
            disabled={enable.isPending}
          >
            {enable.isPending ? 'Setting up…' : 'Enable TOTP'}
          </button>
        </div>
      ) : null}

      {enrolling ? (
        <div className="mt-4 space-y-4">
          <div>
            <div className="h-eyebrow">Setup key</div>
            <p className="mt-1 text-sm text-paper-600">
              Enter this key into your authenticator app (Google Authenticator, 1Password, Authy, etc.):
            </p>
            <code className="mt-2 block rounded-md border border-paper-200 bg-paper-50 px-3 py-2 text-sm font-mono tracking-wide text-ink select-all">
              {secret}
            </code>
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-paper-500 hover:text-ink">
                Show otpauth:// URI
              </summary>
              <code className="mt-1 block break-all rounded-md border border-paper-200 bg-paper-50 px-3 py-2 text-xs font-mono text-paper-700 select-all">
                {qrUrl}
              </code>
            </details>
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); confirm.mutate(); }}
            className="flex items-end gap-3"
          >
            <label className="block flex-1">
              <span className="h-eyebrow">Verification code</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                className="input mt-1 tabular-nums"
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                autoComplete="one-time-code"
              />
            </label>
            <button
              type="submit"
              className="btn"
              disabled={confirm.isPending || code.length !== 6}
            >
              {confirm.isPending ? 'Verifying…' : 'Verify & enable'}
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => { setEnrolling(false); setSecret(''); setQrUrl(''); setCode(''); }}
            >
              Cancel
            </button>
          </form>
        </div>
      ) : null}

      {totpEnabled && !showDisable ? (
        <div className="mt-4">
          <button
            type="button"
            className="btn-ghost text-red-700"
            onClick={() => setShowDisable(true)}
          >
            Disable TOTP
          </button>
        </div>
      ) : null}

      {totpEnabled && showDisable ? (
        <form
          onSubmit={(e) => { e.preventDefault(); disable.mutate(); }}
          className="mt-4 space-y-3"
        >
          <p className="text-sm text-paper-600">
            Confirm with your password and a current TOTP code to disable two-factor authentication.
          </p>
          <label className="block">
            <span className="h-eyebrow">Password</span>
            <input
              type="password"
              className="input mt-1"
              required
              autoComplete="current-password"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="h-eyebrow">TOTP code</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              className="input mt-1 tabular-nums"
              placeholder="000000"
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              autoComplete="one-time-code"
            />
          </label>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              className="btn bg-red-600 text-white hover:bg-red-700"
              disabled={disable.isPending || !disablePassword || disableCode.length !== 6}
            >
              {disable.isPending ? 'Disabling…' : 'Disable TOTP'}
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => { setShowDisable(false); setDisableCode(''); setDisablePassword(''); }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function SessionsSection() {
  const toast = useToast();
  const qc = useQueryClient();

  const revokeAll = useMutation({
    mutationFn: () => apiPost('/api/v1/auth/sessions/revoke-all', {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me'] });
      toast.push({ kind: 'success', message: 'All other sessions signed out' });
    },
    onError: (e) => toast.push({ kind: 'error', message: errMsg(e, 'Could not revoke sessions') }),
  });

  return (
    <section className="panel p-6">
      <h2 className="font-display text-lg font-medium tracking-tight-er text-ink">Sessions</h2>
      <p className="mt-1 text-sm text-paper-600">
        Sign out of all other browsers and devices. Your current session will remain active.
      </p>
      <div className="mt-4">
        <button
          type="button"
          className="btn-ghost text-red-700"
          onClick={() => revokeAll.mutate()}
          disabled={revokeAll.isPending}
        >
          {revokeAll.isPending ? 'Signing out…' : 'Sign out all other sessions'}
        </button>
      </div>
    </section>
  );
}
