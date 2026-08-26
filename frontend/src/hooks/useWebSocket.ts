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
  const onMessageRef = useRef(onMessage);
  const isExplicitClose = useRef(false);

  // Keep onMessageRef synchronized with latest callback without causing reconnects
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!sessionId || !url) {
      setConnectionState('disconnected');
      return;
    }

    isExplicitClose.current = false;
    reconnectCount.current = 0;

    function connect() {
      if (!sessionId || !url || isExplicitClose.current) return;

      const wsUrl = `${url}/ws/dashboard?session=${sessionId}`;
      setConnectionState('connecting');

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (isExplicitClose.current) {
            ws.close();
            return;
          }
          setConnectionState('connected');
          reconnectCount.current = 0;
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            onMessageRef.current?.(data);
          } catch {
            // ignore parse errors
          }
        };

        ws.onclose = () => {
          wsRef.current = null;
          if (!isExplicitClose.current) {
            setConnectionState('disconnected');
            if (reconnectCount.current < maxReconnectAttempts) {
              reconnectCount.current++;
              reconnectTimer.current = setTimeout(connect, reconnectInterval);
            }
          }
        };

        ws.onerror = () => {
          if (!isExplicitClose.current) {
            setConnectionState('error');
          }
        };
      } catch {
        if (!isExplicitClose.current) {
          setConnectionState('error');
        }
      }
    }

    connect();

    return () => {
      isExplicitClose.current = true;
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [url, sessionId, reconnectInterval, maxReconnectAttempts]);

  const send = useCallback((message: WSMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  return { connectionState, send };
}
