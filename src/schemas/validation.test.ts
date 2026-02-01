/**
 * Validation Schema Unit Tests
 * Tests for validation constants, patterns, and functions
 */

import { describe, it, expect } from 'vitest';
import {
  ValidationLimits,
  ValidationPatterns,
  validateUUID,
  validateTimestamp,
  validateName,
  validateChannelName,
  validatePermissionScope,
  TestData,
  TestScenarios,
} from './validation.js';

describe('ValidationLimits', () => {
  it('should have string length limits defined', () => {
    expect(ValidationLimits.NAME_MIN_LENGTH).toBe(1);
    expect(ValidationLimits.NAME_MAX_LENGTH).toBe(64);
    expect(ValidationLimits.DISPLAY_NAME_MAX_LENGTH).toBe(128);
    expect(ValidationLimits.DESCRIPTION_MAX_LENGTH).toBe(2048);
    expect(ValidationLimits.MESSAGE_TEXT_MAX_LENGTH).toBe(32000);
    expect(ValidationLimits.STATUS_MESSAGE_MAX_LENGTH).toBe(256);
  });

  it('should have array limits defined', () => {
    expect(ValidationLimits.MAX_CAPABILITIES).toBe(50);
    expect(ValidationLimits.MAX_ACCESS_RULES).toBe(100);
    expect(ValidationLimits.MAX_MENTIONS).toBe(50);
    expect(ValidationLimits.MAX_ATTACHMENTS).toBe(10);
    expect(ValidationLimits.MAX_TAGS).toBe(20);
    expect(ValidationLimits.MAX_ACTIVE_CHANNELS).toBe(100);
  });

  it('should have token/time limits defined', () => {
    expect(ValidationLimits.TOKEN_MIN_LIFETIME_SECONDS).toBe(60);
    expect(ValidationLimits.TOKEN_MAX_LIFETIME_SECONDS).toBe(30 * 24 * 60 * 60);
    expect(ValidationLimits.HEARTBEAT_INTERVAL_SECONDS).toBe(30);
    expect(ValidationLimits.IDLE_TIMEOUT_SECONDS).toBe(300);
    expect(ValidationLimits.AWAY_TIMEOUT_SECONDS).toBe(1800);
  });

  it('should have size limits defined', () => {
    expect(ValidationLimits.MAX_ATTACHMENT_SIZE_BYTES).toBe(100 * 1024 * 1024);
    expect(ValidationLimits.MAX_MESSAGE_PAYLOAD_BYTES).toBe(1024 * 1024);
  });

  it('should have rate limits defined', () => {
    expect(ValidationLimits.MAX_MESSAGES_PER_MINUTE).toBe(60);
    expect(ValidationLimits.MAX_SPAWNS_PER_HOUR).toBe(10);
  });
});

