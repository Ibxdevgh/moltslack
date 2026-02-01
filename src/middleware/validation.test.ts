/**
 * Validation Middleware Unit Tests
 * Tests for the Express validation middleware and pre-defined schemas
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validate,
  AgentRegistrationSchema,
  ChannelCreateSchema,
  MessageSendSchema,
  PresenceUpdateSchema,
  TypingIndicatorSchema,
  PaginationSchema,
} from './validation.js';
import type { Request, Response, NextFunction } from 'express';

// Helper to create mock Express objects
function createMocks(overrides: { body?: any; params?: any; query?: any; headers?: any } = {}) {
  const req = {
    body: overrides.body || {},
    params: overrides.params || {},
    query: overrides.query || {},
    headers: overrides.headers || {},
  } as unknown as Request;

  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;

  const next = vi.fn() as NextFunction;

  return { req, res, next };
}

describe('validate middleware factory', () => {
  it('should return a middleware function', () => {
    const middleware = validate({});
    expect(typeof middleware).toBe('function');
  });

  it('should call next when no validation errors', () => {
    const middleware = validate({});
    const { req, res, next } = createMocks();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  describe('required field validation', () => {
    it('should return 400 when required field is missing', () => {
      const middleware = validate({
        body: {
          name: { required: true },
        },
      });
      const { req, res, next } = createMocks({ body: {} });

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'VALIDATION_ERROR',
          }),
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 400 when required field is empty string', () => {
      const middleware = validate({
        body: {
          name: { required: true },
        },
      });
      const { req, res, next } = createMocks({ body: { name: '' } });

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 400 when required field is null', () => {
      const middleware = validate({
        body: {
          name: { required: true },
        },
      });
      const { req, res, next } = createMocks({ body: { name: null } });

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should pass when required field is present', () => {
      const middleware = validate({
        body: {
          name: { required: true },
        },
      });
      const { req, res, next } = createMocks({ body: { name: 'TestAgent' } });

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('type validation', () => {
    it('should validate string type', () => {
      const middleware = validate({
        body: {
          name: { type: 'string' },
        },
      });

      const { req: validReq, res: validRes, next: validNext } = createMocks({ body: { name: 'test' } });
      middleware(validReq, validRes, validNext);
      expect(validNext).toHaveBeenCalled();

      const { req: invalidReq, res: invalidRes, next: invalidNext } = createMocks({ body: { name: 123 } });
      middleware(invalidReq, invalidRes, invalidNext);
      expect(invalidRes.status).toHaveBeenCalledWith(400);
    });

    it('should validate number type', () => {
      const middleware = validate({
        body: {
          count: { type: 'number' },
        },
      });

      const { req: validReq, res: validRes, next: validNext } = createMocks({ body: { count: 42 } });
      middleware(validReq, validRes, validNext);
      expect(validNext).toHaveBeenCalled();

      const { req: invalidReq, res: invalidRes, next: invalidNext } = createMocks({ body: { count: 'not-a-number' } });
      middleware(invalidReq, invalidRes, invalidNext);
      expect(invalidRes.status).toHaveBeenCalledWith(400);
    });

    it('should validate boolean type', () => {
      const middleware = validate({
        body: {
          active: { type: 'boolean' },
        },
      });

      const { req: validReq, res: validRes, next: validNext } = createMocks({ body: { active: true } });
      middleware(validReq, validRes, validNext);
      expect(validNext).toHaveBeenCalled();

      const { req: invalidReq, res: invalidRes, next: invalidNext } = createMocks({ body: { active: 'yes' } });
      middleware(invalidReq, invalidRes, invalidNext);
      expect(invalidRes.status).toHaveBeenCalledWith(400);
    });

    it('should validate object type', () => {
      const middleware = validate({
        body: {
          metadata: { type: 'object' },
        },
      });

      const { req: validReq, res: validRes, next: validNext } = createMocks({ body: { metadata: { key: 'value' } } });
      middleware(validReq, validRes, validNext);
      expect(validNext).toHaveBeenCalled();

      const { req: invalidReq, res: invalidRes, next: invalidNext } = createMocks({ body: { metadata: 'not-object' } });
      middleware(invalidReq, invalidRes, invalidNext);
      expect(invalidRes.status).toHaveBeenCalledWith(400);
    });

    it('should validate array type', () => {
      const middleware = validate({
        body: {
          items: { type: 'array' },
        },
      });

      const { req: validReq, res: validRes, next: validNext } = createMocks({ body: { items: [1, 2, 3] } });
      middleware(validReq, validRes, validNext);
      expect(validNext).toHaveBeenCalled();

      const { req: invalidReq, res: invalidRes, next: invalidNext } = createMocks({ body: { items: 'not-array' } });
      middleware(invalidReq, invalidRes, invalidNext);
      expect(invalidRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('string length validation', () => {
    it('should validate minLength', () => {
      const middleware = validate({
        body: {
          name: { type: 'string', minLength: 3 },
        },
      });

      const { req: validReq, res: validRes, next: validNext } = createMocks({ body: { name: 'test' } });
      middleware(validReq, validRes, validNext);
      expect(validNext).toHaveBeenCalled();

      const { req: invalidReq, res: invalidRes, next: invalidNext } = createMocks({ body: { name: 'ab' } });
      middleware(invalidReq, invalidRes, invalidNext);
      expect(invalidRes.status).toHaveBeenCalledWith(400);
    });

    it('should validate maxLength', () => {
      const middleware = validate({
        body: {
          name: { type: 'string', maxLength: 10 },
        },
      });

      const { req: validReq, res: validRes, next: validNext } = createMocks({ body: { name: 'short' } });
      middleware(validReq, validRes, validNext);
      expect(validNext).toHaveBeenCalled();

      const { req: invalidReq, res: invalidRes, next: invalidNext } = createMocks({ body: { name: 'this-is-way-too-long' } });
      middleware(invalidReq, invalidRes, invalidNext);
      expect(invalidRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('pattern validation', () => {
    it('should validate regex pattern', () => {
      const middleware = validate({
        body: {
          email: { type: 'string', pattern: /^[a-z]+@[a-z]+\.[a-z]+$/ },
        },
      });

      const { req: validReq, res: validRes, next: validNext } = createMocks({ body: { email: 'test@example.com' } });
      middleware(validReq, validRes, validNext);
      expect(validNext).toHaveBeenCalled();

      const { req: invalidReq, res: invalidRes, next: invalidNext } = createMocks({ body: { email: 'not-an-email' } });
      middleware(invalidReq, invalidRes, invalidNext);
      expect(invalidRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('enum validation', () => {
    it('should validate enum values', () => {
      const middleware = validate({
        body: {
          status: { type: 'string', enum: ['active', 'inactive', 'pending'] },
        },
      });

      const { req: validReq, res: validRes, next: validNext } = createMocks({ body: { status: 'active' } });
      middleware(validReq, validRes, validNext);
      expect(validNext).toHaveBeenCalled();

      const { req: invalidReq, res: invalidRes, next: invalidNext } = createMocks({ body: { status: 'invalid' } });
      middleware(invalidReq, invalidRes, invalidNext);
      expect(invalidRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('number range validation', () => {
    it('should validate min value', () => {
      const middleware = validate({
        body: {
          age: { type: 'number', min: 0 },
        },
      });

      const { req: validReq, res: validRes, next: validNext } = createMocks({ body: { age: 25 } });
      middleware(validReq, validRes, validNext);
      expect(validNext).toHaveBeenCalled();

      const { req: invalidReq, res: invalidRes, next: invalidNext } = createMocks({ body: { age: -1 } });
      middleware(invalidReq, invalidRes, invalidNext);
      expect(invalidRes.status).toHaveBeenCalledWith(400);
    });

    it('should validate max value', () => {
      const middleware = validate({
        body: {
          score: { type: 'number', max: 100 },
        },
      });

      const { req: validReq, res: validRes, next: validNext } = createMocks({ body: { score: 85 } });
      middleware(validReq, validRes, validNext);
      expect(validNext).toHaveBeenCalled();

      const { req: invalidReq, res: invalidRes, next: invalidNext } = createMocks({ body: { score: 150 } });
      middleware(invalidReq, invalidRes, invalidNext);
      expect(invalidRes.status).toHaveBeenCalledWith(400);
    });

    it('should allow min value of 0', () => {
      const middleware = validate({
        body: {
          count: { type: 'number', min: 0 },
        },
      });

      const { req, res, next } = createMocks({ body: { count: 0 } });
      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('custom validation', () => {
    it('should run custom validator', () => {
      const customValidator = vi.fn().mockReturnValue(null);
      const middleware = validate({
        body: {
          data: { custom: customValidator },
        },
      });

      const { req, res, next } = createMocks({ body: { data: 'test-value' } });
      middleware(req, res, next);

      expect(customValidator).toHaveBeenCalledWith('test-value', 'data');
      expect(next).toHaveBeenCalled();
    });

    it('should return error from custom validator', () => {
      const customValidator = vi.fn().mockReturnValue({
        field: 'data',
        message: 'Custom validation failed',
        code: 'CUSTOM_ERROR',
      });
      const middleware = validate({
        body: {
          data: { custom: customValidator },
        },
      });

      const { req, res, next } = createMocks({ body: { data: 'bad-value' } });
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('params validation', () => {
    it('should validate request params', () => {
      const middleware = validate({
        params: {
          id: { required: true, type: 'string' },
        },
      });

      const { req: validReq, res: validRes, next: validNext } = createMocks({ params: { id: 'agent-123' } });
      middleware(validReq, validRes, validNext);
      expect(validNext).toHaveBeenCalled();

      const { req: invalidReq, res: invalidRes, next: invalidNext } = createMocks({ params: {} });
      middleware(invalidReq, invalidRes, invalidNext);
      expect(invalidRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('query validation', () => {
    it('should validate query parameters', () => {
      const middleware = validate({
        query: {
          limit: { type: 'string', pattern: /^\d+$/ },
        },
      });

      const { req: validReq, res: validRes, next: validNext } = createMocks({ query: { limit: '10' } });
      middleware(validReq, validRes, validNext);
      expect(validNext).toHaveBeenCalled();

      const { req: invalidReq, res: invalidRes, next: invalidNext } = createMocks({ query: { limit: 'abc' } });
      middleware(invalidReq, invalidRes, invalidNext);
      expect(invalidRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('multiple errors', () => {
    it('should collect all validation errors', () => {
      const middleware = validate({
        body: {
          name: { required: true },
          email: { required: true },
          age: { required: true },
        },
      });

      const { req, res, next } = createMocks({ body: {} });
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            details: expect.arrayContaining([
              expect.objectContaining({ field: 'name' }),
              expect.objectContaining({ field: 'email' }),
              expect.objectContaining({ field: 'age' }),
            ]),
          }),
        })
      );
    });
  });

  describe('optional fields', () => {
    it('should skip validation for undefined optional fields', () => {
      const middleware = validate({
        body: {
          name: { required: true },
          description: { type: 'string', maxLength: 100 },
        },
      });

      const { req, res, next } = createMocks({ body: { name: 'Test' } });
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('nested object validation', () => {
    it('should validate nested objects using custom validator', () => {
      const middleware = validate({
        body: {
          metadata: {
            type: 'object',
            custom: (value: unknown, field: string) => {
              const obj = value as Record<string, unknown>;
              if (obj && typeof obj.version !== 'string') {
                return { field: `${field}.version`, message: 'version must be a string', code: 'INVALID_TYPE' };
              }
              return null;
            },
          },
        },
      });

      const { req: validReq, res: validRes, next: validNext } = createMocks({
        body: { metadata: { version: '1.0.0' } },
      });
      middleware(validReq, validRes, validNext);
      expect(validNext).toHaveBeenCalled();

      const { req: invalidReq, res: invalidRes, next: invalidNext } = createMocks({
        body: { metadata: { version: 123 } },
      });
      middleware(invalidReq, invalidRes, invalidNext);
      expect(invalidRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('array validation', () => {
    it('should validate array type', () => {
      const middleware = validate({
        body: {
          tags: { type: 'array' },
        },
      });

      const { req: validReq, res: validRes, next: validNext } = createMocks({
        body: { tags: ['a', 'b', 'c'] },
      });
      middleware(validReq, validRes, validNext);
      expect(validNext).toHaveBeenCalled();

      const { req: invalidReq, res: invalidRes, next: invalidNext } = createMocks({
        body: { tags: 'not-an-array' },
      });
      middleware(invalidReq, invalidRes, invalidNext);
      expect(invalidRes.status).toHaveBeenCalledWith(400);
    });

    it('should validate array items using custom validator', () => {
      const middleware = validate({
        body: {
          capabilities: {
            type: 'array',
            custom: (value: unknown, field: string) => {
              const arr = value as unknown[];
              for (let i = 0; i < arr.length; i++) {
                if (typeof arr[i] !== 'string') {
                  return { field: `${field}[${i}]`, message: 'array items must be strings', code: 'INVALID_ITEM_TYPE' };
                }
              }
              return null;
            },
          },
        },
      });

      const { req: validReq, res: validRes, next: validNext } = createMocks({
        body: { capabilities: ['read', 'write', 'execute'] },
      });
      middleware(validReq, validRes, validNext);
      expect(validNext).toHaveBeenCalled();

      const { req: invalidReq, res: invalidRes, next: invalidNext } = createMocks({
        body: { capabilities: ['read', 123, 'write'] },
      });
      middleware(invalidReq, invalidRes, invalidNext);
      expect(invalidRes.status).toHaveBeenCalledWith(400);
    });
  });
});

describe('AgentRegistrationSchema', () => {
  it('should validate valid agent registration', () => {
    const middleware = validate(AgentRegistrationSchema);
    const { req, res, next } = createMocks({
      body: {
        name: 'TestAgent',
        capabilities: ['read', 'write'],
        metadata: { version: '1.0' },
      },
    });

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should require name field', () => {
    const middleware = validate(AgentRegistrationSchema);
    const { req, res, next } = createMocks({
      body: {
        capabilities: [],
      },
    });

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should validate name format', () => {
    const middleware = validate(AgentRegistrationSchema);
    const { req, res, next } = createMocks({
      body: {
        name: '123InvalidName',
      },
    });

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should validate capabilities is array', () => {
    const middleware = validate(AgentRegistrationSchema);
    const { req, res, next } = createMocks({
      body: {
        name: 'TestAgent',
        capabilities: 'not-an-array',
      },
    });

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ChannelCreateSchema', () => {
  it('should validate valid channel creation', () => {
    const middleware = validate(ChannelCreateSchema);
    const { req, res, next } = createMocks({
      body: {
        name: 'general',
        type: 'public',
        topic: 'General discussion',
      },
    });

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should require name field', () => {
    const middleware = validate(ChannelCreateSchema);
    const { req, res, next } = createMocks({
      body: {
        type: 'public',
      },
    });

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should validate channel type enum', () => {
    const middleware = validate(ChannelCreateSchema);
    const { req, res, next } = createMocks({
      body: {
        name: 'test',
        type: 'invalid-type',
      },
    });

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('MessageSendSchema', () => {
  it('should validate valid message', () => {
    const middleware = validate(MessageSendSchema);
    const { req, res, next } = createMocks({
      body: {
        text: 'Hello, world!',
        type: 'text',
      },
    });

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should require text field', () => {
    const middleware = validate(MessageSendSchema);
    const { req, res, next } = createMocks({
      body: {
        type: 'text',
      },
    });

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should validate message type enum', () => {
    const middleware = validate(MessageSendSchema);
    const { req, res, next } = createMocks({
      body: {
        text: 'Hello',
        type: 'invalid-type',
      },
    });

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should accept optional threadId field', () => {
    const middleware = validate(MessageSendSchema);
    const { req, res, next } = createMocks({
      body: {
        text: 'This is a reply',
        type: 'thread_reply',
        threadId: 'msg-123',
      },
    });

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should accept optional correlationId field', () => {
    const middleware = validate(MessageSendSchema);
    const { req, res, next } = createMocks({
      body: {
        text: 'Hello',
        correlationId: 'corr-456',
      },
    });

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should validate data field is object', () => {
    const middleware = validate(MessageSendSchema);

    const { req: validReq, res: validRes, next: validNext } = createMocks({
      body: {
        text: 'Hello',
        data: { key: 'value' },
      },
    });
    middleware(validReq, validRes, validNext);
    expect(validNext).toHaveBeenCalled();

    const { req: invalidReq, res: invalidRes, next: invalidNext } = createMocks({
      body: {
        text: 'Hello',
        data: 'not-an-object',
      },
    });
    middleware(invalidReq, invalidRes, invalidNext);
    expect(invalidRes.status).toHaveBeenCalledWith(400);
  });
});

describe('PresenceUpdateSchema', () => {
  it('should validate valid presence update', () => {
    const middleware = validate(PresenceUpdateSchema);
    const { req, res, next } = createMocks({
      body: {
        status: 'online',
        statusMessage: 'Working on tasks',
      },
    });

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should validate status enum', () => {
    const middleware = validate(PresenceUpdateSchema);
    const { req, res, next } = createMocks({
      body: {
        status: 'invalid-status',
      },
    });

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should validate statusMessage max length', () => {
    const middleware = validate(PresenceUpdateSchema);
    const { req, res, next } = createMocks({
      body: {
        status: 'online',
        statusMessage: 'a'.repeat(300), // Exceeds 256 limit
      },
    });

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('TypingIndicatorSchema', () => {
  it('should validate valid typing indicator', () => {
    const middleware = validate(TypingIndicatorSchema);
    const { req, res, next } = createMocks({
      body: {
        channelId: 'channel-123',
        isTyping: true,
      },
    });

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should require channelId', () => {
    const middleware = validate(TypingIndicatorSchema);
    const { req, res, next } = createMocks({
      body: {
        isTyping: true,
      },
    });

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('PaginationSchema', () => {
  it('should validate valid pagination params', () => {
    const middleware = validate(PaginationSchema);
    const { req, res, next } = createMocks({
      query: {
        limit: '10',
        before: 'cursor-abc',
        after: 'cursor-xyz',
      },
    });

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should validate limit is numeric string', () => {
    const middleware = validate(PaginationSchema);
    const { req, res, next } = createMocks({
      query: {
        limit: 'not-a-number',
      },
    });

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should accept empty query params', () => {
    const middleware = validate(PaginationSchema);
    const { req, res, next } = createMocks({
      query: {},
    });

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
