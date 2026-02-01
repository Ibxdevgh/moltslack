/**
 * RelayClient - Core communication layer using Agent Relay protocol
 * Handles message passing, topic subscriptions, and presence signals
 *
 * This module provides two modes of operation:
 * 1. Standalone mode (default): Runs its own WebSocket server for direct agent connections
 * 2. Daemon mode: Connects to the agent-relay daemon via Unix socket for relay-dashboard integration
 */

import { EventEmitter } from 'events';
import { WebSocket, WebSocketServer } from 'ws';
import { v4 as uuid } from 'uuid';
import type {
  RelayEvent,
  RelayEventType,
  WSMessage,
  Message,
  PresenceEvent,
  PresenceStatus,
} from '../models/types.js';

/** Connection mode for the relay client */
export type RelayMode = 'standalone' | 'daemon';

interface RelayClientOptions {
  /** WebSocket port for standalone mode (default: 3001) */
  port?: number;
  /** Host to bind to in standalone mode (default: 0.0.0.0) */
  host?: string;
  /** Connection mode: 'standalone' runs WS server, 'daemon' connects to relay daemon */
  mode?: RelayMode;
  /** Unix socket path for daemon mode (default: .agent-relay/relay.sock) */
  socketPath?: string;
  /** Agent name for daemon mode registration */
  agentName?: string;
}

interface PendingAck {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timeout: NodeJS.Timeout;
}

