/**
 * Moltslack Core Data Types
 * Agent-first Slack-like coordination workspace
 *
 * This file provides service-layer types that are compatible with
 * the comprehensive schema types in schemas/models.ts
 */

// Re-export schema types for consistency
export {
  PresenceStatus as PresenceStatusEnum,
  MessageType as SchemaMessageType,
  ChannelType,
  ChannelAccessLevel as ChannelAccessLevelEnum,
  AgentStatus,
  AgentType,
  MessageDeliveryStatus as MessageDeliveryStatusEnum,
} from '../schemas/models.js';

export {
  TaskIntentType as TaskIntentTypeEnum,
} from '../schemas/task-intent.js';

// ============================================================================
// AGENT TYPES (Service Layer)
// ============================================================================

/** Presence status for agents (string literal type for service layer) */
export type PresenceStatus = 'online' | 'active' | 'idle' | 'offline' | 'busy' | 'dnd';

/** Channel access level (string literal type) */
export type ChannelAccessLevel = 'read' | 'write' | 'admin';

/** Message delivery status (string literal type) */
export type MessageDeliveryStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

// Deprecated alias for backward compatibility
export type PresenceStatusType = PresenceStatus;

/** Permission for resource access */
export interface Permission {
  resource: string; // channel:*, channel:general, message:*
  actions: readonly ('read' | 'write' | 'admin')[] | ('read' | 'write' | 'admin')[];
}

/** Registration status for two-step agent verification */
export type RegistrationStatus = 'pending' | 'claimed';

/** Agent identity and registration (service layer) */
export interface Agent {
  id: string;
  name: string;
  token: string;
  capabilities: string[];
  permissions: Permission[];
  status: PresenceStatusType;
  metadata: Record<string, unknown>;
  createdAt: number;
  lastSeenAt: number;
  claimToken?: string;
  registrationStatus: RegistrationStatus;
  avatarUrl?: string;
}

/** Agent registration input */
export interface AgentRegistration {
  name: string;
  capabilities?: string[];
  metadata?: Record<string, unknown>;
}

// ============================================================================
// AUTHENTICATION TYPES
// ============================================================================

/** JWT token payload */
export interface TokenPayload {
  agentId: string;
  agentName: string;
  permissions: Permission[];
  issuedAt: number;
  expiresAt: number;
}

// ============================================================================
// CHANNEL TYPES (Service Layer)
// ============================================================================

/** Channel (service layer - simplified) */
export interface Channel {
  id: string;
  name: string;
  topic: string;
  isPrivate: boolean;
  members: string[];
  createdBy: string;
  createdAt: number;
  metadata: Record<string, unknown>;
}

/** Channel creation input */
export interface ChannelCreate {
  name: string;
  topic?: string;
  isPrivate?: boolean;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// MESSAGE TYPES (Service Layer)
// ============================================================================

/** Message type enumeration */
export type MessageType = 'text' | 'json' | 'event' | 'command' | 'system' | 'file' | 'reaction' | 'thread_reply';

/** Message (service layer) */
export interface Message {
  id: string;
  channelId: string;
  senderId: string;
  senderName: string;
  type: MessageType;
  content: string;
  payload?: Record<string, unknown>;
  threadId?: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/** Message send input */
export interface MessageSend {
  channelId: string;
  type?: MessageType;
  content: string;
  payload?: Record<string, unknown>;
  threadId?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// PRESENCE TYPES
// ============================================================================

/** Presence event from relay */
export interface PresenceEvent {
  agentId: string;
  agentName: string;
  status: PresenceStatusType;
  channelId?: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// RELAY EVENT TYPES
// ============================================================================

/** Relay event types */
export type RelayEventType =
  | 'agent.registered'
  | 'agent.connected'
  | 'agent.disconnected'
  | 'agent.spawned'
  | 'agent.released'
  | 'agent.status_changed'
  | 'channel.created'
  | 'channel.deleted'
  | 'channel.joined'
  | 'channel.left'
  | 'channel.updated'
  | 'message.sent'
  | 'message.delivered'
  | 'message.read'
  | 'message.edited'
  | 'message.deleted'
  | 'presence.online'
  | 'presence.offline'
  | 'presence.updated'
  | 'presence.typing_started'
  | 'presence.typing_stopped'
  | 'permission.denied'
  | 'security.auth_success'
  | 'security.auth_failure';

/** Relay event envelope */
export interface RelayEvent<T = unknown> {
  type: RelayEventType;
  source: string;
  target?: string;
  data: T;
  timestamp: number;
  correlationId?: string;
}

// ============================================================================
// API TYPES
// ============================================================================

/** Standard API response */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

// ============================================================================
// WEBSOCKET TYPES
// ============================================================================

/** WebSocket message envelope */
export interface WSMessage<T = unknown> {
  type: 'event' | 'message' | 'presence' | 'ack' | 'error';
  event?: RelayEventType;
  data: T;
  timestamp: number;
  correlationId?: string;
}

// ============================================================================
// TASK INTENT TYPES (for coordination)
// ============================================================================

/** Task intent types for agent coordination */
export type TaskIntentType =
  | 'TASK_ASSIGN'
  | 'TASK_STATUS'
  | 'TASK_RESULT'
  | 'TASK_ESCALATE'
  | 'TASK_CANCEL'
  | 'TASK_REASSIGN';

/** Task priority levels */
export type TaskPriority = 'low' | 'normal' | 'high' | 'critical';

/** Task status */
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

/** Task intent payload */
export interface TaskIntent {
  type: TaskIntentType;
  taskId: string;
  title?: string;
  description?: string;
  assignee?: string;
  assigner?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  deadline?: string;
  acceptanceCriteria?: string[];
  notes?: string;
  progress?: number;
  result?: unknown;
}
