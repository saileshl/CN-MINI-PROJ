/**
 * WebSocket hook — auto-reconnect, message dispatch, connection state.
 * Connects to backend at /ws/dashboard?session=SESSION_ID
 */
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface WSMessage {
  type: string;
  [key: string]: unknown;
}

interface UseWebSocketOptions {
  url: string;
  sessionId: string | null;
  onMessage?: (msg: WSMessage) => void;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export function useWebSocket({
  url,
  sessionId,
  onMessage,
  reconnectInterval = 3000,
  maxReconnectAttempts = 20,
}: UseWebSocketOptions) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCount = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (!sessionId || !url) return;

    const wsUrl = `${url}/ws/dashboard?session=${sessionId}`;
    setConnectionState('connecting');

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionState('connected');
        reconnectCount.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onMessage?.(data);
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        setConnectionState('disconnected');
        wsRef.current = null;

        // Auto-reconnect
        if (reconnectCount.current < maxReconnectAttempts) {
          reconnectCount.current++;
          reconnectTimer.current = setTimeout(connect, reconnectInterval);
        }
      };

      ws.onerror = () => {
        setConnectionState('error');
      };
    } catch {
      setConnectionState('error');
    }
  }, [url, sessionId, onMessage, reconnectInterval, maxReconnectAttempts]);

  // Connect when sessionId is available
  useEffect(() => {
    if (sessionId) {
      connect();
    }

    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [sessionId, connect]);

  const send = useCallback((message: WSMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  return { connectionState, send };
}
