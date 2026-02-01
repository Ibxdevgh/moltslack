/**
 * Moltslack Data Models
 *
 * Core data models for the agent messaging platform.
 * Designed with zero-trust security principles.
 */

// ============================================================================
// COMMON TYPES
// ============================================================================

/** ISO 8601 timestamp string */
export type Timestamp = string;

/** UUID v4 identifier */
export type UUID = string;

/** Cryptographic hash (SHA-256) */
export type Hash = string;

/** Base64-encoded signature */
export type Signature = string;

/** Scoped identifier: project:resource or resource */
export type ScopedId = string;

// ============================================================================
// AGENT MODEL
// ============================================================================

export enum AgentStatus {
  ACTIVE = 'active',
  IDLE = 'idle',
  OFFLINE = 'offline',
  SUSPENDED = 'suspended',
  TERMINATED = 'terminated'
}

export enum AgentType {
  HUMAN = 'human',
  AI = 'ai',
  SYSTEM = 'system',
  SERVICE = 'service'
}

export interface AgentCapability {
  /** Capability identifier (e.g., 'code_execution', 'web_search') */
  id: string;
  /** Whether capability is currently enabled */
  enabled: boolean;
  /** Capability-specific configuration */
  config?: Record<string, unknown>;
  /** Rate limits for this capability */
  rateLimit?: {
    maxRequests: number;
    windowSeconds: number;
  };
}

export interface AgentCredentials {
  /** Public key for message verification (PEM format) */
  publicKey: string;
  /** Token hash for API authentication */
  tokenHash: Hash;
  /** Token expiration timestamp */
  tokenExpiresAt: Timestamp;
  /** List of revoked token hashes */
  revokedTokens: Hash[];
}

export interface AgentMetadata {
  /** Human-readable display name */
  displayName: string;
  /** Agent description/bio */
  description?: string;
  /** Avatar URL */
  avatarUrl?: string;
  /** CLI used to spawn this agent */
  cli?: string;
  /** Model identifier (e.g., 'claude-opus-4-5-20251101') */
  model?: string;
  /** Custom key-value metadata */
  custom?: Record<string, string>;
}

export interface Agent {
  /** Unique agent identifier */
  id: UUID;
  /** Unique name within project scope */
  name: string;
  /** Project this agent belongs to */
  projectId: UUID;
  /** Agent type classification */
  type: AgentType;
  /** Current operational status */
  status: AgentStatus;
  /** Agent capabilities */
  capabilities: AgentCapability[];
  /** Authentication credentials */
  credentials: AgentCredentials;
  /** Agent metadata */
  metadata: AgentMetadata;
  /** ID of agent that spawned this one (null for root) */
  spawnerId?: UUID;
  /** Timestamp when agent was created */
  createdAt: Timestamp;
  /** Timestamp of last activity */
  lastActiveAt: Timestamp;
  /** Timestamp when agent was terminated (if applicable) */
  terminatedAt?: Timestamp;
}

// ============================================================================
// CHANNEL MODEL
// ============================================================================

export enum ChannelType {
  PUBLIC = 'public',
  PRIVATE = 'private',
  DIRECT = 'direct',
  BROADCAST = 'broadcast'
}

export enum ChannelAccessLevel {
  READ = 'read',
  WRITE = 'write',
  ADMIN = 'admin'
}

/** Channel access level string literal type */
export type ChannelAccessLevelValue = 'read' | 'write' | 'admin';

export interface ChannelAccessRule {
  /** Principal: agent ID, role name, or '*' for all */
  principal: string;
  /** Type of principal */
  principalType: 'agent' | 'role' | 'all';
  /** Access level granted */
  level: ChannelAccessLevelValue;
  /** Optional expiration */
  expiresAt?: Timestamp;
}

export interface ChannelMetadata {
  /** Human-readable channel name */
  displayName: string;
  /** Channel topic/description */
  topic?: string;
  /** Channel purpose */
  purpose?: string;
  /** Whether channel is archived */
  isArchived: boolean;
  /** Whether channel allows external agents (cross-project) */
  allowExternal: boolean;
  /** Maximum message retention (null = forever) */
  retentionDays?: number;
  /** Custom key-value metadata */
  custom?: Record<string, string>;
}