describe('ValidationPatterns', () => {
  describe('UUID pattern', () => {
    it('should match valid UUIDs', () => {
      expect(ValidationPatterns.UUID.test('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      expect(ValidationPatterns.UUID.test('123e4567-e89b-42d3-a456-426614174000')).toBe(true);
    });

    it('should reject invalid UUIDs', () => {
      expect(ValidationPatterns.UUID.test('not-a-uuid')).toBe(false);
      expect(ValidationPatterns.UUID.test('550e8400-e29b-11d4-a716-446655440000')).toBe(false); // v1, not v4
      expect(ValidationPatterns.UUID.test('550e8400-e29b-41d4-c716-446655440000')).toBe(false); // wrong variant
      expect(ValidationPatterns.UUID.test('')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(ValidationPatterns.UUID.test('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
      expect(ValidationPatterns.UUID.test('550e8400-E29B-41d4-A716-446655440000')).toBe(true);
    });
  });

  describe('ULID pattern', () => {
    it('should match valid ULIDs', () => {
      expect(ValidationPatterns.ULID.test('01ARZ3NDEKTSV4RRFFQ69G5FAV')).toBe(true);
    });

    it('should reject invalid ULIDs', () => {
      expect(ValidationPatterns.ULID.test('not-a-ulid')).toBe(false);
      expect(ValidationPatterns.ULID.test('01ARZ3NDEKTSV4RRFFQ69G5FA')).toBe(false); // too short
      expect(ValidationPatterns.ULID.test('')).toBe(false);
    });
  });

  describe('TIMESTAMP pattern', () => {
    it('should match valid ISO 8601 timestamps', () => {
      expect(ValidationPatterns.TIMESTAMP.test('2026-01-31T12:00:00Z')).toBe(true);
      expect(ValidationPatterns.TIMESTAMP.test('2026-01-31T12:00:00.000Z')).toBe(true);
    });

    it('should reject invalid timestamps', () => {
      expect(ValidationPatterns.TIMESTAMP.test('2026-01-31')).toBe(false);
      expect(ValidationPatterns.TIMESTAMP.test('2026-01-31T12:00:00')).toBe(false); // missing Z
      expect(ValidationPatterns.TIMESTAMP.test('not-a-timestamp')).toBe(false);
    });
  });

  describe('NAME pattern', () => {
    it('should match valid names', () => {
      expect(ValidationPatterns.NAME.test('Agent')).toBe(true);
      expect(ValidationPatterns.NAME.test('MyAgent123')).toBe(true);
      expect(ValidationPatterns.NAME.test('my-agent')).toBe(true);
      expect(ValidationPatterns.NAME.test('my_agent')).toBe(true);
    });

    it('should reject invalid names', () => {
      expect(ValidationPatterns.NAME.test('123Agent')).toBe(false); // starts with number
      expect(ValidationPatterns.NAME.test('-agent')).toBe(false); // starts with hyphen
      expect(ValidationPatterns.NAME.test('agent@name')).toBe(false); // special char
      expect(ValidationPatterns.NAME.test('')).toBe(false);
    });
  });

  describe('CHANNEL_NAME pattern', () => {
    it('should match valid channel names', () => {
      expect(ValidationPatterns.CHANNEL_NAME.test('#general')).toBe(true);
      expect(ValidationPatterns.CHANNEL_NAME.test('#my-channel')).toBe(true);
      expect(ValidationPatterns.CHANNEL_NAME.test('#channel_123')).toBe(true);
    });

    it('should reject invalid channel names', () => {
      expect(ValidationPatterns.CHANNEL_NAME.test('general')).toBe(false); // missing #
      expect(ValidationPatterns.CHANNEL_NAME.test('#123channel')).toBe(false); // starts with number
      expect(ValidationPatterns.CHANNEL_NAME.test('#')).toBe(false); // just hash
    });
  });

  describe('PERMISSION_SCOPE pattern', () => {
    it('should match valid permission scopes', () => {
      expect(ValidationPatterns.PERMISSION_SCOPE.test('channel:read')).toBe(true);
      expect(ValidationPatterns.PERMISSION_SCOPE.test('agent:spawn')).toBe(true);
      expect(ValidationPatterns.PERMISSION_SCOPE.test('task:assign:#project-1')).toBe(true);
      expect(ValidationPatterns.PERMISSION_SCOPE.test('file:write:/src/*')).toBe(true);
    });

    it('should reject invalid permission scopes', () => {
      expect(ValidationPatterns.PERMISSION_SCOPE.test('invalid:scope')).toBe(false);
      expect(ValidationPatterns.PERMISSION_SCOPE.test('channel')).toBe(false);
      expect(ValidationPatterns.PERMISSION_SCOPE.test('read:channel')).toBe(false);
    });
  });

  describe('SIGNATURE pattern', () => {
    it('should match valid base64 signatures', () => {
      const validSig = 'a'.repeat(86) + '==';
      expect(ValidationPatterns.SIGNATURE.test(validSig)).toBe(true);
    });

    it('should reject invalid signatures', () => {
      expect(ValidationPatterns.SIGNATURE.test('short')).toBe(false);
      expect(ValidationPatterns.SIGNATURE.test('a'.repeat(86))).toBe(false); // missing ==
    });
  });

  describe('HASH pattern', () => {
    it('should match valid SHA-256 hashes', () => {
      expect(ValidationPatterns.HASH.test('a'.repeat(64))).toBe(true);
      expect(ValidationPatterns.HASH.test('0123456789abcdef'.repeat(4))).toBe(true);
    });

    it('should reject invalid hashes', () => {
      expect(ValidationPatterns.HASH.test('a'.repeat(63))).toBe(false); // too short
      expect(ValidationPatterns.HASH.test('g'.repeat(64))).toBe(false); // invalid char
    });
  });

  describe('FILE_GLOB pattern', () => {
    it('should match valid file glob patterns', () => {
      expect(ValidationPatterns.FILE_GLOB.test('/src/schemas')).toBe(true);
      expect(ValidationPatterns.FILE_GLOB.test('/src/schemas/**')).toBe(true);
      expect(ValidationPatterns.FILE_GLOB.test('/path/to/file.ts')).toBe(true);
      expect(ValidationPatterns.FILE_GLOB.test('/a/b-c/d_e/f.js')).toBe(true);
    });

    it('should reject invalid file glob patterns', () => {
      expect(ValidationPatterns.FILE_GLOB.test('src/schemas')).toBe(false); // missing leading /
      expect(ValidationPatterns.FILE_GLOB.test('/path with spaces')).toBe(false);
      expect(ValidationPatterns.FILE_GLOB.test('')).toBe(false);
    });
  });

  describe('PUBLIC_KEY pattern', () => {
    it('should match valid PEM public keys', () => {
      const validKey = '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAtest...\n-----END PUBLIC KEY-----';
      expect(ValidationPatterns.PUBLIC_KEY.test(validKey)).toBe(true);
    });

    it('should reject invalid public keys', () => {
      expect(ValidationPatterns.PUBLIC_KEY.test('not-a-key')).toBe(false);
      expect(ValidationPatterns.PUBLIC_KEY.test('-----BEGIN PUBLIC KEY-----')).toBe(false); // incomplete
      expect(ValidationPatterns.PUBLIC_KEY.test('')).toBe(false);
    });
  });
});

describe('validateUUID', () => {
  it('should return null for valid UUID', () => {
    const result = validateUUID('550e8400-e29b-41d4-a716-446655440000', 'id');
    expect(result).toBeNull();
  });

  it('should return error for invalid UUID', () => {
    const result = validateUUID('not-a-uuid', 'id');
    expect(result).not.toBeNull();
    expect(result?.code).toBe('INVALID_UUID');
    expect(result?.field).toBe('id');
  });

  it('should include the invalid value in error', () => {
    const result = validateUUID('bad-uuid', 'agentId');
    expect(result?.value).toBe('bad-uuid');
  });
});

describe('validateTimestamp', () => {
  it('should return null for valid timestamp', () => {
    const result = validateTimestamp('2026-01-31T12:00:00Z', 'createdAt');
    expect(result).toBeNull();
  });

  it('should return null for timestamp with milliseconds', () => {
    const result = validateTimestamp('2026-01-31T12:00:00.000Z', 'createdAt');
    expect(result).toBeNull();
  });

  it('should return error for invalid format', () => {
    const result = validateTimestamp('2026-01-31', 'createdAt');
    expect(result).not.toBeNull();
    expect(result?.code).toBe('INVALID_TIMESTAMP');
  });

  it('should return error for invalid date value', () => {
    const result = validateTimestamp('2026-13-45T25:99:99Z', 'createdAt');
    expect(result).not.toBeNull();
    // Pattern matches but Date parsing fails (invalid month 13, day 45, etc.)
    expect(result?.code).toBe('INVALID_DATE');
  });
});

describe('validateName', () => {
  it('should return null for valid name', () => {
    expect(validateName('ValidAgent', 'name')).toBeNull();
    expect(validateName('My-Agent_123', 'name')).toBeNull();
  });

  it('should return error for empty name', () => {
    const result = validateName('', 'name');
    expect(result).not.toBeNull();
    expect(result?.code).toBe('NAME_TOO_SHORT');
  });

  it('should return error for name too long', () => {
    const longName = 'a'.repeat(65);
    const result = validateName(longName, 'name');
    expect(result).not.toBeNull();
    expect(result?.code).toBe('NAME_TOO_LONG');
  });

  it('should accept name at exactly 64 characters (boundary)', () => {
    // 64 chars: starts with letter, rest alphanumeric
    const maxLengthName = 'A' + 'b'.repeat(63);
    expect(validateName(maxLengthName, 'name')).toBeNull();
  });

  it('should return error for name starting with number', () => {
    const result = validateName('123Agent', 'name');
    expect(result).not.toBeNull();
    expect(result?.code).toBe('INVALID_NAME_FORMAT');
  });

  it('should return error for name with special characters', () => {
    const result = validateName('Agent@Name', 'name');
    expect(result).not.toBeNull();
    expect(result?.code).toBe('INVALID_NAME_FORMAT');
  });
});

describe('validateChannelName', () => {
  it('should return null for valid channel name', () => {
    expect(validateChannelName('#general', 'name')).toBeNull();
    expect(validateChannelName('#my-channel', 'name')).toBeNull();
    expect(validateChannelName('#channel_123', 'name')).toBeNull();
  });

  it('should return error for missing hash prefix', () => {
    const result = validateChannelName('general', 'name');
    expect(result).not.toBeNull();
    expect(result?.code).toBe('INVALID_CHANNEL_NAME');
  });

  it('should return error for channel starting with number after hash', () => {
    const result = validateChannelName('#123channel', 'name');
    expect(result).not.toBeNull();
    expect(result?.code).toBe('INVALID_CHANNEL_NAME');
  });
});

describe('validatePermissionScope', () => {
  it('should return null for valid permission scope', () => {
    expect(validatePermissionScope('channel:read', 'scope')).toBeNull();
    expect(validatePermissionScope('agent:spawn', 'scope')).toBeNull();
    expect(validatePermissionScope('task:assign:#project', 'scope')).toBeNull();
  });

  it('should return error for invalid scope format', () => {
    const result = validatePermissionScope('invalid:scope', 'scope');
    expect(result).not.toBeNull();
    expect(result?.code).toBe('INVALID_PERMISSION_SCOPE');
  });

  it('should return error for missing action', () => {
    const result = validatePermissionScope('channel', 'scope');
    expect(result).not.toBeNull();
    expect(result?.code).toBe('INVALID_PERMISSION_SCOPE');
  });
});

describe('TestData', () => {
  describe('agents', () => {
    it('should have valid leadAgent test data', () => {
      expect(TestData.agents.leadAgent).toBeDefined();
      expect(TestData.agents.leadAgent.id).toMatch(ValidationPatterns.UUID);
      expect(TestData.agents.leadAgent.name).toBe('ProjectLead');
      expect(TestData.agents.leadAgent.type).toBe('ai');
      expect(TestData.agents.leadAgent.status).toBe('active');
    });

    it('should have valid workerAgent test data', () => {
      expect(TestData.agents.workerAgent).toBeDefined();
      expect(TestData.agents.workerAgent.id).toMatch(ValidationPatterns.UUID);
      expect(TestData.agents.workerAgent.spawnerId).toBe(TestData.agents.leadAgent.id);
    });
  });

  describe('channels', () => {
    it('should have valid channel test data', () => {
      expect(TestData.channels.publicChannel).toBeDefined();
      expect(TestData.channels.publicChannel.name).toBe('#general');
      expect(TestData.channels.publicChannel.type).toBe('public');

      expect(TestData.channels.privateChannel).toBeDefined();
      expect(TestData.channels.privateChannel.name).toBe('#leads-only');
      expect(TestData.channels.privateChannel.type).toBe('private');
    });
  });

  describe('messages', () => {
    it('should have valid message test data', () => {
      expect(TestData.messages.textMessage).toBeDefined();
      expect(TestData.messages.textMessage.type).toBe('text');

      expect(TestData.messages.dmMessage).toBeDefined();
      expect(TestData.messages.dmMessage.targetType).toBe('agent');

      expect(TestData.messages.threadReply).toBeDefined();
      expect(TestData.messages.threadReply.type).toBe('thread_reply');
      expect(TestData.messages.threadReply.threadId).toBeDefined();
    });
  });

  describe('presence', () => {
    it('should have valid presence test data', () => {
      expect(TestData.presence.activePresence).toBeDefined();
      expect(TestData.presence.activePresence.status).toBe('online');

      expect(TestData.presence.idlePresence).toBeDefined();
      expect(TestData.presence.idlePresence.status).toBe('idle');
    });
  });

  describe('tasks', () => {
    it('should have valid task test data', () => {
      expect(TestData.tasks.taskAssign).toBeDefined();
      expect(TestData.tasks.taskAssign.type).toBe('TASK_ASSIGN');

      expect(TestData.tasks.taskStatus).toBeDefined();
      expect(TestData.tasks.taskStatus.type).toBe('TASK_STATUS');

      expect(TestData.tasks.taskResult).toBeDefined();
      expect(TestData.tasks.taskResult.type).toBe('TASK_RESULT');
    });
  });

  describe('invalid', () => {
    it('should have invalid test data for testing validation', () => {
      expect(TestData.invalid.badUUID).toBe('not-a-uuid');
      expect(TestData.invalid.badAgentName).toBe('123-starts-with-number');
      expect(TestData.invalid.emptyName).toBe('');
      expect(TestData.invalid.tooLongName.length).toBe(100);
    });
  });
});

describe('TestScenarios', () => {
  it('should have agentSpawnFlow scenario', () => {
    expect(TestScenarios.agentSpawnFlow).toBeDefined();
    expect(TestScenarios.agentSpawnFlow.steps).toHaveLength(6);
    expect(TestScenarios.agentSpawnFlow.steps[0].event).toBe('agent.spawned');
  });

  it('should have permissionDenied scenario', () => {
    expect(TestScenarios.permissionDenied).toBeDefined();
    expect(TestScenarios.permissionDenied.expectedError.code).toBe('FORBIDDEN');
  });

  it('should have presenceTimeout scenario', () => {
    expect(TestScenarios.presenceTimeout).toBeDefined();
    expect(TestScenarios.presenceTimeout.stages).toHaveLength(4);
    expect(TestScenarios.presenceTimeout.stages[0].status).toBe('online');
    expect(TestScenarios.presenceTimeout.stages[3].status).toBe('offline');
  });
});
