/**
 * PresenceService - Agent presence tracking and heartbeat management
 */

import { v4 as uuid } from 'uuid';
import {
  PresenceStatus,
  type Presence,
  type PresenceActivity,
  type UUID,
} from '../schemas/models.js';
import type { RelayClient } from '../relay/relay-client.js';
import type { RelayDaemonClient } from '../relay/relay-daemon-client.js';

/**
 * Both RelayClient and RelayDaemonClient implement the methods needed
 * by PresenceService, though with slightly different signatures.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RelayClientUnion = RelayClient | RelayDaemonClient;

const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const IDLE_TIMEOUT = 60000; // 1 minute
const OFFLINE_TIMEOUT = 120000; // 2 minutes

export class PresenceService {
  private presences: Map<string, Presence> = new Map();
  private typingTimers: Map<string, NodeJS.Timeout> = new Map();
  private heartbeatChecker?: NodeJS.Timeout;
  private projectId: UUID;
  private relayClient?: RelayClientUnion;

  constructor(projectId: UUID, relayClient?: RelayClientUnion) {
    this.projectId = projectId;
    this.relayClient = relayClient;
    this.startHeartbeatChecker();
  }

  /**
   * Start the heartbeat checker
   */
  private startHeartbeatChecker(): void {
    this.heartbeatChecker = setInterval(() => {
      this.checkHeartbeats();
    }, HEARTBEAT_INTERVAL);
  }

  /**
   * Stop the heartbeat checker
   */
  stop(): void {
    if (this.heartbeatChecker) {
      clearInterval(this.heartbeatChecker);
    }
    for (const timer of this.typingTimers.values()) {
      clearTimeout(timer);
    }
  }

  /**
   * Register agent presence (on connect)
   */
  connect(
    agentId: UUID,
    connectionInfo: {
      connectionId?: string;
      clientType?: 'cli' | 'web' | 'api' | 'bridge';
      clientVersion?: string;
      ipAddress?: string;
    } = {}
  ): Presence {
    const now = new Date().toISOString();

    const presence: Presence = {
      agentId,
      projectId: this.projectId,
      status: PresenceStatus.ONLINE,
      lastHeartbeat: now,
      activeChannels: [],
      isTyping: false,
      connection: {
        connectionId: connectionInfo.connectionId || uuid(),
        clientType: connectionInfo.clientType || 'api',
        clientVersion: connectionInfo.clientVersion || '1.0.0',
        connectedAt: now,
        ipAddress: connectionInfo.ipAddress,
      },
    };

    this.presences.set(agentId, presence);
    this.broadcastPresenceChange(agentId, PresenceStatus.ONLINE);

    console.log(`[PresenceService] Agent ${agentId} connected`);
    return presence;
  }

  /**
   * Unregister agent presence (on disconnect)
   */
  disconnect(agentId: UUID, reason: 'graceful' | 'timeout' | 'error' | 'kicked' = 'graceful'): void {
    const presence = this.presences.get(agentId);
    if (presence) {
      presence.status = PresenceStatus.OFFLINE;
      this.broadcastPresenceChange(agentId, PresenceStatus.OFFLINE, { reason });
      this.presences.delete(agentId);
      console.log(`[PresenceService] Agent ${agentId} disconnected (${reason})`);
    }
  }

  /**
   * Update presence status
   */
  setStatus(agentId: UUID, status: PresenceStatus, statusMessage?: string): boolean {
    const presence = this.presences.get(agentId);
    if (!presence) return false;

    const previousStatus = presence.status;
    presence.status = status;
    presence.statusMessage = statusMessage;
    presence.lastHeartbeat = new Date().toISOString();

    if (previousStatus !== status) {
      this.broadcastPresenceChange(agentId, status, { previousStatus });
    }

    return true;
  }

  /**
   * Process heartbeat from agent
   */
  heartbeat(agentId: UUID, activeChannels?: UUID[]): boolean {
    const presence = this.presences.get(agentId);
    if (!presence) return false;

    presence.lastHeartbeat = new Date().toISOString();

    // Update active channels if provided
    if (activeChannels) {
      presence.activeChannels = activeChannels;
    }

    // If agent was idle, set back to online
    if (presence.status === PresenceStatus.IDLE) {
      this.setStatus(agentId, PresenceStatus.ONLINE);
    }

    return true;
  }

  /**
   * Start activity
   */
  startActivity(
    agentId: UUID,
    activityType: PresenceActivity['type'],
    description?: string,
    contextId?: UUID
  ): boolean {
    const presence = this.presences.get(agentId);
    if (!presence) return false;

    presence.activity = {
      type: activityType,
      description,
      contextId,
      startedAt: new Date().toISOString(),
    };

    this.setStatus(agentId, PresenceStatus.BUSY);
    return true;
  }

  /**
   * End activity
   */
  endActivity(agentId: UUID): boolean {
    const presence = this.presences.get(agentId);
    if (!presence) return false;

    presence.activity = undefined;
    this.setStatus(agentId, PresenceStatus.ONLINE);
    return true;
  }

  /**
   * Set typing indicator
   */
  setTyping(agentId: UUID, channelId: UUID, isTyping: boolean): boolean {
    const presence = this.presences.get(agentId);
    if (!presence) return false;

    // Clear existing typing timer
    const timerKey = `${agentId}:${channelId}`;
    const existingTimer = this.typingTimers.get(timerKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.typingTimers.delete(timerKey);
    }

    if (isTyping) {
      presence.isTyping = true;
      presence.typingInChannel = channelId;

      // Auto-clear typing after 10 seconds
      const timer = setTimeout(() => {
        this.setTyping(agentId, channelId, false);
      }, 10000);
      this.typingTimers.set(timerKey, timer);

      // Broadcast typing start
      this.broadcastTyping(agentId, channelId, true);
    } else {
      presence.isTyping = false;
      presence.typingInChannel = undefined;

      // Broadcast typing stop
      this.broadcastTyping(agentId, channelId, false);
    }

    return true;
  }

  /**
   * Get agent presence
   */
  get(agentId: UUID): Presence | undefined {
    return this.presences.get(agentId);
  }

  /**
   * Get all presences
   */
  getAll(): Presence[] {
    return Array.from(this.presences.values());
  }

  /**
   * Get online agents
   */
  getOnline(): Presence[] {
    return this.getAll().filter(p => p.status !== PresenceStatus.OFFLINE);
  }

  /**
   * Get agents in a channel
   */
  getInChannel(channelId: UUID): Presence[] {
    return this.getAll().filter(p => p.activeChannels.includes(channelId));
  }

  /**
   * Check heartbeats and update statuses
   */
  private checkHeartbeats(): void {
    const now = Date.now();

    for (const [agentId, presence] of this.presences) {
      const lastHeartbeat = new Date(presence.lastHeartbeat).getTime();
      const elapsed = now - lastHeartbeat;

      if (elapsed > OFFLINE_TIMEOUT && presence.status !== PresenceStatus.OFFLINE) {
        // Mark as offline
        this.disconnect(agentId, 'timeout');
      } else if (elapsed > IDLE_TIMEOUT && presence.status === PresenceStatus.ONLINE) {
        // Mark as idle
        this.setStatus(agentId, PresenceStatus.IDLE);
      }
    }
  }

  /**
   * Broadcast presence change via relay
   */
  private broadcastPresenceChange(
    agentId: UUID,
    status: PresenceStatus,
    extra?: Record<string, unknown>
  ): void {
    this.relayClient?.broadcast({
      type: 'presence',
      data: {
        agentId,
        status,
        timestamp: Date.now(),
        ...extra,
      },
      timestamp: Date.now(),
    });
  }

  /**
   * Broadcast typing indicator via relay
   */
  private broadcastTyping(agentId: UUID, channelId: UUID, isTyping: boolean): void {
    this.relayClient?.broadcastToChannel(channelId, {
      type: 'presence',
      data: {
        agentId,
        channelId,
        isTyping,
        timestamp: Date.now(),
      },
      timestamp: Date.now(),
    });
  }

  /**
   * Join a channel (update active channels)
   */
  joinChannel(agentId: UUID, channelId: UUID): boolean {
    const presence = this.presences.get(agentId);
    if (!presence) return false;

    if (!presence.activeChannels.includes(channelId)) {
      presence.activeChannels.push(channelId);
    }
    return true;
  }

  /**
   * Leave a channel (update active channels)
   */
  leaveChannel(agentId: UUID, channelId: UUID): boolean {
    const presence = this.presences.get(agentId);
    if (!presence) return false;

    presence.activeChannels = presence.activeChannels.filter(id => id !== channelId);
    return true;
  }
}

export default PresenceService;
