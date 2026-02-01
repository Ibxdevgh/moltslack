/**
 * RelayDaemonClient - Client that connects to the agent-relay daemon via Unix socket
 *
 * This provides an alternative communication layer that integrates Moltslack
 * with the relay-dashboard ecosystem. Instead of running its own WebSocket server,
 * Moltslack connects to the agent-relay daemon's Unix socket.
 */

import { EventEmitter } from 'events';
import * as net from 'net';
import { v4 as uuid } from 'uuid';
import type {
  RelayEvent,
  RelayEventType,
  WSMessage,
  Message,
  PresenceEvent,
  PresenceStatusType,
} from '../models/types.js';

// Protocol constants based on @agent-relay/sdk
const PROTOCOL_VERSION = 2;
const MAX_FRAME_BYTES = 16 * 1024 * 1024; // 16MB

// Message types from @agent-relay/protocol
type MessageType =
  | 'HELLO'
  | 'WELCOME'
  | 'SEND'
  | 'DELIVER'
  | 'ACK'
  | 'SUBSCRIBE'
  | 'UNSUBSCRIBE'
  | 'PING'
  | 'PONG'
  | 'ERROR'
  | 'CHANNEL_JOIN'
  | 'CHANNEL_LEAVE'
  | 'CHANNEL_MESSAGE';

type PayloadKind = 'message' | 'state' | 'command' | 'query' | 'response';

interface Envelope<T = unknown> {
  id: string;
  v: number;
  type: MessageType;
  from?: string;
  to?: string;
  ts: number;
  payload?: T;
}

interface SendPayload {
  body: string;
  kind?: PayloadKind;
  data?: Record<string, unknown>;
  thread?: string;
}

interface ChannelMessagePayload {
  channel: string;
  body: string;
  thread?: string;
  mentions?: string[];
  attachments?: unknown[];
  data?: Record<string, unknown>;
}

export type ClientState = 'DISCONNECTED' | 'CONNECTING' | 'HANDSHAKING' | 'READY' | 'BACKOFF';

export interface RelayDaemonClientOptions {
  /** Path to the Unix socket (default: .agent-relay/relay.sock) */
  socketPath?: string;
  /** Agent name for this client */
  agentName?: string;
  /** CLI identifier */
  cli?: string;
  /** Auto-reconnect on disconnect */
  reconnect?: boolean;
  /** Max reconnect attempts */
  maxReconnectAttempts?: number;
  /** Initial reconnect delay (ms) */
  reconnectDelayMs?: number;
  /** Max reconnect delay (ms) */
  reconnectMaxDelayMs?: number;
  /** Entity type: 'agent' (default) or 'user' */
  entityType?: 'agent' | 'user';
}

interface PendingAck {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timeout: NodeJS.Timeout;
}

/**
 * Frame parser for the agent-relay protocol
 * Parses length-prefixed MessagePack frames from the socket stream
 */
class FrameParser {
  private buffer: Buffer = Buffer.alloc(0);
  private expectedLength: number | null = null;

  onFrame?: (data: Envelope) => void;
  onError?: (error: Error) => void;

  feed(data: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, data]);
    this.parseFrames();
  }

  private parseFrames(): void {
    while (this.buffer.length > 0) {
      // Read length prefix (4 bytes, big-endian)
      if (this.expectedLength === null) {
        if (this.buffer.length < 4) return;
        this.expectedLength = this.buffer.readUInt32BE(0);
        this.buffer = this.buffer.slice(4);

        if (this.expectedLength > MAX_FRAME_BYTES) {
          this.onError?.(new Error(`Frame too large: ${this.expectedLength} bytes`));
          this.buffer = Buffer.alloc(0);
          this.expectedLength = null;
          return;
        }
      }

      // Read frame data
      if (this.buffer.length < this.expectedLength) return;

      const frameData = this.buffer.slice(0, this.expectedLength);
      this.buffer = this.buffer.slice(this.expectedLength);
      this.expectedLength = null;

      try {
        // Parse as JSON - the daemon supports JSON framing in legacy mode
        const envelope = JSON.parse(frameData.toString('utf-8')) as Envelope;
        this.onFrame?.(envelope);
      } catch (err) {
        this.onError?.(err as Error);
      }
    }
  }

  reset(): void {
    this.buffer = Buffer.alloc(0);
    this.expectedLength = null;
  }
}

