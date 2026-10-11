import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';

import {
  isMfaChallenge,
  valooRequest,
  type AuthMe,
  type LoginSession,
  type MfaChallenge,
  type MfaEnrollment,
} from './valoo-api';

type SessionContextValue = {
  session: LoginSession | null;
  me: AuthMe | null;
  challenge: MfaChallenge | null;
  enrollment: MfaEnrollment | null;
  busy: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  beginEnrollment: () => Promise<void>;
  verifyCode: (code: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
  cancelChallenge: () => void;
};

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

function userFacingError(error: unknown): string {
  return error instanceof Error ? error.message : 'İşlem tamamlanamadı.';
}

export function ValooSessionProvider({ children }: PropsWithChildren) {
  // Never persist access tokens or MFA secrets in AsyncStorage/localStorage.
  // A full app restart requires a fresh login until a native secure session
  // mechanism with server-side refresh rotation is implemented.
  const [session, setSession] = useState<LoginSession | null>(null);
  const [me, setMe] = useState<AuthMe | null>(null);
  const [challenge, setChallenge] = useState<MfaChallenge | null>(null);
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const completeLogin = useCallback(async (result: LoginSession) => {
    if (!result.accessToken || !result.membership || !Array.isArray(result.membership.permissions)) {
      throw new Error('Oturum bilgileri eksik. Lütfen tekrar deneyin.');
    }
    const identity = await valooRequest<AuthMe>('/auth/me', {
      accessToken: result.accessToken,
    });
    if (!identity.authenticated ||
      identity.user.sub !== result.user.id ||
      identity.user.tenantId !== result.tenant.id ||
      identity.user.membershipId !== result.membership.id) {
      throw new Error('Oturum ve şirket kimliği doğrulanamadı.');
    }
    setMe(identity);
    setSession(result);
    setChallenge(null);
    setEnrollment(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setChallenge(null);
    setEnrollment(null);
    setMe(null);
    setSession(null);
    try {
      const result = await valooRequest<LoginSession | MfaChallenge>('/auth/login', {
        method: 'POST',
        body: { email: email.trim().toLowerCase(), password },
      });
      if (isMfaChallenge(result)) {
        setChallenge(result);
      } else {
        await completeLogin(result);
      }
    } catch (cause) {
      setError(userFacingError(cause));
    } finally {
      setBusy(false);
    }
  }, [busy, completeLogin]);

  const beginEnrollment = useCallback(async () => {
    if (!challenge?.enrollmentRequired || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await valooRequest<MfaEnrollment>(
        `/auth/mfa/challenge/${encodeURIComponent(challenge.challengeId)}/setup`,
        { method: 'POST' },
      );
      if (!result.secret || !result.otpauthUri) {
        throw new Error('Doğrulama kurulumu başlatılamadı.');
      }
      setEnrollment(result);
    } catch (cause) {
      setError(userFacingError(cause));
    } finally {
      setBusy(false);
    }
  }, [busy, challenge]);

  const verifyCode = useCallback(async (code: string) => {
    if (!challenge || busy) return;
    if (!/^\d{6}$/.test(code.trim())) {
      setError('Altı haneli doğrulama kodunu girin.');
      return;
    }
    if (challenge.enrollmentRequired && !enrollment) {
      setError('Önce iki aşamalı doğrulamayı kurun.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const url = challenge.enrollmentRequired
        ? `/auth/mfa/challenge/${encodeURIComponent(challenge.challengeId)}/enroll`
        : '/auth/mfa/verify';
      const body = challenge.enrollmentRequired
        ? { code: code.trim() }
        : { challengeId: challenge.challengeId, code: code.trim() };
      const result = await valooRequest<LoginSession>(url, { method: 'POST', body });
      await completeLogin(result);
    } catch (cause) {
      setError(userFacingError(cause));
    } finally {
      setBusy(false);
    }
  }, [busy, challenge, enrollment, completeLogin]);

  const signOut = useCallback(async () => {
    const oldToken = session?.accessToken;
    // Revoke server session via refresh cookie when the platform retains it.
    // Regardless of connectivity, clear the in-memory access token immediately.
    setSession(null);
    setMe(null);
    setChallenge(null);
    setEnrollment(null);
    setError(null);
    if (!oldToken) return;
    try {
      await valooRequest<{ success: boolean }>('/auth/logout', {
        method: 'POST',
        accessToken: oldToken,
      });
    } catch {
      setError('Bu cihazdan çıkış yapıldı. Sunucudaki oturum iptali doğrulanamadı.');
    }
  }, [session]);

  const value = useMemo<SessionContextValue>(() => ({
    session,
    me,
    challenge,
    enrollment,
    busy,
    error,
    login,
    beginEnrollment,
    verifyCode,
    signOut,
    clearError: () => setError(null),
    cancelChallenge: () => {
      if (busy) return;
      setChallenge(null);
      setEnrollment(null);
      setError(null);
    },
  }), [session, me, challenge, enrollment, busy, error, login, beginEnrollment, verifyCode, signOut]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useValooSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('ValooSessionProvider eksik.');
  return context;
}
