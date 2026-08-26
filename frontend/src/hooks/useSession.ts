/**
 * Session hook — creates session, manages pairing state.
 */
'use client';

import { useState, useEffect, useCallback } from 'react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

interface SessionData {
  sessionId: string;
  pairingCode: string;
  expiresAt: number;
}

interface SessionStatus {
  sessionId: string;
  paired: boolean;
  agentConnected: boolean;
  agentId: string | null;
  testState: string;
}

export function useSession() {
  const [session, setSession] = useState<SessionData | null>(null);
  const [status, setStatus] = useState<SessionStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/session`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to create session');
      const data = await res.json();
      setSession(data);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    if (!session?.sessionId) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/session/${session.sessionId}/status`);
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch {
      // ignore polling errors
    }
  }, [session?.sessionId]);

  const revokeAgent = useCallback(async () => {
    if (!session?.sessionId) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/agent/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.sessionId }),
      });
      if (res.ok) {
        await fetchStatus();
      }
    } catch {
      // ignore
    }
  }, [session?.sessionId, fetchStatus]);

  // Auto-create session on mount
  useEffect(() => {
    createSession();
  }, [createSession]);

  return {
    session,
    status,
    loading,
    error,
    createSession,
    fetchStatus,
    revokeAgent,
    backendUrl: BACKEND_URL,
    wsUrl: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000',
  };
}