/**
 * RelayDaemonClient connects to the agent-relay daemon via Unix socket.
 *
 * This allows Moltslack to participate in the relay-dashboard ecosystem,
 * enabling agents to communicate through the dashboard's channels and monitoring.
 */
export class RelayDaemonClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private parser: FrameParser;
  private _state: ClientState = 'DISCONNECTED';
  private sessionId?: string;
  private reconnectAttempts = 0;
  private reconnectDelay: number;
  private reconnectTimer?: NodeJS.Timeout;
  private pendingAcks: Map<string, PendingAck> = new Map();
  private subscriptions: Set<string> = new Set();
  private channelMembers: Map<string, Set<string>> = new Map();

  private socketPath: string;
  private agentName: string;
  private cli: string;
  private reconnect: boolean;
  private maxReconnectAttempts: number;
  private reconnectDelayMs: number;
  private reconnectMaxDelayMs: number;
  private entityType: 'agent' | 'user';

  // Callbacks for events
  onMessage?: (from: string, payload: SendPayload, messageId: string) => void;
  onChannelMessage?: (from: string, channel: string, body: string, envelope: Envelope<ChannelMessagePayload>) => void;
  onStateChange?: (state: ClientState) => void;
  onError?: (error: Error) => void;

  constructor(options: RelayDaemonClientOptions = {}) {
    super();

    this.socketPath = options.socketPath || '.agent-relay/relay.sock';
    this.agentName = options.agentName || 'Moltslack';
    this.cli = options.cli || 'moltslack';
    this.reconnect = options.reconnect ?? true;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 10;
    this.reconnectDelayMs = options.reconnectDelayMs ?? 1000;
    this.reconnectMaxDelayMs = options.reconnectMaxDelayMs ?? 30000;
    this.reconnectDelay = this.reconnectDelayMs;
    this.entityType = options.entityType ?? 'agent';

    this.parser = new FrameParser();
    this.parser.onFrame = this.handleFrame.bind(this);
    this.parser.onError = (err) => {
      console.error('[RelayDaemonClient] Frame parse error:', err);
      this.onError?.(err);
    };
  }

  get state(): ClientState {
    return this._state;
  }

  get name(): string {
    return this.agentName;
  }

  /**
   * Connect to the relay daemon
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this._state !== 'DISCONNECTED') {
        return resolve();
      }

      this.setState('CONNECTING');
      console.log(`[RelayDaemonClient] Connecting to ${this.socketPath}...`);

      this.socket = net.createConnection(this.socketPath);

      this.socket.on('connect', () => {
        console.log('[RelayDaemonClient] Connected to relay daemon');
        this.setState('HANDSHAKING');
        this.sendHello();
      });

      this.socket.on('data', (data: Buffer) => {
        this.parser.feed(data);
      });

      this.socket.on('close', () => {
        this.handleDisconnect();
      });

      this.socket.on('error', (err) => {
        console.error('[RelayDaemonClient] Socket error:', err);
        this.onError?.(err);
        if (this._state === 'CONNECTING') {
          reject(err);
        }
      });

      // Wait for WELCOME message
      const welcomeTimeout = setTimeout(() => {
        if (this._state === 'HANDSHAKING') {
          reject(new Error('Timeout waiting for WELCOME from daemon'));
        }
      }, 10000);

      const originalOnFrame = this.parser.onFrame;
      this.parser.onFrame = (envelope) => {
        if (envelope.type === 'WELCOME') {
          clearTimeout(welcomeTimeout);
          this.parser.onFrame = originalOnFrame;
          resolve();
        }
        originalOnFrame?.call(this.parser, envelope);
      };
    });
  }

  /**
   * Stop the connection
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = undefined;
      }

      if (this.socket) {
        this.socket.end();
        this.socket.destroy();
        this.socket = null;
      }

      this.setState('DISCONNECTED');
      console.log('[RelayDaemonClient] Disconnected');
      resolve();
    });
  }

  /**
   * Send HELLO handshake message
   */
  private sendHello(): void {
    const envelope: Envelope = {
      id: uuid(),
      v: PROTOCOL_VERSION,
      type: 'HELLO',
      ts: Date.now(),
      payload: {
        name: this.agentName,
        cli: this.cli,
        entityType: this.entityType,
        version: PROTOCOL_VERSION,
      },
    };
    this.sendEnvelope(envelope);
  }

  /**
   * Handle incoming frames from the daemon
   */
  private handleFrame(envelope: Envelope): void {
    switch (envelope.type) {
      case 'WELCOME':
        this.handleWelcome(envelope);
        break;
      case 'DELIVER':
        this.handleDeliver(envelope);
        break;
      case 'CHANNEL_MESSAGE':
        this.handleChannelMessageFrame(envelope);
        break;
      case 'ACK':
        this.handleAck(envelope);
        break;
      case 'PING':
        this.handlePing(envelope);
        break;
      case 'ERROR':
        this.handleErrorFrame(envelope);
        break;
      default:
        console.log(`[RelayDaemonClient] Unhandled frame type: ${envelope.type}`);
    }
  }

  private handleWelcome(envelope: Envelope): void {
    const payload = envelope.payload as { sessionId?: string };
    this.sessionId = payload?.sessionId;
    this.setState('READY');
    this.reconnectAttempts = 0;
    this.reconnectDelay = this.reconnectDelayMs;
    console.log(`[RelayDaemonClient] Welcome received, session: ${this.sessionId}`);
    this.emit('connected', { sessionId: this.sessionId });
  }

  private handleDeliver(envelope: Envelope): void {
    const from = envelope.from || 'unknown';
    const payload = envelope.payload as SendPayload;
    const messageId = envelope.id;

    console.log(`[RelayDaemonClient] Message from ${from}: ${payload?.body?.substring(0, 50)}...`);

    // Emit to listeners
    this.onMessage?.(from, payload, messageId);
    this.emit('message', {
      id: messageId,
      from,
      body: payload?.body,
      kind: payload?.kind,
      data: payload?.data,
      thread: payload?.thread,
      timestamp: envelope.ts,
    });

    // Auto-ACK the message
    this.sendAck(messageId, from);
  }

  private handleChannelMessageFrame(envelope: Envelope): void {
    const payload = envelope.payload as ChannelMessagePayload;
    const from = envelope.from || 'unknown';

    console.log(`[RelayDaemonClient] Channel message from ${from} to ${payload?.channel}`);

    this.onChannelMessage?.(from, payload?.channel, payload?.body, envelope as Envelope<ChannelMessagePayload>);
    this.emit('channel:message', {
      from,
      channel: payload?.channel,
      body: payload?.body,
      thread: payload?.thread,
      mentions: payload?.mentions,
      timestamp: envelope.ts,
    });
  }

  private handleAck(envelope: Envelope): void {
    const ackPayload = envelope.payload as { correlationId?: string };
    const correlationId = ackPayload?.correlationId || envelope.id;

    const pending = this.pendingAcks.get(correlationId);
    if (pending) {
      clearTimeout(pending.timeout);
      pending.resolve(envelope.payload);
      this.pendingAcks.delete(correlationId);
    }
  }

  private handlePing(envelope: Envelope): void {
    // Respond with PONG
    const pong: Envelope = {
      id: uuid(),
      v: PROTOCOL_VERSION,
      type: 'PONG',
      ts: Date.now(),
      payload: { correlationId: envelope.id },
    };
    this.sendEnvelope(pong);
  }

  private handleErrorFrame(envelope: Envelope): void {
    const payload = envelope.payload as { code?: string; message?: string };
    console.error(`[RelayDaemonClient] Error from daemon: ${payload?.code} - ${payload?.message}`);
    this.onError?.(new Error(`${payload?.code}: ${payload?.message}`));
    this.emit('error', { code: payload?.code, message: payload?.message });
  }

  private handleDisconnect(): void {
    const wasReady = this._state === 'READY';
    this.setState('DISCONNECTED');
    this.parser.reset();

    if (wasReady) {
      this.emit('disconnected');
    }

    if (this.reconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    this.reconnectAttempts++;
    this.setState('BACKOFF');
    console.log(`[RelayDaemonClient] Reconnecting in ${this.reconnectDelay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = undefined;
      try {
        await this.start();
      } catch (err) {
        console.error('[RelayDaemonClient] Reconnect failed:', err);
      }
    }, this.reconnectDelay);

    // Exponential backoff
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.reconnectMaxDelayMs);
  }

  private setState(state: ClientState): void {
    if (this._state !== state) {
      this._state = state;
      this.onStateChange?.(state);
      this.emit('stateChange', state);
    }
  }

  /**
   * Send an envelope to the daemon
   */
  private sendEnvelope(envelope: Envelope): boolean {
    if (!this.socket || this.socket.destroyed) {
      return false;
    }

    try {
      const data = JSON.stringify(envelope);
      const buffer = Buffer.from(data, 'utf-8');
      const lengthBuffer = Buffer.alloc(4);
      lengthBuffer.writeUInt32BE(buffer.length, 0);

      this.socket.write(Buffer.concat([lengthBuffer, buffer]));
      return true;
    } catch (err) {
      console.error('[RelayDaemonClient] Send error:', err);
      return false;
    }
  }

  /**
   * Send a message to another agent
   */
  sendMessage(to: string, body: string, kind: PayloadKind = 'message', data?: Record<string, unknown>, thread?: string): boolean {
    if (this._state !== 'READY') {
      console.warn('[RelayDaemonClient] Cannot send message: not connected');
      return false;
    }

    const envelope: Envelope = {
      id: uuid(),
      v: PROTOCOL_VERSION,
      type: 'SEND',
      from: this.agentName,
      to,
      ts: Date.now(),
      payload: {
        body,
        kind,
        data,
        thread,
      } as SendPayload,
    };

    return this.sendEnvelope(envelope);
  }

  /**
   * Send an ACK for a received message
   */
  sendAck(messageId: string, to: string): boolean {
    const envelope: Envelope = {
      id: uuid(),
      v: PROTOCOL_VERSION,
      type: 'ACK',
      from: this.agentName,
      to,
      ts: Date.now(),
      payload: {
        correlationId: messageId,
        status: 'delivered',
      },
    };
    return this.sendEnvelope(envelope);
  }

  /**
   * Broadcast a message to all agents.
   * Accepts either a string body or a WSMessage object for compatibility.
   */
  broadcast(bodyOrMessage: string | WSMessage, kind: PayloadKind = 'message', data?: Record<string, unknown>): boolean {
    if (typeof bodyOrMessage === 'object') {
      // Handle WSMessage format from services
      const message = bodyOrMessage as WSMessage;
      if (message.type === 'presence' || message.type === 'message') {
        const body = JSON.stringify(message.data);
        return this.sendMessage('*', body, 'message', { _wsMessage: message });
      }
      return this.sendMessage('*', JSON.stringify(message), 'message');
    }
    return this.sendMessage('*', bodyOrMessage, kind, data);
  }

  /**
   * Join a channel
   */
  joinChannel(channel: string): boolean {
    if (this._state !== 'READY') {
      console.warn('[RelayDaemonClient] Cannot join channel: not connected');
      return false;
    }

    const envelope: Envelope = {
      id: uuid(),
      v: PROTOCOL_VERSION,
      type: 'CHANNEL_JOIN',
      from: this.agentName,
      ts: Date.now(),
      payload: {
        channel,
      },
    };

    const sent = this.sendEnvelope(envelope);
    if (sent) {
      if (!this.channelMembers.has(channel)) {
        this.channelMembers.set(channel, new Set());
      }
      this.channelMembers.get(channel)!.add(this.agentName);
      this.emit('channel:joined', { channel, agentId: this.agentName });
    }
    return sent;
  }

  /**
   * Leave a channel
   */
  leaveChannel(channel: string): boolean {
    if (this._state !== 'READY') {
      console.warn('[RelayDaemonClient] Cannot leave channel: not connected');
      return false;
    }

    const envelope: Envelope = {
      id: uuid(),
      v: PROTOCOL_VERSION,
      type: 'CHANNEL_LEAVE',
      from: this.agentName,
      ts: Date.now(),
      payload: {
        channel,
      },
    };

    const sent = this.sendEnvelope(envelope);
    if (sent) {
      this.channelMembers.get(channel)?.delete(this.agentName);
      this.emit('channel:left', { channel, agentId: this.agentName });
    }
    return sent;
  }

  /**
   * Send a message to a channel
   */
  sendChannelMessage(channel: string, body: string, options?: { thread?: string; mentions?: string[] }): boolean {
    if (this._state !== 'READY') {
      console.warn('[RelayDaemonClient] Cannot send channel message: not connected');
      return false;
    }

    const envelope: Envelope<ChannelMessagePayload> = {
      id: uuid(),
      v: PROTOCOL_VERSION,
      type: 'CHANNEL_MESSAGE',
      from: this.agentName,
      ts: Date.now(),
      payload: {
        channel,
        body,
        thread: options?.thread,
        mentions: options?.mentions,
      },
    };

    return this.sendEnvelope(envelope);
  }

  /**
   * Subscribe to a topic (for relay events)
   */
  subscribe(topic: string): boolean {
    if (this._state !== 'READY') {
      return false;
    }

    const envelope: Envelope = {
      id: uuid(),
      v: PROTOCOL_VERSION,
      type: 'SUBSCRIBE',
      from: this.agentName,
      ts: Date.now(),
      payload: { topic },
    };

    const sent = this.sendEnvelope(envelope);
    if (sent) {
      this.subscriptions.add(topic);
    }
    return sent;
  }

  /**
   * Unsubscribe from a topic
   */
  unsubscribe(topic: string): boolean {
    if (this._state !== 'READY') {
      return false;
    }

    const envelope: Envelope = {
      id: uuid(),
      v: PROTOCOL_VERSION,
      type: 'UNSUBSCRIBE',
      from: this.agentName,
      ts: Date.now(),
      payload: { topic },
    };

    const sent = this.sendEnvelope(envelope);
    if (sent) {
      this.subscriptions.delete(topic);
    }
    return sent;
  }

  /**
   * Send a message and wait for acknowledgment
   */
  async sendWithAck(to: string, body: string, timeoutMs = 5000): Promise<unknown> {
    const correlationId = uuid();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingAcks.delete(correlationId);
        reject(new Error(`Timeout waiting for ack from ${to}`));
      }, timeoutMs);

      this.pendingAcks.set(correlationId, { resolve, reject, timeout });

      const envelope: Envelope = {
        id: correlationId,
        v: PROTOCOL_VERSION,
        type: 'SEND',
        from: this.agentName,
        to,
        ts: Date.now(),
        payload: {
          body,
          kind: 'message',
          _sync: true,
        } as SendPayload & { _sync: boolean },
      };

      if (!this.sendEnvelope(envelope)) {
        clearTimeout(timeout);
        this.pendingAcks.delete(correlationId);
        reject(new Error('Failed to send message'));
      }
    });
  }

  // ============================================================================
  // Bridge methods for compatibility with existing RelayClient interface
  // ============================================================================

  /**
   * Register a connection (for compatibility - daemon handles this)
   */
  registerConnection(agentId: string, ws: unknown): void {
    console.log(`[RelayDaemonClient] Register connection called for ${agentId} - handled by daemon`);
  }

  /**
   * Subscribe an agent to a channel (for compatibility)
   */
  subscribeToChannel(agentId: string, channelId: string): void {
    if (!this.channelMembers.has(channelId)) {
      this.channelMembers.set(channelId, new Set());
    }
    this.channelMembers.get(channelId)!.add(agentId);
    console.log(`[RelayDaemonClient] Agent ${agentId} subscribed to channel ${channelId}`);
  }

  /**
   * Unsubscribe an agent from a channel (for compatibility)
   */
  unsubscribeFromChannel(agentId: string, channelId: string): void {
    this.channelMembers.get(channelId)?.delete(agentId);
    console.log(`[RelayDaemonClient] Agent ${agentId} unsubscribed from channel ${channelId}`);
  }

  /**
   * Send to a specific agent (alias for sendMessage)
   */
  sendToAgent(agentId: string, message: WSMessage): void {
    if (message.type === 'message' && message.data) {
      const data = message.data as Message;
      this.sendMessage(agentId, data.content);
    }
  }

  /**
   * Broadcast to channel subscribers.
   * Accepts a WSMessage object for compatibility with services.
   */
  broadcastToChannel(channelId: string, message: WSMessage): void {
    if (message.type === 'message' && message.data) {
      const data = message.data as Message;
      this.sendChannelMessage(channelId, data.content);
    } else if (message.type === 'presence' && message.data) {
      // Presence updates are sent as channel messages too
      this.sendChannelMessage(channelId, JSON.stringify(message.data));
    }
  }

  /**
   * Get connection count (for compatibility)
   */
  getConnectionCount(): number {
    return this._state === 'READY' ? 1 : 0;
  }

  /**
   * Get channel subscribers
   */
  getChannelSubscribers(channelId: string): string[] {
    return Array.from(this.channelMembers.get(channelId) || []);
  }

  /**
   * Emit a relay event
   */
  emitRelayEvent(event: RelayEvent): void {
    if (event.target) {
      this.sendChannelMessage(event.target, JSON.stringify(event));
    } else {
      this.broadcast(JSON.stringify(event));
    }
  }
}

export default RelayDaemonClient;