export class RelayClient extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private connections: Map<string, WebSocket> = new Map(); // agentId -> WebSocket
  private subscriptions: Map<string, Set<string>> = new Map(); // channelId -> Set<agentId>
  private pendingAcks: Map<string, PendingAck> = new Map();
  private port: number;
  private host: string;

  constructor(options: RelayClientOptions = {}) {
    super();
    this.port = options.port || 3001;
    this.host = options.host || '0.0.0.0';
  }

  /**
   * Start the WebSocket server for Relay communication
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wss = new WebSocketServer({ port: this.port, host: this.host });

      this.wss.on('listening', () => {
        console.log(`[Relay] WebSocket server listening on ${this.host}:${this.port}`);
        resolve();
      });

      this.wss.on('error', (error) => {
        console.error('[Relay] WebSocket server error:', error);
        reject(error);
      });

      this.wss.on('connection', (ws, req) => {
        this.handleConnection(ws, req);
      });
    });
  }

  /**
   * Stop the WebSocket server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.wss) {
        // Close all connections
        for (const [agentId, ws] of this.connections) {
          ws.close(1000, 'Server shutting down');
          this.connections.delete(agentId);
        }
        this.wss.close(() => {
          console.log('[Relay] WebSocket server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, req: any): void {
    const connectionId = uuid();
    console.log(`[Relay] New connection: ${connectionId}`);

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString()) as WSMessage;
        this.handleMessage(ws, connectionId, message);
      } catch (error) {
        console.error('[Relay] Invalid message format:', error);
        this.sendError(ws, 'INVALID_FORMAT', 'Invalid message format');
      }
    });

    ws.on('close', () => {
      this.handleDisconnect(connectionId);
    });

    ws.on('error', (error) => {
      console.error(`[Relay] Connection error ${connectionId}:`, error);
    });
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(ws: WebSocket, connectionId: string, message: WSMessage): void {
    const { type, event, data, correlationId } = message;

    switch (type) {
      case 'event':
        this.handleEvent(ws, connectionId, event!, data, correlationId);
        break;
      case 'message':
        this.handleChatMessage(ws, data as Message);
        break;
      case 'presence':
        this.handlePresence(ws, data as PresenceEvent);
        break;
      case 'ack':
        this.handleAck(correlationId!, data);
        break;
      default:
        this.sendError(ws, 'UNKNOWN_TYPE', `Unknown message type: ${type}`);
    }
  }

  /**
   * Handle relay events (connect, join, leave, etc.)
   */
  private handleEvent(
    ws: WebSocket,
    connectionId: string,
    event: RelayEventType,
    data: any,
    correlationId?: string
  ): void {
    switch (event) {
      case 'agent.connected':
        this.registerConnection(data.agentId, ws);
        this.emit('agent:connected', data);
        this.sendAck(ws, correlationId);
        break;

      case 'channel.joined':
        this.subscribeToChannel(data.agentId, data.channelId);
        this.broadcastToChannel(data.channelId, {
          type: 'event',
          event: 'channel.joined',
          data,
          timestamp: Date.now(),
        });
        this.emit('channel:joined', data);
        this.sendAck(ws, correlationId);
        break;

      case 'channel.left':
        this.unsubscribeFromChannel(data.agentId, data.channelId);
        this.broadcastToChannel(data.channelId, {
          type: 'event',
          event: 'channel.left',
          data,
          timestamp: Date.now(),
        });
        this.emit('channel:left', data);
        this.sendAck(ws, correlationId);
        break;

      default:
        this.emit(`event:${event}`, data);
        this.sendAck(ws, correlationId);
    }
  }

  /**
   * Handle chat message - broadcast to channel subscribers
   */
  private handleChatMessage(ws: WebSocket, message: Message): void {
    this.broadcastToChannel(message.channelId, {
      type: 'message',
      data: message,
      timestamp: Date.now(),
    });
    this.emit('message', message);
  }

  /**
   * Handle presence update
   */
  private handlePresence(ws: WebSocket, presence: PresenceEvent): void {
    // Broadcast presence to all connections
    this.broadcast({
      type: 'presence',
      data: presence,
      timestamp: Date.now(),
    });
    this.emit('presence', presence);
  }

  /**
   * Handle acknowledgment
   */
  private handleAck(correlationId: string, data: unknown): void {
    const pending = this.pendingAcks.get(correlationId);
    if (pending) {
      clearTimeout(pending.timeout);
      pending.resolve(data);
      this.pendingAcks.delete(correlationId);
    }
  }

  /**
   * Handle connection disconnect
   */
  private handleDisconnect(connectionId: string): void {
    // Find and remove the agent's connection
    for (const [agentId, ws] of this.connections) {
      if (ws.readyState === WebSocket.CLOSED) {
        this.connections.delete(agentId);
        // Remove from all subscriptions
        for (const [channelId, subscribers] of this.subscriptions) {
          subscribers.delete(agentId);
        }
        this.emit('agent:disconnected', { agentId });
        console.log(`[Relay] Agent disconnected: ${agentId}`);
      }
    }
  }

  /**
   * Register a WebSocket connection for an agent
   */
  registerConnection(agentId: string, ws: WebSocket): void {
    this.connections.set(agentId, ws);
    console.log(`[Relay] Agent registered: ${agentId}`);
  }

  /**
   * Subscribe an agent to a channel
   */
  subscribeToChannel(agentId: string, channelId: string): void {
    if (!this.subscriptions.has(channelId)) {
      this.subscriptions.set(channelId, new Set());
    }
    this.subscriptions.get(channelId)!.add(agentId);
    console.log(`[Relay] Agent ${agentId} subscribed to channel ${channelId}`);
  }

  /**
   * Unsubscribe an agent from a channel
   */
  unsubscribeFromChannel(agentId: string, channelId: string): void {
    const subscribers = this.subscriptions.get(channelId);
    if (subscribers) {
      subscribers.delete(agentId);
      console.log(`[Relay] Agent ${agentId} unsubscribed from channel ${channelId}`);
    }
  }

  /**
   * Send a message to a specific agent
   */
  sendToAgent(agentId: string, message: WSMessage): void {
    const ws = this.connections.get(agentId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Broadcast a message to all subscribers of a channel
   */
  broadcastToChannel(channelId: string, message: WSMessage): void {
    const subscribers = this.subscriptions.get(channelId);
    if (!subscribers) return;

    for (const agentId of subscribers) {
      this.sendToAgent(agentId, message);
    }
  }

  /**
   * Broadcast a message to all connected agents
   */
  broadcast(message: WSMessage): void {
    for (const [agentId] of this.connections) {
      this.sendToAgent(agentId, message);
    }
  }

  /**
   * Send an acknowledgment
   */
  private sendAck(ws: WebSocket, correlationId?: string): void {
    if (correlationId && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'ack',
        correlationId,
        data: { success: true },
        timestamp: Date.now(),
      }));
    }
  }

  /**
   * Send an error message
   */
  private sendError(ws: WebSocket, code: string, message: string): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'error',
        data: { code, message },
        timestamp: Date.now(),
      }));
    }
  }

  /**
   * Send a message and wait for acknowledgment
   */
  async sendWithAck(agentId: string, message: WSMessage, timeoutMs = 5000): Promise<unknown> {
    const correlationId = uuid();
    message.correlationId = correlationId;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingAcks.delete(correlationId);
        reject(new Error(`Timeout waiting for ack from ${agentId}`));
      }, timeoutMs);

      this.pendingAcks.set(correlationId, { resolve, reject, timeout });
      this.sendToAgent(agentId, message);
    });
  }

  /**
   * Emit a relay event to all subscribers
   */
  emitRelayEvent(event: RelayEvent): void {
    if (event.target) {
      // Send to specific channel
      this.broadcastToChannel(event.target, {
        type: 'event',
        event: event.type,
        data: event,
        timestamp: event.timestamp,
      });
    } else {
      // Broadcast to all
      this.broadcast({
        type: 'event',
        event: event.type,
        data: event,
        timestamp: event.timestamp,
      });
    }
  }

  /**
   * Get connected agent count
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Get channel subscriber count
   */
  getChannelSubscribers(channelId: string): string[] {
    return Array.from(this.subscriptions.get(channelId) || []);
  }

  /**
   * Get the connection mode
   */
  get mode(): RelayMode {
    return 'standalone';
  }
}

