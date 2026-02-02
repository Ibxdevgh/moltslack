/**
 * AuthService Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from './auth-service.js';
import type { Permission, Agent } from '../models/types.js';

describe('AuthService', () => {
  let authService: AuthService;
  const testSecret = 'test-jwt-secret-12345';

  beforeEach(() => {
    // Use a fixed secret for testing
    authService = new AuthService(testSecret);
  });

  describe('constructor', () => {
    it('should use provided secret', () => {
      const service = new AuthService('my-secret');
      // Verify by generating and verifying a token
      const token = service.generateToken({
        id: 'test-id',
        name: 'test-agent',
        permissions: [],
      });
      expect(token).toBeDefined();
      expect(service.verifyToken(token)).not.toBeNull();
    });

    it('should use default token expiry when not provided', () => {
      const service = new AuthService('secret');
      const token = service.generateToken({
        id: 'test-id',
        name: 'test-agent',
        permissions: [],
      });
      const payload = service.verifyToken(token);
      expect(payload).not.toBeNull();
      // Default expiry is 7 days
      expect(payload!.expiresAt - payload!.issuedAt).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it('should use custom token expiry when provided', () => {
      const customExpiry = 60 * 60 * 1000; // 1 hour
      const service = new AuthService('secret', customExpiry);
      const token = service.generateToken({
        id: 'test-id',
        name: 'test-agent',
        permissions: [],
      });
      const payload = service.verifyToken(token);
      expect(payload).not.toBeNull();
      expect(payload!.expiresAt - payload!.issuedAt).toBe(customExpiry);
    });
  });

  describe('generateToken', () => {
    it('should generate a valid JWT token', () => {
      const agent = {
        id: 'agent-123',
        name: 'TestAgent',
        permissions: [{ resource: 'channel:*', actions: ['read', 'write'] as const }],
      };

      const token = authService.generateToken(agent);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('should include agent information in token payload', () => {
      const permissions: Permission[] = [
        { resource: 'channel:general', actions: ['read'] },
      ];
      const agent = {
        id: 'agent-456',
        name: 'MyAgent',
        permissions,
      };

      const token = authService.generateToken(agent);
      const payload = authService.verifyToken(token);

      expect(payload).not.toBeNull();
      expect(payload!.agentId).toBe('agent-456');
      expect(payload!.agentName).toBe('MyAgent');
      expect(payload!.permissions).toEqual(permissions);
    });

    it('should set issuedAt and expiresAt timestamps', () => {
      const agent = {
        id: 'agent-789',
        name: 'TimeAgent',
        permissions: [],
      };

      const beforeGenerate = Date.now();
      const token = authService.generateToken(agent);
      const afterGenerate = Date.now();

      const payload = authService.verifyToken(token);

      expect(payload).not.toBeNull();
      expect(payload!.issuedAt).toBeGreaterThanOrEqual(beforeGenerate);
      expect(payload!.issuedAt).toBeLessThanOrEqual(afterGenerate);
      expect(payload!.expiresAt).toBeGreaterThan(payload!.issuedAt);
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid token', () => {
      const agent = {
        id: 'agent-abc',
        name: 'ValidAgent',
        permissions: [],
      };

      const token = authService.generateToken(agent);
      const payload = authService.verifyToken(token);

      expect(payload).not.toBeNull();
      expect(payload!.agentId).toBe('agent-abc');
    });

    it('should return null for invalid token', () => {
      const result = authService.verifyToken('invalid.token.here');
      expect(result).toBeNull();
    });

    it('should return null for token with wrong secret', () => {
      const otherService = new AuthService('different-secret');
      const agent = {
        id: 'agent-xyz',
        name: 'OtherAgent',
        permissions: [],
      };

      const token = otherService.generateToken(agent);
      const result = authService.verifyToken(token);

      expect(result).toBeNull();
    });

    it('should return null for expired token', () => {
      vi.useFakeTimers();
      // Create service with 1 second expiry (minimum for jwt.sign)
      const shortExpiryService = new AuthService(testSecret, 1000); // 1 second expiry
      const agent = {
        id: 'agent-expired',
        name: 'ExpiredAgent',
        permissions: [],
      };

      const token = shortExpiryService.generateToken(agent);

      // Advance time past expiration
      vi.advanceTimersByTime(1100);

      const result = shortExpiryService.verifyToken(token);
      expect(result).toBeNull();

      vi.useRealTimers();
    });

    it('should return null for empty token', () => {
      expect(authService.verifyToken('')).toBeNull();
    });

    it('should return null for malformed token', () => {
      expect(authService.verifyToken('not-a-jwt')).toBeNull();
      expect(authService.verifyToken('a.b')).toBeNull();
      expect(authService.verifyToken('a.b.c.d')).toBeNull();
    });
  });

  describe('hasPermission', () => {
    it('should return true when token has matching permission', () => {
      const agent = {
        id: 'agent-perm',
        name: 'PermAgent',
        permissions: [{ resource: 'channel:general', actions: ['read', 'write'] as const }],
      };

      const token = authService.generateToken(agent);

      expect(authService.hasPermission(token, 'channel:general', 'read')).toBe(true);
      expect(authService.hasPermission(token, 'channel:general', 'write')).toBe(true);
    });

    it('should return false when token lacks permission', () => {
      const agent = {
        id: 'agent-noperm',
        name: 'NoPermAgent',
        permissions: [{ resource: 'channel:general', actions: ['read'] as const }],
      };

      const token = authService.generateToken(agent);

      expect(authService.hasPermission(token, 'channel:general', 'write')).toBe(false);
      expect(authService.hasPermission(token, 'channel:general', 'admin')).toBe(false);
    });

    it('should return false for invalid token', () => {
      expect(authService.hasPermission('invalid-token', 'channel:general', 'read')).toBe(false);
    });

    it('should return true for admin permission on any action', () => {
      const agent = {
        id: 'agent-admin',
        name: 'AdminAgent',
        permissions: [{ resource: 'channel:general', actions: ['admin'] as const }],
      };

      const token = authService.generateToken(agent);

      expect(authService.hasPermission(token, 'channel:general', 'read')).toBe(true);
      expect(authService.hasPermission(token, 'channel:general', 'write')).toBe(true);
      expect(authService.hasPermission(token, 'channel:general', 'admin')).toBe(true);
    });
  });

  describe('checkPermissions', () => {
    it('should match exact resource', () => {
      const permissions: Permission[] = [
        { resource: 'channel:general', actions: ['read'] },
      ];

      expect(authService.checkPermissions(permissions, 'channel:general', 'read')).toBe(true);
      expect(authService.checkPermissions(permissions, 'channel:other', 'read')).toBe(false);
    });

    it('should match wildcard patterns', () => {
      const permissions: Permission[] = [
        { resource: 'channel:*', actions: ['read', 'write'] },
      ];

      expect(authService.checkPermissions(permissions, 'channel:general', 'read')).toBe(true);
      expect(authService.checkPermissions(permissions, 'channel:dev', 'write')).toBe(true);
      expect(authService.checkPermissions(permissions, 'message:123', 'read')).toBe(false);
    });

    it('should match global wildcard', () => {
      const permissions: Permission[] = [
        { resource: '*', actions: ['read'] },
      ];

      expect(authService.checkPermissions(permissions, 'channel:general', 'read')).toBe(true);
      expect(authService.checkPermissions(permissions, 'message:123', 'read')).toBe(true);
      expect(authService.checkPermissions(permissions, 'anything', 'read')).toBe(true);
    });

    it('should grant all actions with admin permission', () => {
      const permissions: Permission[] = [
        { resource: 'channel:general', actions: ['admin'] },
      ];

      expect(authService.checkPermissions(permissions, 'channel:general', 'read')).toBe(true);
      expect(authService.checkPermissions(permissions, 'channel:general', 'write')).toBe(true);
      expect(authService.checkPermissions(permissions, 'channel:general', 'admin')).toBe(true);
    });

    it('should return false for empty permissions', () => {
      expect(authService.checkPermissions([], 'channel:general', 'read')).toBe(false);
    });

    it('should check multiple permissions and find first match', () => {
      const permissions: Permission[] = [
        { resource: 'channel:private', actions: ['read'] },
        { resource: 'channel:*', actions: ['write'] },
      ];

      expect(authService.checkPermissions(permissions, 'channel:private', 'read')).toBe(true);
      expect(authService.checkPermissions(permissions, 'channel:public', 'write')).toBe(true);
      expect(authService.checkPermissions(permissions, 'channel:public', 'read')).toBe(false);
    });

    it('should return false for permission with empty actions array', () => {
      const permissions: Permission[] = [
        { resource: 'channel:general', actions: [] },
      ];

      expect(authService.checkPermissions(permissions, 'channel:general', 'read')).toBe(false);
      expect(authService.checkPermissions(permissions, 'channel:general', 'write')).toBe(false);
      expect(authService.checkPermissions(permissions, 'channel:general', 'admin')).toBe(false);
    });

    it('should handle multi-colon resources', () => {
      const permissions: Permission[] = [
        { resource: 'channel:team:general', actions: ['read', 'write'] },
      ];

      // Exact match should work
      expect(authService.checkPermissions(permissions, 'channel:team:general', 'read')).toBe(true);
      expect(authService.checkPermissions(permissions, 'channel:team:general', 'write')).toBe(true);

      // Different resources should not match
      expect(authService.checkPermissions(permissions, 'channel:team', 'read')).toBe(false);
      expect(authService.checkPermissions(permissions, 'channel:general', 'read')).toBe(false);
    });

    it('should handle wildcard with multi-colon resources', () => {
      const permissions: Permission[] = [
        { resource: 'channel:team:*', actions: ['read'] },
      ];

      // Should match resources starting with channel:team:
      expect(authService.checkPermissions(permissions, 'channel:team:general', 'read')).toBe(true);
      expect(authService.checkPermissions(permissions, 'channel:team:private', 'read')).toBe(true);

      // Should not match other patterns
      expect(authService.checkPermissions(permissions, 'channel:other:general', 'read')).toBe(false);
    });
  });

  describe('matchResource (via checkPermissions)', () => {
    it('should handle prefix patterns correctly', () => {
      const permissions: Permission[] = [
        { resource: 'message:*', actions: ['read'] },
      ];

      // Should match
      expect(authService.checkPermissions(permissions, 'message:123', 'read')).toBe(true);
      expect(authService.checkPermissions(permissions, 'message:abc-def', 'read')).toBe(true);
      expect(authService.checkPermissions(permissions, 'message:', 'read')).toBe(true);

      // Should not match
      expect(authService.checkPermissions(permissions, 'messages:123', 'read')).toBe(false);
      expect(authService.checkPermissions(permissions, 'msg:123', 'read')).toBe(false);
    });

    it('should handle presence patterns', () => {
      const permissions: Permission[] = [
        { resource: 'presence:*', actions: ['read', 'write'] },
      ];

      expect(authService.checkPermissions(permissions, 'presence:agent-123', 'read')).toBe(true);
      expect(authService.checkPermissions(permissions, 'presence:agent-123', 'write')).toBe(true);
    });
  });

  describe('createDefaultPermissions', () => {
    it('should create default permissions with channel, message, and presence access', () => {
      const permissions = authService.createDefaultPermissions();

      expect(permissions).toHaveLength(3);

      // Check channel permissions
      expect(permissions.some(p => p.resource === 'channel:*' && p.actions.includes('read') && p.actions.includes('write'))).toBe(true);

      // Check message permissions
      expect(permissions.some(p => p.resource === 'message:*' && p.actions.includes('read') && p.actions.includes('write'))).toBe(true);

      // Check presence permissions
      expect(permissions.some(p => p.resource === 'presence:*' && p.actions.includes('read') && p.actions.includes('write'))).toBe(true);
    });
  });

  describe('createAdminPermissions', () => {
    it('should create admin permissions with full access', () => {
      const permissions = authService.createAdminPermissions();

      expect(permissions).toHaveLength(1);
      expect(permissions[0].resource).toBe('*');
      expect(permissions[0].actions).toContain('admin');
    });

    it('should grant access to any resource with admin permissions', () => {
      const permissions = authService.createAdminPermissions();

      expect(authService.checkPermissions(permissions, 'channel:anything', 'admin')).toBe(true);
      expect(authService.checkPermissions(permissions, 'message:123', 'write')).toBe(true);
      expect(authService.checkPermissions(permissions, 'some:random:resource', 'read')).toBe(true);
    });
  });

  describe('extractAgentId', () => {
    it('should extract agent ID from valid Bearer token', () => {
      const agent = {
        id: 'agent-extract-123',
        name: 'ExtractAgent',
        permissions: [],
      };

      const token = authService.generateToken(agent);
      const authHeader = `Bearer ${token}`;

      const agentId = authService.extractAgentId(authHeader);

      expect(agentId).toBe('agent-extract-123');
    });

    it('should handle lowercase bearer prefix', () => {
      const agent = {
        id: 'agent-lower',
        name: 'LowerAgent',
        permissions: [],
      };

      const token = authService.generateToken(agent);
      const authHeader = `bearer ${token}`;

      const agentId = authService.extractAgentId(authHeader);

      expect(agentId).toBe('agent-lower');
    });

    it('should return null for missing auth header', () => {
      expect(authService.extractAgentId(undefined)).toBeNull();
    });

    it('should return null for invalid token', () => {
      expect(authService.extractAgentId('Bearer invalid-token')).toBeNull();
    });

    it('should return null for empty auth header', () => {
      expect(authService.extractAgentId('')).toBeNull();
    });

    it('should handle token without Bearer prefix', () => {
      const agent = {
        id: 'agent-noprefix',
        name: 'NoPrefixAgent',
        permissions: [],
      };

      const token = authService.generateToken(agent);
      // This should still work as the code strips Bearer prefix if present
      const agentId = authService.extractAgentId(token);

      expect(agentId).toBe('agent-noprefix');
    });
  });

  describe('middleware', () => {
    it('should return a function', () => {
      const middleware = authService.middleware();
      expect(typeof middleware).toBe('function');
    });

    it('should return 401 when no authorization header', () => {
      const middleware = authService.middleware();
      const req: any = { headers: {} };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'No authorization header' },
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 for invalid token', () => {
      const middleware = authService.middleware();
      const req: any = { headers: { authorization: 'Bearer invalid-token' } };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' },
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should call next and set req.agent for valid token', () => {
      const middleware = authService.middleware();
      const agent = {
        id: 'agent-middleware',
        name: 'MiddlewareAgent',
        permissions: [{ resource: 'channel:*', actions: ['read'] as const }],
      };

      const token = authService.generateToken(agent);
      const req: any = { headers: { authorization: `Bearer ${token}` } };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.agent).toBeDefined();
      expect(req.agent.agentId).toBe('agent-middleware');
      expect(req.agent.agentName).toBe('MiddlewareAgent');
      expect(req.agent.permissions).toEqual([{ resource: 'channel:*', actions: ['read'] }]);
    });

    it('should handle token without Bearer prefix in middleware', () => {
      const middleware = authService.middleware();
      const agent = {
        id: 'agent-nobearer',
        name: 'NoBearerAgent',
        permissions: [],
      };

      const token = authService.generateToken(agent);
      const req: any = { headers: { authorization: token } };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.agent.agentId).toBe('agent-nobearer');
    });
  });
});
