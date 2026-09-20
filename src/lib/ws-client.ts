import type { ClientMessage, GameMode, ServerMessage } from '@/types/game';

// ---------------------------------------------------------------------------
// WebSocket client that connects to the Cloudflare Worker.
//
// The Worker URL is set via NEXT_PUBLIC_WS_URL env var.
// In dev:  ws://localhost:8787
// In prod: wss://themind-server.<your-subdomain>.workers.dev
// ---------------------------------------------------------------------------

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8787';

// Derive the HTTP base URL from the WS base for REST calls (e.g. exists check).
const HTTP_BASE = WS_BASE
  .replace(/^wss:\/\//, 'https://')
  .replace(/^ws:\/\//, 'http://');

/** Creates a server-owned room code, avoiding client-side code collisions. */
export async function createRoom(mode: GameMode): Promise<string> {
  const res = await fetch(`${HTTP_BASE}/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  });
  if (!res.ok) throw new Error('Could not create a room. Please try again.');
  const data = await res.json() as { roomCode?: unknown };
  if (typeof data.roomCode !== 'string') throw new Error('Invalid room response');
  return data.roomCode;
}

/** Returns true only for a room created by the server and not yet cleaned up. */
export async function checkRoomExists(roomCode: string): Promise<boolean> {
  try {
    const res = await fetch(`${HTTP_BASE}/room/${roomCode.toUpperCase()}`);
    if (!res.ok) return false;
    const data = await res.json() as { exists?: boolean };
    return data.exists === true;
  } catch {
    return false;
  }
}

export class GameClient {
  private ws: WebSocket | null = null;
  private roomCode: string;
  private onMessageCb: ((msg: ServerMessage) => void) | null = null;
  private onConnectCb: (() => void) | null = null;
  private onDisconnectCb: (() => void) | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = true;
  private reconnectAttempts = 0;

  constructor(roomCode: string) {
    this.roomCode = roomCode.toUpperCase();
  }

  connect(): void {
    const protocol = WS_BASE.startsWith('https') ? 'wss' : WS_BASE.startsWith('http') ? 'ws' : WS_BASE.startsWith('wss') ? 'wss' : 'ws';
    const host = WS_BASE.replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '');
    const url = `${protocol}://${host}/room/${this.roomCode}`;

    console.log('[WS] Connecting to', url);
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log('[WS] Connected');
      this.reconnectAttempts = 0;
      this.onConnectCb?.();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as ServerMessage;
        this.onMessageCb?.(msg);
      } catch (err) {
        console.error('[WS] Parse error:', err);
      }
    };

    this.ws.onclose = () => {
      console.log('[WS] Disconnected');
      this.onDisconnectCb?.();
      if (this.shouldReconnect) {
        const delay = Math.min(10_000, 500 * 2 ** this.reconnectAttempts) + Math.random() * 250;
        this.reconnectAttempts++;
        this.reconnectTimer = setTimeout(() => this.connect(), delay);
      }
    };

    this.ws.onerror = (err) => {
      console.error('[WS] Error:', err);
    };
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.reconnectAttempts = 0;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    // Only close if the connection is open or connecting — avoids noisy
    // errors during React Strict Mode's double-invoke teardown in dev.
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      this.ws.close();
    }
    this.ws = null;
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      console.warn('[WS] Not connected, dropping message:', msg.type);
    }
  }

  onMessage(cb: (msg: ServerMessage) => void): void {
    this.onMessageCb = cb;
  }

  onConnect(cb: () => void): void {
    this.onConnectCb = cb;
  }

  onDisconnect(cb: () => void): void {
    this.onDisconnectCb = cb;
  }
}