// Re-export the daemon client for direct use
export { RelayDaemonClient, type RelayDaemonClientOptions } from './relay-daemon-client.js';

/**
 * Common interface for both RelayClient and RelayDaemonClient
 * This allows the server to use either implementation interchangeably
 */
export interface IRelayClient extends EventEmitter {
  start(): Promise<void>;
  stop(): Promise<void>;
  registerConnection(agentId: string, ws: unknown): void;
  subscribeToChannel(agentId: string, channelId: string): void;
  unsubscribeFromChannel(agentId: string, channelId: string): void;
  sendToAgent(agentId: string, message: WSMessage): void;
  broadcastToChannel(channelId: string, message: WSMessage): void;
  broadcast(message: WSMessage): void;
  emitRelayEvent(event: RelayEvent): void;
  getConnectionCount(): number;
  getChannelSubscribers(channelId: string): string[];
}

/**
 * Factory function to create a relay client based on the mode
 *
 * @param options - Configuration options
 * @returns Either a RelayClient (standalone) or RelayDaemonClient (daemon mode)
 *
 * @example Standalone mode (runs its own WebSocket server)
 * ```ts
 * const relay = createRelayClient({ mode: 'standalone', port: 3001 });
 * await relay.start();
 * ```
 *
 * @example Daemon mode (connects to relay daemon)
 * ```ts
 * const relay = createRelayClient({
 *   mode: 'daemon',
 *   socketPath: '.agent-relay/relay.sock',
 *   agentName: 'Moltslack'
 * });
 * await relay.start();
 * ```
 */
export function createRelayClient(options: RelayClientOptions = {}): IRelayClient {
  const mode = options.mode || 'standalone';

  if (mode === 'daemon') {
    // Import dynamically to avoid circular dependencies
    const { RelayDaemonClient } = require('./relay-daemon-client.js');
    return new RelayDaemonClient({
      socketPath: options.socketPath || '.agent-relay/relay.sock',
      agentName: options.agentName || 'Moltslack',
    }) as IRelayClient;
  }

  return new RelayClient({
    port: options.port,
    host: options.host,
  }) as IRelayClient;
}

export default RelayClient;
