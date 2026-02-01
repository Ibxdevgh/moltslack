/**
 * Error Response Schema Unit Tests
 * Tests for error codes, factory functions, and error structures
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  ErrorCode,
  createValidationError,
  createPermissionError,
  createRateLimitError,
  createNotFoundError,
  createConflictError,
  createInternalError,
  ErrorExamples,
  type ErrorResponse,
  type ValidationFieldError,
} from './errors.js';

describe('ErrorCode enum', () => {
  describe('Authentication errors (401)', () => {
    it('should have authentication error codes', () => {
      expect(ErrorCode.UNAUTHORIZED).toBe('UNAUTHORIZED');
      expect(ErrorCode.INVALID_TOKEN).toBe('INVALID_TOKEN');
      expect(ErrorCode.TOKEN_EXPIRED).toBe('TOKEN_EXPIRED');
      expect(ErrorCode.SIGNATURE_INVALID).toBe('SIGNATURE_INVALID');
      expect(ErrorCode.SIGNATURE_MISSING).toBe('SIGNATURE_MISSING');
    });
  });

  describe('Authorization errors (403)', () => {
    it('should have authorization error codes', () => {
      expect(ErrorCode.FORBIDDEN).toBe('FORBIDDEN');
      expect(ErrorCode.INSUFFICIENT_PERMISSIONS).toBe('INSUFFICIENT_PERMISSIONS');
      expect(ErrorCode.RATE_LIMITED).toBe('RATE_LIMITED');
      expect(ErrorCode.QUOTA_EXCEEDED).toBe('QUOTA_EXCEEDED');
      expect(ErrorCode.CAPABILITY_DISABLED).toBe('CAPABILITY_DISABLED');
    });
  });

  describe('Not found errors (404)', () => {
    it('should have not found error codes', () => {
      expect(ErrorCode.NOT_FOUND).toBe('NOT_FOUND');
      expect(ErrorCode.AGENT_NOT_FOUND).toBe('AGENT_NOT_FOUND');
      expect(ErrorCode.CHANNEL_NOT_FOUND).toBe('CHANNEL_NOT_FOUND');
      expect(ErrorCode.MESSAGE_NOT_FOUND).toBe('MESSAGE_NOT_FOUND');
      expect(ErrorCode.PROJECT_NOT_FOUND).toBe('PROJECT_NOT_FOUND');
      expect(ErrorCode.TASK_NOT_FOUND).toBe('TASK_NOT_FOUND');
    });
  });

  describe('Validation errors (400)', () => {
    it('should have validation error codes', () => {
      expect(ErrorCode.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
      expect(ErrorCode.INVALID_REQUEST).toBe('INVALID_REQUEST');
      expect(ErrorCode.INVALID_PARAMETER).toBe('INVALID_PARAMETER');
      expect(ErrorCode.MISSING_REQUIRED_FIELD).toBe('MISSING_REQUIRED_FIELD');
      expect(ErrorCode.INVALID_FORMAT).toBe('INVALID_FORMAT');
      expect(ErrorCode.PAYLOAD_TOO_LARGE).toBe('PAYLOAD_TOO_LARGE');
    });
  });

  describe('Conflict errors (409)', () => {
    it('should have conflict error codes', () => {
      expect(ErrorCode.ALREADY_EXISTS).toBe('ALREADY_EXISTS');
      expect(ErrorCode.CONFLICT).toBe('CONFLICT');
      expect(ErrorCode.AGENT_ALREADY_EXISTS).toBe('AGENT_ALREADY_EXISTS');
      expect(ErrorCode.CHANNEL_ALREADY_EXISTS).toBe('CHANNEL_ALREADY_EXISTS');
      expect(ErrorCode.DUPLICATE_MESSAGE).toBe('DUPLICATE_MESSAGE');
    });
  });

  describe('Business logic errors (422)', () => {
    it('should have business logic error codes', () => {
      expect(ErrorCode.UNPROCESSABLE_ENTITY).toBe('UNPROCESSABLE_ENTITY');
      expect(ErrorCode.AGENT_OFFLINE).toBe('AGENT_OFFLINE');
      expect(ErrorCode.CHANNEL_ARCHIVED).toBe('CHANNEL_ARCHIVED');
      expect(ErrorCode.TASK_ALREADY_ASSIGNED).toBe('TASK_ALREADY_ASSIGNED');
      expect(ErrorCode.TASK_ALREADY_COMPLETED).toBe('TASK_ALREADY_COMPLETED');
      expect(ErrorCode.CANNOT_SELF_ASSIGN).toBe('CANNOT_SELF_ASSIGN');
    });
  });

  describe('Server errors (500)', () => {
    it('should have server error codes', () => {
      expect(ErrorCode.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
      expect(ErrorCode.SERVICE_UNAVAILABLE).toBe('SERVICE_UNAVAILABLE');
      expect(ErrorCode.DATABASE_ERROR).toBe('DATABASE_ERROR');
      expect(ErrorCode.DELIVERY_FAILED).toBe('DELIVERY_FAILED');
      expect(ErrorCode.TIMEOUT).toBe('TIMEOUT');
    });
  });
});

describe('createValidationError', () => {
  it('should create a validation error response', () => {
    const errors: ValidationFieldError[] = [
      { field: 'name', message: 'Name is required', code: 'REQUIRED' },
    ];
    const response = createValidationError(errors);

    expect(response.success).toBe(false);
    expect(response.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(response.error.status).toBe(400);
    expect(response.error.retryable).toBe(false);
  });

  it('should include all validation errors in details', () => {
    const errors: ValidationFieldError[] = [
      { field: 'name', message: 'Name is required', code: 'REQUIRED' },
      { field: 'email', message: 'Invalid email format', code: 'INVALID_FORMAT', value: 'bad-email' },
    ];
    const response = createValidationError(errors);

    expect(response.error.details).toBeDefined();
    expect(response.error.details?.type).toBe('validation');
    if (response.error.details?.type === 'validation') {
      expect(response.error.details.errors).toHaveLength(2);
      expect(response.error.details.errors[0].field).toBe('name');
      expect(response.error.details.errors[1].value).toBe('bad-email');
    }
  });

  it('should include error count in message', () => {
    const errors: ValidationFieldError[] = [
      { field: 'a', message: 'Error 1', code: 'E1' },
      { field: 'b', message: 'Error 2', code: 'E2' },
      { field: 'c', message: 'Error 3', code: 'E3' },
    ];
    const response = createValidationError(errors);

    expect(response.error.message).toBe('Validation failed: 3 error(s)');
  });

  it('should handle empty errors array', () => {
    const response = createValidationError([]);

    expect(response.success).toBe(false);
    expect(response.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(response.error.message).toBe('Validation failed: 0 error(s)');
    if (response.error.details?.type === 'validation') {
      expect(response.error.details.errors).toHaveLength(0);
    }
  });

  it('should include metadata with timestamp', () => {
    const response = createValidationError([]);
    expect(response.metadata).toBeDefined();
    expect(response.metadata.timestamp).toBeDefined();
    expect(response.metadata.processingTimeMs).toBe(0);
  });
});

describe('createPermissionError', () => {
  it('should create a permission error response', () => {
    const response = createPermissionError(
      'channel:write',
      'channel',
      '550e8400-e29b-41d4-a716-446655440000',
      ['channel:write:#general']
    );

    expect(response.success).toBe(false);
    expect(response.error.code).toBe(ErrorCode.FORBIDDEN);
    expect(response.error.status).toBe(403);
    expect(response.error.retryable).toBe(false);
  });

  it('should include permission details', () => {
    const response = createPermissionError(
      'agent:spawn',
      'agent',
      '550e8400-e29b-41d4-a716-446655440000',
      ['agent:spawn', 'agent:release']
    );

    expect(response.error.details?.type).toBe('permission');
    if (response.error.details?.type === 'permission') {
      expect(response.error.details.action).toBe('agent:spawn');
      expect(response.error.details.resourceType).toBe('agent');
      expect(response.error.details.resourceId).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(response.error.details.requiredScopes).toEqual(['agent:spawn', 'agent:release']);
    }
  });

  it('should format message with action and resource type', () => {
    const response = createPermissionError(
      'task:delete',
      'task',
      '550e8400-e29b-41d4-a716-446655440000',
      []
    );

    expect(response.error.message).toBe('Permission denied: task:delete on task');
  });
});

describe('createRateLimitError', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-31T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create a rate limit error response', () => {
    const response = createRateLimitError(
      'messages',
      60,
      60,
      61,
      '2026-01-31T12:01:00Z'
    );

    expect(response.success).toBe(false);
    expect(response.error.code).toBe(ErrorCode.RATE_LIMITED);
    expect(response.error.status).toBe(429);
    expect(response.error.retryable).toBe(true);
  });

  it('should include rate limit details', () => {
    const response = createRateLimitError(
      'spawns',
      10,
      3600,
      11,
      '2026-01-31T13:00:00Z'
    );

    expect(response.error.details?.type).toBe('rate_limit');
    if (response.error.details?.type === 'rate_limit') {
      expect(response.error.details.limit).toBe(10);
      expect(response.error.details.windowSeconds).toBe(3600);
      expect(response.error.details.currentUsage).toBe(11);
      expect(response.error.details.resource).toBe('spawns');
    }
  });

  it('should calculate retryAfterSeconds from resetsAt', () => {
    const response = createRateLimitError(
      'messages',
      60,
      60,
      61,
      '2026-01-31T12:01:00Z' // 60 seconds from now
    );

    expect(response.error.retryAfterSeconds).toBe(60);
  });

  it('should format message with resource name', () => {
    const response = createRateLimitError(
      'api-calls',
      100,
      60,
      101,
      '2026-01-31T12:01:00Z'
    );

    expect(response.error.message).toBe('Rate limit exceeded for api-calls');
  });

  it('should handle resetsAt in the past (negative retryAfterSeconds)', () => {
    // resetsAt is 30 seconds in the past
    const response = createRateLimitError(
      'messages',
      60,
      60,
      61,
      '2026-01-31T11:59:30Z' // 30 seconds before current time
    );

    // retryAfterSeconds should be negative or 0 when already past
    expect(response.error.retryAfterSeconds).toBeLessThanOrEqual(0);
  });
});

describe('createNotFoundError', () => {
  it('should create a not found error response', () => {
    const response = createNotFoundError('agent', 'TestAgent', 'name');

    expect(response.success).toBe(false);
    expect(response.error.code).toBe(ErrorCode.AGENT_NOT_FOUND);
    expect(response.error.status).toBe(404);
    expect(response.error.retryable).toBe(false);
  });

  it('should use resource-specific error codes', () => {
    expect(createNotFoundError('agent', 'id').error.code).toBe(ErrorCode.AGENT_NOT_FOUND);
    expect(createNotFoundError('channel', 'id').error.code).toBe(ErrorCode.CHANNEL_NOT_FOUND);
    expect(createNotFoundError('message', 'id').error.code).toBe(ErrorCode.MESSAGE_NOT_FOUND);
    expect(createNotFoundError('task', 'id').error.code).toBe(ErrorCode.TASK_NOT_FOUND);
    expect(createNotFoundError('project', 'id').error.code).toBe(ErrorCode.PROJECT_NOT_FOUND);
  });

  it('should fall back to NOT_FOUND for unknown resource type', () => {
    // Type assertion needed since we're testing an edge case with unknown type
    const response = createNotFoundError('unknown' as any, 'some-id');

    expect(response.error.code).toBe(ErrorCode.NOT_FOUND);
    expect(response.error.status).toBe(404);
  });

  it('should include not found details', () => {
    const response = createNotFoundError('channel', '#general', 'name');

    expect(response.error.details?.type).toBe('not_found');
    if (response.error.details?.type === 'not_found') {
      expect(response.error.details.resourceType).toBe('channel');
      expect(response.error.details.identifier).toBe('#general');
      expect(response.error.details.identifierType).toBe('name');
    }
  });

  it('should default to id identifier type', () => {
    const response = createNotFoundError('agent', '550e8400-e29b-41d4-a716-446655440000');

    if (response.error.details?.type === 'not_found') {
      expect(response.error.details.identifierType).toBe('id');
    }
  });

  it('should format message with resource type and identifier', () => {
    const response = createNotFoundError('task', 'task-123', 'id');

    expect(response.error.message).toBe('task not found: task-123');
  });
});

describe('createConflictError', () => {
  it('should create a conflict error response', () => {
    const response = createConflictError(
      'channel',
      'duplicate',
      'Channel #general already exists',
      '550e8400-e29b-41d4-a716-446655440000'
    );

    expect(response.success).toBe(false);
    expect(response.error.code).toBe(ErrorCode.CHANNEL_ALREADY_EXISTS);
    expect(response.error.status).toBe(409);
    expect(response.error.retryable).toBe(false);
  });

  it('should use resource-specific error codes', () => {
    expect(createConflictError('agent', 'duplicate', 'desc').error.code).toBe(ErrorCode.AGENT_ALREADY_EXISTS);
    expect(createConflictError('channel', 'duplicate', 'desc').error.code).toBe(ErrorCode.CHANNEL_ALREADY_EXISTS);
    expect(createConflictError('message', 'duplicate', 'desc').error.code).toBe(ErrorCode.DUPLICATE_MESSAGE);
    expect(createConflictError('task', 'duplicate', 'desc').error.code).toBe(ErrorCode.CONFLICT);
  });

  it('should include conflict details', () => {
    const response = createConflictError(
      'agent',
      'duplicate',
      'Agent with name already exists',
      '550e8400-e29b-41d4-a716-446655440000'
    );

    expect(response.error.details?.type).toBe('conflict');
    if (response.error.details?.type === 'conflict') {
      expect(response.error.details.conflictType).toBe('duplicate');
      expect(response.error.details.resourceType).toBe('agent');
      expect(response.error.details.existingResourceId).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(response.error.details.description).toBe('Agent with name already exists');
    }
  });

  it('should handle conflict without existing resource ID', () => {
    const response = createConflictError(
      'task',
      'state',
      'Task is in invalid state'
    );

    if (response.error.details?.type === 'conflict') {
      expect(response.error.details.existingResourceId).toBeUndefined();
    }
  });

  it('should support different conflict types', () => {
    const duplicateResponse = createConflictError('agent', 'duplicate', 'desc');
    const stateResponse = createConflictError('task', 'state', 'desc');
    const concurrentResponse = createConflictError('message', 'concurrent_modification', 'desc');

    if (duplicateResponse.error.details?.type === 'conflict') {
      expect(duplicateResponse.error.details.conflictType).toBe('duplicate');
    }
    if (stateResponse.error.details?.type === 'conflict') {
      expect(stateResponse.error.details.conflictType).toBe('state');
    }
    if (concurrentResponse.error.details?.type === 'conflict') {
      expect(concurrentResponse.error.details.conflictType).toBe('concurrent_modification');
    }
  });
});

describe('createInternalError', () => {
  it('should create an internal error response', () => {
    const response = createInternalError();

    expect(response.success).toBe(false);
    expect(response.error.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(response.error.status).toBe(500);
    expect(response.error.retryable).toBe(true);
    expect(response.error.retryAfterSeconds).toBe(5);
  });

  it('should use default message when not provided', () => {
    const response = createInternalError();

    expect(response.error.message).toBe('An internal error occurred');
  });

  it('should use custom message when provided', () => {
    const response = createInternalError('Database connection failed');

    expect(response.error.message).toBe('Database connection failed');
  });

  it('should include metadata', () => {
    const response = createInternalError();

    expect(response.metadata).toBeDefined();
    expect(response.metadata.timestamp).toBeDefined();
  });
});

describe('ErrorExamples', () => {
  it('should have valid validationError example', () => {
    expect(ErrorExamples.validationError).toBeDefined();
    expect(ErrorExamples.validationError.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(ErrorExamples.validationError.error.details?.type).toBe('validation');
  });

  it('should have valid permissionError example', () => {
    expect(ErrorExamples.permissionError).toBeDefined();
    expect(ErrorExamples.permissionError.error.code).toBe(ErrorCode.FORBIDDEN);
    expect(ErrorExamples.permissionError.error.details?.type).toBe('permission');
  });

  it('should have valid rateLimitError example', () => {
    expect(ErrorExamples.rateLimitError).toBeDefined();
    expect(ErrorExamples.rateLimitError.error.code).toBe(ErrorCode.RATE_LIMITED);
    expect(ErrorExamples.rateLimitError.error.details?.type).toBe('rate_limit');
  });

  it('should have valid notFoundError example', () => {
    expect(ErrorExamples.notFoundError).toBeDefined();
    expect(ErrorExamples.notFoundError.error.code).toBe(ErrorCode.AGENT_NOT_FOUND);
    expect(ErrorExamples.notFoundError.error.details?.type).toBe('not_found');
  });

  it('should have valid conflictError example', () => {
    expect(ErrorExamples.conflictError).toBeDefined();
    expect(ErrorExamples.conflictError.error.code).toBe(ErrorCode.CHANNEL_ALREADY_EXISTS);
    expect(ErrorExamples.conflictError.error.details?.type).toBe('conflict');
  });
});
