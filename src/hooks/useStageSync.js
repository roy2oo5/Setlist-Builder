import { useEffect, useRef, useState } from 'react';

function relayBaseURL() {
  const configuredURL = import.meta.env.VITE_STAGE_RELAY_URL;
  if (configuredURL) return configuredURL.replace(/\/+$/, '');
  const url = new URL(window.location.href);
  if (url.port === '5173') url.port = '8080';
  return url.origin;
}

export function getGigPackURL() {
  const configuredURL = import.meta.env.VITE_STAGE_GIG_PACK_URL;
  return configuredURL || `${relayBaseURL()}/api/stage/gig-pack`;
}

function getWebSocketURL() {
  const url = new URL(`${relayBaseURL()}/ws`);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

export default function useStageSync(onStateUpdate) {
  const [connected, setConnected] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const socketRef = useRef(null);
  const callbackRef = useRef(onStateUpdate);
  const pendingRef = useRef({});
  const sendRef = useRef(() => false);

  callbackRef.current = onStateUpdate;

  useEffect(() => {
    let disposed = false;
    let reconnectTimer;
    let reconnectAttempt = 0;
    const delays = [1000, 2000, 3000];

    function connect() {
      if (disposed || !navigator.onLine) {
        setConnected(false);
        return;
      }
      const currentSocket = socketRef.current;
      if (currentSocket && (
        currentSocket.readyState === WebSocket.CONNECTING ||
        currentSocket.readyState === WebSocket.OPEN
      )) return;

      const socket = new WebSocket(getWebSocketURL());
      socketRef.current = socket;
      socket.onopen = () => {
        if (disposed || socketRef.current !== socket) return socket.close();
        reconnectAttempt = 0;
        setConnected(true);
        const pending = Object.values(pendingRef.current);
        pendingRef.current = {};
        for (const message of pending) {
          try {
            socket.send(JSON.stringify(message));
          } catch {
            pendingRef.current[message.type] = message;
            socket.close();
            break;
          }
        }
      };
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'STATE_UPDATE') callbackRef.current(message);
        } catch (error) {
          console.warn('Ignoring an invalid Stage View sync message:', error);
        }
      };
      socket.onclose = () => {
        const wasCurrentSocket = socketRef.current === socket;
        if (!wasCurrentSocket) return;
        socketRef.current = null;
        setConnected(false);
        if (disposed || !navigator.onLine) return;
        const delay = delays[Math.min(reconnectAttempt, delays.length - 1)];
        reconnectAttempt += 1;
        reconnectTimer = window.setTimeout(connect, delay);
      };
      socket.onerror = () => socket.close();
    }

    function handleOnline() {
      setOnline(true);
      window.clearTimeout(reconnectTimer);
      reconnectAttempt = 0;
      const currentSocket = socketRef.current;
      if (currentSocket && currentSocket.readyState !== WebSocket.CLOSED) currentSocket.close();
      socketRef.current = null;
      connect();
    }

    function handleOffline() {
      setOnline(false);
      setConnected(false);
      window.clearTimeout(reconnectTimer);
      socketRef.current?.close();
      socketRef.current = null;
    }

    sendRef.current = (message) => {
      const socket = socketRef.current;
      if (socket && socket.readyState === WebSocket.OPEN) {
        try {
          socket.send(JSON.stringify(message));
          return true;
        } catch {
          pendingRef.current[message.type] = message;
          return false;
        }
      }
      pendingRef.current[message.type] = message;
      return false;
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    connect();

    return () => {
      disposed = true;
      window.clearTimeout(reconnectTimer);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      sendRef.current = () => false;
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, []);

  return {
    connected,
    online,
    clearPending: () => { pendingRef.current = {}; },
    sendChangeSong: (setlistId, songId) => sendRef.current({ type: 'CHANGE_SONG', setlistId, songId }),
    sendTranspose: (transpose) => sendRef.current({ type: 'TRANSPOSE', transpose }),
    sendAutoScroll: (autoScroll, scrollSpeed) => sendRef.current({
      type: 'AUTO_SCROLL',
      autoScroll,
      scrollSpeed,
    }),
    sendScrollPosition: (scrollLine, scrollOffset) => sendRef.current({
      type: 'SCROLL_POSITION',
      scrollLine,
      scrollOffset,
    }),
  };
}