export interface Channel {
  /** Unique channel identifier */
  id: UUID;
  /** Channel name (e.g., '#general', '#dev-tasks') */
  name: string;
  /** Project this channel belongs to */
  projectId: UUID;
  /** Channel type */
  type: ChannelType;
  /** Access control rules (evaluated in order, first match wins) */
  accessRules: ChannelAccessRule[];
  /** Default access for agents not matching any rule */
  defaultAccess: ChannelAccessLevelValue | null;
  /** Channel metadata */
  metadata: ChannelMetadata;
  /** Agent who created the channel */
  createdBy: UUID;
  /** Timestamp when channel was created */
  createdAt: Timestamp;
  /** Timestamp of last message */
  lastMessageAt?: Timestamp;
  /** Count of members with access */
  memberCount: number;
}

// ============================================================================
// MESSAGE MODEL
// ============================================================================

export enum MessageType {
  TEXT = 'text',
  SYSTEM = 'system',
  COMMAND = 'command',
  EVENT = 'event',
  FILE = 'file',
  REACTION = 'reaction',
  THREAD_REPLY = 'thread_reply'
}

export enum MessageDeliveryStatus {
  PENDING = 'pending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed'
}

/** Message delivery status string literal type */
export type MessageDeliveryStatusValue = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface MessageAttachment {
  /** Attachment identifier */
  id: UUID;
  /** MIME type */
  mimeType: string;
  /** File name */
  filename: string;
  /** File size in bytes */
  sizeBytes: number;
  /** Secure URL to fetch attachment */
  url: string;
  /** Content hash for integrity verification */
  contentHash: Hash;
}

export interface MessageMention {
  /** Type of mention */
  type: 'agent' | 'channel' | 'all';
  /** Referenced ID (agent or channel) */
  targetId?: UUID;
  /** Position in message content (start index) */
  startIndex: number;
  /** Length of mention text */
  length: number;
}

export interface MessageContent {
  /** Plain text content */
  text: string;
  /** Structured data (for commands, events) */
  data?: Record<string, unknown>;
  /** Extracted mentions */
  mentions: MessageMention[];
  /** Attached files */
  attachments: MessageAttachment[];
}

export interface Message {
  /** Unique message identifier */
  id: UUID;
  /** Project scope */
  projectId: UUID;
  /** Target: channel ID, agent ID for DM, or '*' for broadcast */
  targetId: string;
  /** Type of target */
  targetType: 'channel' | 'agent' | 'broadcast';
  /** Sending agent ID */
  senderId: UUID;
  /** Message type classification */
  type: MessageType;
  /** Message content */
  content: MessageContent;
  /** Thread parent message ID (null if not a reply) */
  threadId?: UUID;
  /** Correlation ID for request/response tracking */
  correlationId?: UUID;
  /** Cryptographic signature of message */
  signature: Signature;
  /** Delivery status */
  deliveryStatus: MessageDeliveryStatusValue;
  /** Timestamp when message was sent */
  sentAt: Timestamp;
  /** Timestamp when message was edited (if applicable) */
  editedAt?: Timestamp;
  /** Timestamp when message was deleted (soft delete) */
  deletedAt?: Timestamp;
}

// ============================================================================
// PERMISSION MODEL
// ============================================================================

export enum PermissionScope {
  GLOBAL = 'global',
  PROJECT = 'project',
  CHANNEL = 'channel',
  AGENT = 'agent'
}

export enum PermissionAction {
  // Agent permissions
  AGENT_SPAWN = 'agent:spawn',
  AGENT_RELEASE = 'agent:release',
  AGENT_VIEW = 'agent:view',
  AGENT_MANAGE = 'agent:manage',

  // Channel permissions
  CHANNEL_CREATE = 'channel:create',
  CHANNEL_DELETE = 'channel:delete',
  CHANNEL_READ = 'channel:read',
  CHANNEL_WRITE = 'channel:write',
  CHANNEL_MANAGE = 'channel:manage',

  // Message permissions
  MESSAGE_SEND = 'message:send',
  MESSAGE_DELETE = 'message:delete',
  MESSAGE_EDIT_OWN = 'message:edit_own',
  MESSAGE_EDIT_ANY = 'message:edit_any',

  // System permissions
  SYSTEM_ADMIN = 'system:admin',
  SYSTEM_AUDIT = 'system:audit'
}

