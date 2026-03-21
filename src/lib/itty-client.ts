import { connect } from 'itty-sockets';
import type { GameAction } from '@/types/game';

export class GameClient {
  private channel: any = null;
  private roomCode: string;
  private playerId: string;
  private onMessageCallback: ((action: GameAction) => void) | null = null;
  private onConnectCallback: (() => void) | null = null;
  private onDisconnectCallback: (() => void) | null = null;
  private messageQueue: GameAction[] = [];
  private isConnected = false;

  constructor(roomCode: string, playerId: string) {
    this.roomCode = roomCode;
    this.playerId = playerId;
  }

  connect(): void {
    console.log(`[WebSocket] Connecting to themind-${this.roomCode}...`);

    // Connect to itty.ws with channel name 'themind-{roomCode}'
    // The itty-sockets API: connect(url) returns channel with .on() method
    this.channel = connect(`themind-${this.roomCode}`);

    // Chain event handlers
    this.channel
      .on('message', (data: any) => {
        try {
          console.log('[WebSocket] Raw message:', data);
          // Handle both string and object formats
          let action: GameAction;
          if (typeof data === 'string') {
            action = JSON.parse(data) as GameAction;
          } else if (data && typeof data === 'object') {
            // If itty-sockets already parsed it or wraps it
            action = (data.message ? JSON.parse(data.message) : data) as GameAction;
          } else {
            console.warn('[WebSocket] Unknown message format:', data);
            return;
          }

          console.log('[WebSocket] Parsed:', action.type);

          if (this.onMessageCallback) {
            this.onMessageCallback(action);
          }
        } catch (error) {
          console.error('[WebSocket] Parse error:', error, data);
        }
      })
      .on('open', () => {
        console.log('[WebSocket] Connected!');
        this.isConnected = true;
        console.log('[WebSocket] isConnected set to true, callback exists:', !!this.onConnectCallback);

        // Flush queued messages
        console.log('[WebSocket] Flushing queue, size:', this.messageQueue.length);
        while (this.messageQueue.length > 0) {
          const action = this.messageQueue.shift();
          if (action) this.doSend(action);
        }

        if (this.onConnectCallback) {
          console.log('[WebSocket] Calling onConnect callback...');
          this.onConnectCallback();
          console.log('[WebSocket] onConnect callback completed');
        }
      })
      .on('close', () => {
        console.log('[WebSocket] Disconnected');
        this.isConnected = false;
        if (this.onDisconnectCallback) {
          this.onDisconnectCallback();
        }
      })
      .on('error', (error: any) => {
        console.error('[WebSocket] Error:', error);
      });

    console.log('[WebSocket] Channel created, handlers registered');
  }

  disconnect(): void {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
      this.isConnected = false;
    }
  }

  send(action: GameAction): void {
    console.log(`[WebSocket] send() called, isConnected=${this.isConnected}, hasChannel=${!!this.channel}`);
    if (this.isConnected && this.channel) {
      this.doSend(action);
    } else {
      console.log('[WebSocket] Queueing message');
      this.messageQueue.push(action);
    }
  }

  private doSend(action: GameAction): void {
    const message = {
      ...action,
      _playerId: this.playerId,
    };
    const messageStr = JSON.stringify(message);
    console.log('[WebSocket] Sending:', action.type);
    this.channel.send(messageStr);
  }

  onMessage(callback: (action: GameAction) => void): void {
    this.onMessageCallback = callback;
  }

  onConnect(callback: () => void): void {
    this.onConnectCallback = callback;
  }

  onDisconnect(callback: () => void): void {
    this.onDisconnectCallback = callback;
  }
}

// Helper to check if itty.ws is available
export async function checkConnection(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const testChannel = connect('themind-connection-test');

      const timeout = setTimeout(() => {
        testChannel.close();
        resolve(false);
      }, 3000);

      testChannel.on('open', () => {
        clearTimeout(timeout);
        testChannel.close();
        resolve(true);
      });

      testChannel.on('error', () => {
        clearTimeout(timeout);
        testChannel.close();
        resolve(false);
      });
    } catch (error) {
      resolve(false);
    }
  });
}
