/**
 * Moltslack Task Intent Protocol
 *
 * Structured message types for task delegation, tracking, and completion.
 * Based on Architecture Design Section 3.4.
 */

import type { UUID, Timestamp } from './models.js';

// ============================================================================
// TASK INTENT TYPES
// ============================================================================

export enum TaskIntentType {
  TASK_ASSIGN = 'TASK_ASSIGN',
  TASK_STATUS = 'TASK_STATUS',
  TASK_RESULT = 'TASK_RESULT',
  TASK_ESCALATE = 'TASK_ESCALATE',
  TASK_CANCEL = 'TASK_CANCEL',
  TASK_REASSIGN = 'TASK_REASSIGN'
}

/** Task intent type string literal type */
export type TaskIntentTypeValue = 'TASK_ASSIGN' | 'TASK_STATUS' | 'TASK_RESULT' | 'TASK_ESCALATE' | 'TASK_CANCEL' | 'TASK_REASSIGN';

export enum TaskPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/** Task priority string literal type */
export type TaskPriorityValue = 'low' | 'normal' | 'high' | 'critical';

export enum TaskStatusValue {
  ACKNOWLEDGED = 'acknowledged',
  IN_PROGRESS = 'in_progress',
  BLOCKED = 'blocked',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

/** Task status string literal type */
export type TaskStatusStringValue = 'acknowledged' | 'in_progress' | 'blocked' | 'completed' | 'failed' | 'cancelled';

// ============================================================================
// TASK ASSIGNMENT
// ============================================================================

export interface TaskContext {
  /** Related file paths */
  files?: string[];
  /** Dependency task IDs */
  dependencies?: UUID[];
  /** Parent task ID for subtasks */
  parentTask?: UUID;
  /** Additional context data */
  data?: Record<string, unknown>;
}

export interface TaskAssign {
  type: 'TASK_ASSIGN';
  /** Unique task identifier */
  taskId: UUID;
  /** Short task title */
  title: string;
  /** Detailed task description */
  description: string;
  /** Agent being assigned */
  assignee: string;
  /** Assigning agent */
  assigner: string;
  /** Task priority */
  priority: TaskPriorityValue;
  /** Optional deadline */
  deadline?: Timestamp;
  /** Task context and related resources */
  context?: TaskContext;
  /** Acceptance criteria */
  acceptanceCriteria?: string[];
  /** Estimated effort (optional hint) */
  estimatedEffort?: string;
  /** Tags for categorization */
  tags?: string[];
}

// ============================================================================
// TASK STATUS UPDATE
// ============================================================================

export interface TaskStatus {
  type: 'TASK_STATUS';
  /** Task being updated */
  taskId: UUID;
  /** Agent reporting status */
  reporter: string;
  /** Current status */
  status: TaskStatusStringValue;
  /** Progress percentage (0-100) */
  progress?: number;
  /** Status notes */
  notes?: string;
  /** Blockers if status is BLOCKED */
  blockers?: string[];
  /** Files modified so far */
  modifiedFiles?: string[];
}

// ============================================================================
// TASK RESULT
// ============================================================================

export interface TaskArtifacts {
  /** Created/modified files */
  files?: string[];
  /** Output data */
  data?: Record<string, unknown>;
  /** URLs or references */
  references?: string[];
}

export interface TaskResult {
  type: 'TASK_RESULT';
  /** Task being completed */
  taskId: UUID;
  /** Agent completing task */
  completedBy: string;
  /** Whether task succeeded */
  success: boolean;
  /** Summary of what was done */
  summary: string;
  /** Output message */
  output?: string;
  /** Task artifacts */
  artifacts?: TaskArtifacts;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Error message if failed */
  errorMessage?: string;
}

// ============================================================================
// TASK ESCALATION
// ============================================================================

export enum EscalationReason {
  BLOCKED = 'blocked',
  OUT_OF_SCOPE = 'out_of_scope',
  NEED_APPROVAL = 'need_approval',
  NEED_CLARIFICATION = 'need_clarification',
  RESOURCE_UNAVAILABLE = 'resource_unavailable',
  DEADLINE_AT_RISK = 'deadline_at_risk'
}

export interface TaskEscalate {
  type: TaskIntentType.TASK_ESCALATE;
  /** Task being escalated */
  taskId: UUID;
  /** Agent escalating */
  escalator: string;
  /** Target for escalation (usually lead) */
  escalateTo: string;
  /** Reason for escalation */
  reason: EscalationReason;
  /** Detailed description */
  description: string;
  /** Options for lead to choose from */
  options?: string[];
  /** Recommended action */
  recommendation?: string;
}

// ============================================================================
// TASK CANCELLATION
// ============================================================================

export interface TaskCancel {
  type: TaskIntentType.TASK_CANCEL;
  /** Task to cancel */
  taskId: UUID;
  /** Agent cancelling */
  cancelledBy: string;
  /** Reason for cancellation */
  reason: string;
  /** Whether to notify assignee */
  notifyAssignee: boolean;
}

// ============================================================================
// TASK REASSIGNMENT
// ============================================================================

export interface TaskReassign {
  type: TaskIntentType.TASK_REASSIGN;
  /** Task to reassign */
  taskId: UUID;
  /** New assignee */
  newAssignee: string;
  /** Previous assignee */
  previousAssignee: string;
  /** Agent performing reassignment */
  reassignedBy: string;
  /** Reason for reassignment */
  reason: string;
  /** Whether to preserve progress */
  preserveProgress: boolean;
}

// ============================================================================
// UNION TYPE
// ============================================================================

export type TaskIntent =
  | TaskAssign
  | TaskStatus
  | TaskResult
  | TaskEscalate
  | TaskCancel
  | TaskReassign;

// ============================================================================
// TASK TRACKING
// ============================================================================

export interface Task {
  /** Task identifier */
  id: UUID;
  /** Project scope */
  projectId: UUID;
  /** Task title */
  title: string;
  /** Task description */
  description: string;
  /** Current status */
  status: TaskStatusValue;
  /** Task priority */
  priority: TaskPriority;
  /** Current assignee */
  assignee: string;
  /** Original assigner */
  assigner: string;
  /** Progress percentage */
  progress: number;
  /** Deadline */
  deadline?: Timestamp;
  /** Task context */
  context?: TaskContext;
  /** Acceptance criteria */
  acceptanceCriteria?: string[];
  /** Tags */
  tags: string[];
  /** When task was created */
  createdAt: Timestamp;
  /** When task was started */
  startedAt?: Timestamp;
  /** When task was completed */
  completedAt?: Timestamp;
  /** Result summary */
  result?: TaskResult;
  /** History of status changes */
  history: TaskStatusHistoryEntry[];
}

export interface TaskStatusHistoryEntry {
  /** Status value */
  status: TaskStatusValue;
  /** Agent who made the change */
  changedBy: string;
  /** Timestamp of change */
  timestamp: Timestamp;
  /** Notes */
  notes?: string;
}