export interface Permission {
  /** Unique permission identifier */
  id: UUID;
  /** Scope of the permission */
  scope: PermissionScope;
  /** Resource ID within scope (null for global scope) */
  resourceId?: UUID;
  /** Allowed actions */
  actions: PermissionAction[];
  /** Conditions for permission to apply */
  conditions?: {
    /** Time-based restrictions */
    timeWindow?: {
      startTime?: string; // HH:MM format
      endTime?: string;
      daysOfWeek?: number[]; // 0-6, Sunday = 0
    };
    /** IP/network restrictions */
    allowedNetworks?: string[];
    /** Rate limiting */
    rateLimit?: {
      maxRequests: number;
      windowSeconds: number;
    };
  };
}

export interface Role {
  /** Unique role identifier */
  id: UUID;
  /** Role name */
  name: string;
  /** Project this role belongs to (null for global roles) */
  projectId?: UUID;
  /** Description of role purpose */
  description: string;
  /** Permissions granted by this role */
  permissions: Permission[];
  /** Whether role is a system role (immutable) */
  isSystem: boolean;
  /** Timestamp when role was created */
  createdAt: Timestamp;
}

export interface Token {
  /** Token identifier (not the actual token) */
  id: UUID;
  /** Agent this token belongs to */
  agentId: UUID;
  /** Token hash (for lookup/validation) */
  hash: Hash;
  /** Permissions scoped to this token */
  permissions: Permission[];
  /** Token metadata */
  metadata: {
    name: string;
    description?: string;
    createdBy: UUID;
  };
  /** Token expiration */
  expiresAt: Timestamp;
  /** Timestamp when token was created */
  createdAt: Timestamp;
  /** Timestamp when token was last used */
  lastUsedAt?: Timestamp;
  /** Whether token has been revoked */
  isRevoked: boolean;
  /** Timestamp when token was revoked */
  revokedAt?: Timestamp;
}

// ============================================================================
// PRESENCE MODEL
// ============================================================================

export enum PresenceStatus {
  ONLINE = 'online',
  IDLE = 'idle',
  BUSY = 'busy',
  DO_NOT_DISTURB = 'dnd',
  OFFLINE = 'offline'
}

/** Presence status string literal type */
export type PresenceStatusValue = 'online' | 'idle' | 'busy' | 'dnd' | 'offline';

export interface PresenceActivity {
  /** Type of activity */
  type: 'working' | 'waiting' | 'processing' | 'custom';
  /** Activity description */
  description?: string;
  /** Task or thread being worked on */
  contextId?: UUID;
  /** Started timestamp */
  startedAt: Timestamp;
}

export interface Presence {
  /** Agent ID */
  agentId: UUID;
  /** Project ID */
  projectId: UUID;
  /** Current status */
  status: PresenceStatusValue;
  /** Manual status message */
  statusMessage?: string;
  /** Current activity */
  activity?: PresenceActivity;
  /** Last heartbeat received */
  lastHeartbeat: Timestamp;
  /** Channels agent is actively monitoring */
  activeChannels: UUID[];
  /** Whether agent is currently typing */
  isTyping: boolean;
  /** Channel where agent is typing */
  typingInChannel?: UUID;
  /** Client connection metadata */
  connection: {
    /** Connection ID */
    connectionId: UUID;
    /** Client type */
    clientType: 'cli' | 'web' | 'api' | 'bridge';
    /** Client version */
    clientVersion: string;
    /** Connected timestamp */
    connectedAt: Timestamp;
    /** IP address (for audit) */
    ipAddress?: string;
  };
}

// ============================================================================
// PROJECT MODEL
// ============================================================================

export interface Project {
  /** Unique project identifier */
  id: UUID;
  /** Project name (used in scoped identifiers) */
  name: string;
  /** Human-readable display name */
  displayName: string;
  /** Project description */
  description?: string;
  /** Project owner agent ID */
  ownerId: UUID;
  /** Project-wide settings */
  settings: {
    /** Allow cross-project messaging */
    allowBridge: boolean;
    /** Default message retention days */
    defaultRetentionDays?: number;
    /** Require message signing */
    requireSignatures: boolean;
    /** Maximum agents allowed */
    maxAgents: number;
    /** Maximum channels allowed */
    maxChannels: number;
  };
  /** Timestamp when project was created */
  createdAt: Timestamp;
}
