'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';

const DEFAULT_BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
const DEFAULT_WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000';
const STORAGE_KEY = 'netjitter_session';
const BACKEND_URL_KEY = 'netjitter_backend_url';
const WS_URL_KEY = 'netjitter_ws_url';

export interface SessionData {
  sessionId: string;
  pairingCode: string;
  expiresAt: number;
}

export interface SessionStatus {
  sessionId: string;
  paired: boolean;
  agentConnected: boolean;
  agentId: string | null;
  testState: string;
  pairingCode?: string;
  expiresAt?: number;
}

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface WSMessage {
  type: string;
  [key: string]: unknown;
}

type MessageListener = (msg: WSMessage) => void;

interface SessionContextValue {
  session: SessionData | null;
  status: SessionStatus | null;
  agentConnected: boolean;
  agentId: string | null;
  connectionState: ConnectionState;
  backendOnline: boolean | null;
  createSession: () => Promise<SessionData>;
  revokeAgent: () => Promise<void>;
  send: (msg: WSMessage) => void;
  subscribe: (listener: MessageListener) => () => void;
  backendUrl: string;
  wsUrl: string;
  setBackendUrl: (url: string) => void;
  setWsUrl: (url: string) => void;
  isVercel: boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function generateClientPairingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function generateClientSession(): SessionData {
  const sessionId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'sess_' + Date.now();
  return {
    sessionId,
    pairingCode: generateClientPairingCode(),
    expiresAt: Date.now() + 5 * 60 * 1000,
  };
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  // URLs with localStorage persistence
  const [backendUrl, setBackendUrlState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(BACKEND_URL_KEY) || DEFAULT_BACKEND_URL;
    }
    return DEFAULT_BACKEND_URL;
  });

  const [wsUrl, setWsUrlState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(WS_URL_KEY) || DEFAULT_WS_URL;
    }
    return DEFAULT_WS_URL;
  });

  const setBackendUrl = useCallback((url: string) => {
    setBackendUrlState(url);
    if (typeof window !== 'undefined') localStorage.setItem(BACKEND_URL_KEY, url);
  }, []);

  const setWsUrl = useCallback((url: string) => {
    setWsUrlState(url);
    if (typeof window !== 'undefined') localStorage.setItem(WS_URL_KEY, url);
  }, []);

  const isVercel = useMemo(() => {
    if (typeof window !== 'undefined') {
      return window.location.hostname.includes('vercel.app') || window.location.protocol === 'https:';
    }
    return false;
  }, []);

  // Synchronously load saved session from localStorage or generate immediately
  const [session, setSession] = useState<SessionData | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.sessionId && parsed.pairingCode) return parsed;
        }
      } catch {
        // ignore
      }
      const initial = generateClientSession();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    return null;
  });

  const [status, setStatus] = useState<SessionStatus | null>(null);
  const [agentConnected, setAgentConnected] = useState(false);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef<Set<MessageListener>>(new Set());
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isCleaningUpRef = useRef(false);

  // Subscribe to raw WS messages
  const subscribe = useCallback((listener: MessageListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  // Send message over WebSocket
  const send = useCallback((msg: WSMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  // Create a brand new session (tries Next.js API, Backend API, and client-side generator)
  const createSession = useCallback(async (): Promise<SessionData> => {
    let newSession: SessionData | null = null;

    // 1. Try local/configured backend API
    try {
      const res = await fetch(`${backendUrl}/api/session`, { method: 'POST', signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        newSession = await res.json();
        setBackendOnline(true);
      }
    } catch {
      // Backend not reached directly
    }

    // 2. Try Next.js internal API route (guaranteed to work on Vercel)
    if (!newSession) {
      try {
        const res = await fetch('/api/session', { method: 'POST', signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          newSession = await res.json();
        }
      } catch {
        // Next.js API route fallback
      }
    }

    // 3. Client-side deterministic fallback
    if (!newSession) {
      newSession = generateClientSession();
    }

    setSession(newSession);
    setAgentConnected(false);
    setAgentId(null);

    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newSession));
    }

    return newSession;
  }, [backendUrl]);

  // Revoke paired agent
  const revokeAgent = useCallback(async () => {
    if (session?.sessionId) {
      try {
        await fetch(`${backendUrl}/api/agent/revoke`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: session.sessionId }),
          signal: AbortSignal.timeout(2000),
        });
      } catch {
        // ignore
      }
    }
    setAgentConnected(false);
    setAgentId(null);
    await createSession();
  }, [session?.sessionId, backendUrl, createSession]);

  // Probe backend online status with initial mount grace period
  useEffect(() => {
    let active = true;
    let hasMounted = false;

    const checkBackend = async () => {
      // If WebSocket is open or agent is connected, backend is guaranteed online!
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        if (active) setBackendOnline(true);
        return;
      }
      try {
        const res = await fetch(`${backendUrl}/api/health`, { signal: AbortSignal.timeout(1500) });
        if (active) setBackendOnline(res.ok);
      } catch {
        // Only set offline if mounted and WebSocket is not currently opening
        if (active && hasMounted && (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN)) {
          setBackendOnline(false);
        }
      }
    };

    // Immediate probe
    checkBackend();
    
    // Mark mounted after 2.5s grace period so WebSocket has time to shake hands
    const mountTimer = setTimeout(() => {
      hasMounted = true;
    }, 2500);

    const interval = setInterval(checkBackend, 8000);
    return () => {
      active = false;
      clearTimeout(mountTimer);
      clearInterval(interval);
    };
  }, [backendUrl]);

  // Ensure session exists on mount
  useEffect(() => {
    if (!session?.sessionId || !session?.pairingCode) {
      createSession();
    }
  }, [session?.sessionId, session?.pairingCode, createSession]);

  // Single persistent WebSocket connection effect
  useEffect(() => {
    const sessionId = session?.sessionId;
    if (!sessionId) return;

    isCleaningUpRef.current = false;
    const targetWsUrl = `${wsUrl}/ws/dashboard?session=${sessionId}`;

    function cleanupWs() {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        const ws = wsRef.current;
        wsRef.current = null;
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        try {
          ws.close();
        } catch {
          // ignore
        }
      }
    }

    function connect() {
      if (isCleaningUpRef.current) return;
      cleanupWs();

      try {
        setConnectionState('connecting');
        const ws = new WebSocket(targetWsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (isCleaningUpRef.current) return;
          setConnectionState('connected');
          setBackendOnline(true);
        };

        ws.onmessage = (event) => {
          try {
            const data: WSMessage = JSON.parse(event.data);

            if (data.type === 'agent_status') {
              const isConn = data.status === 'connected';
              setAgentConnected(isConn);
              if (data.agentId) setAgentId(data.agentId as string);
              else if (!isConn) setAgentId(null);
              if (data.pairingCode && session) {
                setSession(prev => prev ? { ...prev, pairingCode: data.pairingCode as string } : null);
              }
            }

            // Dispatch to page subscribers
            listenersRef.current.forEach((listener) => {
              try {
                listener(data);
              } catch {
                // ignore listener error
              }
            });
          } catch {
            // ignore parse error
          }
        };

        ws.onerror = () => {
          if (isCleaningUpRef.current) return;
          setConnectionState('error');
        };

        ws.onclose = (e) => {
          if (isCleaningUpRef.current) return;
          setConnectionState('disconnected');
          setAgentConnected(false);
          // Only reconnect if not closed cleanly
          if (e.code !== 1000 && !isCleaningUpRef.current) {
            reconnectTimerRef.current = setTimeout(connect, 3000);
          }
        };
      } catch {
        if (!isCleaningUpRef.current) {
          setConnectionState('error');
          reconnectTimerRef.current = setTimeout(connect, 3000);
        }
      }
    }

    connect();

    return () => {
      isCleaningUpRef.current = true;
      cleanupWs();
    };
  }, [session?.sessionId, wsUrl]);

  // Memoized context value
  const value = useMemo<SessionContextValue>(() => ({
    session,
    status,
    agentConnected,
    agentId,
    connectionState,
    backendOnline,
    createSession,
    revokeAgent,
    send,
    subscribe,
    backendUrl,
    wsUrl,
    setBackendUrl,
    setWsUrl,
    isVercel,
  }), [
    session,
    status,
    agentConnected,
    agentId,
    connectionState,
    backendOnline,
    createSession,
    revokeAgent,
    send,
    subscribe,
    backendUrl,
    wsUrl,
    setBackendUrl,
    setWsUrl,
    isVercel,
  ]);

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}
