/**
 * API Request Validation Middleware
 *
 * Validates incoming requests against JSON schemas and validation rules
 */

import type { Request, Response, NextFunction } from 'express';
import {
  validateName,
  validateUUID,
  validateTimestamp,
  validateChannelName,
  ValidationLimits,
  type ValidationError,
} from '../schemas/validation.js';

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

interface ValidationSchema {
  body?: Record<string, FieldValidator>;
  params?: Record<string, FieldValidator>;
  query?: Record<string, FieldValidator>;
}

interface FieldValidator {
  required?: boolean;
  type?: 'string' | 'number' | 'boolean' | 'object' | 'array';
  pattern?: RegExp;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  enum?: string[];
  custom?: (value: unknown, field: string) => ValidationError | null;
}

function validateField(
  value: unknown,
  field: string,
  validator: FieldValidator
): ValidationError | null {
  // Check required
  if (validator.required && (value === undefined || value === null || value === '')) {
    return { field, message: `${field} is required`, code: 'REQUIRED_FIELD' };
  }

  // If not required and not present, skip
  if (value === undefined || value === null) {
    return null;
  }

  // Type check
  if (validator.type) {
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    if (actualType !== validator.type) {
      return {
        field,
        message: `${field} must be a ${validator.type}`,
        code: 'INVALID_TYPE',
        value,
      };
    }
  }

  // String validations
  if (typeof value === 'string') {
    if (validator.minLength && value.length < validator.minLength) {
      return {
        field,
        message: `${field} must be at least ${validator.minLength} characters`,
        code: 'TOO_SHORT',
        value,
      };
    }
    if (validator.maxLength && value.length > validator.maxLength) {
      return {
        field,
        message: `${field} must be at most ${validator.maxLength} characters`,
        code: 'TOO_LONG',
        value,
      };
    }
    if (validator.pattern && !validator.pattern.test(value)) {
      return {
        field,
        message: `${field} has invalid format`,
        code: 'INVALID_FORMAT',
        value,
      };
    }
    if (validator.enum && !validator.enum.includes(value)) {
      return {
        field,
        message: `${field} must be one of: ${validator.enum.join(', ')}`,
        code: 'INVALID_ENUM',
        value,
      };
    }
  }

  // Number validations
  if (typeof value === 'number') {
    if (validator.min !== undefined && value < validator.min) {
      return {
        field,
        message: `${field} must be at least ${validator.min}`,
        code: 'TOO_SMALL',
        value,
      };
    }
    if (validator.max !== undefined && value > validator.max) {
      return {
        field,
        message: `${field} must be at most ${validator.max}`,
        code: 'TOO_LARGE',
        value,
      };
    }
  }

  // Custom validation
  if (validator.custom) {
    return validator.custom(value, field);
  }

  return null;
}

// ============================================================================
// VALIDATION MIDDLEWARE FACTORY
// ============================================================================

export function validate(schema: ValidationSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const errors: ValidationError[] = [];

    // Validate body
    if (schema.body) {
      for (const [field, validator] of Object.entries(schema.body)) {
        const error = validateField(req.body?.[field], field, validator);
        if (error) errors.push(error);
      }
    }

    // Validate params
    if (schema.params) {
      for (const [field, validator] of Object.entries(schema.params)) {
        const error = validateField(req.params?.[field], field, validator);
        if (error) errors.push(error);
      }
    }

    // Validate query
    if (schema.query) {
      for (const [field, validator] of Object.entries(schema.query)) {
        const error = validateField(req.query?.[field], field, validator);
        if (error) errors.push(error);
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: errors,
        },
      });
    }

    next();
  };
}

// ============================================================================
// PRE-DEFINED VALIDATION SCHEMAS
// ============================================================================

export const AgentRegistrationSchema: ValidationSchema = {
  body: {
    name: {
      required: true,
      type: 'string',
      minLength: ValidationLimits.NAME_MIN_LENGTH,
      maxLength: ValidationLimits.NAME_MAX_LENGTH,
      pattern: /^[a-zA-Z][a-zA-Z0-9_-]*$/,
      custom: (value, field) => validateName(value as string, field),
    },
    capabilities: {
      type: 'array',
    },
    metadata: {
      type: 'object',
    },
  },
};

export const ChannelCreateSchema: ValidationSchema = {
  body: {
    name: {
      required: true,
      type: 'string',
      minLength: 1,
      maxLength: 64,
      pattern: /^[a-zA-Z][a-zA-Z0-9_-]*$/,
    },
    type: {
      type: 'string',
      enum: ['public', 'private', 'direct', 'broadcast'],
    },
    topic: {
      type: 'string',
      maxLength: 256,
    },
  },
};

export const MessageSendSchema: ValidationSchema = {
  body: {
    text: {
      required: true,
      type: 'string',
      minLength: 1,
      maxLength: ValidationLimits.MESSAGE_TEXT_MAX_LENGTH,
    },
    type: {
      type: 'string',
      enum: ['text', 'system', 'command', 'event', 'file', 'reaction', 'thread_reply'],
    },
    data: {
      type: 'object',
    },
    threadId: {
      type: 'string',
    },
    correlationId: {
      type: 'string',
    },
  },
};

export const PresenceUpdateSchema: ValidationSchema = {
  body: {
    status: {
      type: 'string',
      enum: ['online', 'idle', 'busy', 'dnd', 'offline'],
    },
    statusMessage: {
      type: 'string',
      maxLength: ValidationLimits.STATUS_MESSAGE_MAX_LENGTH,
    },
  },
};

export const TypingIndicatorSchema: ValidationSchema = {
  body: {
    channelId: {
      required: true,
      type: 'string',
    },
    isTyping: {
      type: 'boolean',
    },
  },
};

export const PaginationSchema: ValidationSchema = {
  query: {
    limit: {
      type: 'string',
      pattern: /^\d+$/,
    },
    before: {
      type: 'string',
    },
    after: {
      type: 'string',
    },
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export default validate;
