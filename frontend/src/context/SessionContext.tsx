'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000';
const STORAGE_KEY = 'netjitter_session';

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
  createSession: () => Promise<SessionData | null>;
  revokeAgent: () => Promise<void>;
  send: (msg: WSMessage) => void;
  subscribe: (listener: MessageListener) => () => void;
  backendUrl: string;
  wsUrl: string;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  // Synchronously load saved session from localStorage on initial render
  const [session, setSession] = useState<SessionData | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.sessionId) return parsed;
        }
      } catch {
        // ignore
      }
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

  // Create a brand new session
  const createSession = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/session`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to create session');
      const data: SessionData = await res.json();
      setSession(data);
      setAgentConnected(false);
      setAgentId(null);
      setBackendOnline(true);
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      }
      return data;
    } catch {
      setBackendOnline(false);
      return null;
    }
  }, []);

  // Revoke paired agent
  const revokeAgent = useCallback(async () => {
    if (!session?.sessionId) return;
    try {
      await fetch(`${BACKEND_URL}/api/agent/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.sessionId }),
      });
      setAgentConnected(false);
      setAgentId(null);
      await createSession();
    } catch {
      // ignore
    }
  }, [session?.sessionId, createSession]);

  // Ensure session exists on mount (create if not present in localStorage)
  useEffect(() => {
    if (!session?.sessionId) {
      createSession();
    }
  }, [session?.sessionId, createSession]);

  // Single persistent WebSocket connection effect — depends solely on sessionId
  useEffect(() => {
    const sessionId = session?.sessionId;
    if (!sessionId) return;

    isCleaningUpRef.current = false;
    const targetWsUrl = `${WS_URL}/ws/dashboard?session=${sessionId}`;

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

    function connectWs() {
      if (isCleaningUpRef.current) return;

      cleanupWs();
      setConnectionState('connecting');

      try {
        const ws = new WebSocket(targetWsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (isCleaningUpRef.current) {
            cleanupWs();
            return;
          }
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

        ws.onclose = () => {
          if (!isCleaningUpRef.current) {
            wsRef.current = null;
            setConnectionState('disconnected');
            if (!reconnectTimerRef.current) {
              reconnectTimerRef.current = setTimeout(() => {
                reconnectTimerRef.current = null;
                connectWs();
              }, 2000);
            }
          }
        };

        ws.onerror = () => {
          if (!isCleaningUpRef.current) {
            setConnectionState('disconnected');
            setBackendOnline(false);
          }
        };
      } catch {
        if (!isCleaningUpRef.current) {
          setConnectionState('disconnected');
          setBackendOnline(false);
        }
      }
    }

    connectWs();

    return () => {
      isCleaningUpRef.current = true;
      cleanupWs();
    };
  }, [session?.sessionId]);

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
    backendUrl: BACKEND_URL,
    wsUrl: WS_URL,
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
  ]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return ctx;
}
