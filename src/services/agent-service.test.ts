/**
 * AgentService Unit Tests
 * Comprehensive tests covering registration, lifecycle, and token management
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentService } from './agent-service.js';
import type { AuthService } from './auth-service.js';
import type { Permission, PresenceStatus } from '../models/types.js';

// Create mock AuthService factory
function createMockAuthService() {
  return {
    createDefaultPermissions: vi.fn().mockReturnValue([
      { resource: 'channel:*', actions: ['read', 'write'] },
      { resource: 'message:*', actions: ['read', 'write'] },
      { resource: 'presence:*', actions: ['read', 'write'] },
    ]),
    generateToken: vi.fn().mockReturnValue('mock-token-123'),
    verifyToken: vi.fn().mockReturnValue({
      agentId: 'agent-123',
      agentName: 'TestAgent',
      permissions: [],
      issuedAt: Date.now(),
      expiresAt: Date.now() + 86400000,
    }),
    hasPermission: vi.fn().mockReturnValue(true),
    checkPermissions: vi.fn().mockReturnValue(true),
    extractAgentId: vi.fn(),
    middleware: vi.fn(),
  } as unknown as AuthService;
}

describe('AgentService', () => {
  let agentService: AgentService;
  let mockAuthService: ReturnType<typeof createMockAuthService>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthService = createMockAuthService();
    agentService = new AgentService(mockAuthService);
  });

  describe('register()', () => {
    it('should register a new agent with minimal input', () => {
      const registration = { name: 'TestAgent' };
      const agent = agentService.register(registration);

      expect(agent).toBeDefined();
      expect(agent.name).toBe('TestAgent');
      expect(agent.id).toMatch(/^agent-/);
      expect(agent.token).toBe('mock-token-123');
      expect(agent.capabilities).toEqual([]);
      expect(agent.status).toBe('offline');
      expect(agent.metadata).toEqual({});
      expect(agent.createdAt).toBeDefined();
      expect(agent.lastSeenAt).toBeDefined();
    });

    it('should register a new agent with full input', () => {
      const registration = {
        name: 'FullAgent',
        capabilities: ['code-execution', 'web-search'],
        metadata: { model: 'claude-3', version: '1.0' },
      };
      const agent = agentService.register(registration);

      expect(agent.name).toBe('FullAgent');
      expect(agent.capabilities).toEqual(['code-execution', 'web-search']);
      expect(agent.metadata).toEqual({ model: 'claude-3', version: '1.0' });
    });

    it('should throw error when registering duplicate agent name', () => {
      agentService.register({ name: 'DuplicateAgent' });

      expect(() => {
        agentService.register({ name: 'DuplicateAgent' });
      }).toThrow('Agent with name "DuplicateAgent" already exists');
    });

    it('should call AuthService methods during registration', () => {
      agentService.register({ name: 'AuthTestAgent' });

      expect(mockAuthService.createDefaultPermissions).toHaveBeenCalled();
      expect(mockAuthService.generateToken).toHaveBeenCalled();
    });

    it('should set permissions from AuthService', () => {
      const agent = agentService.register({ name: 'PermAgent' });

      expect(agent.permissions).toEqual([
        { resource: 'channel:*', actions: ['read', 'write'] },
        { resource: 'message:*', actions: ['read', 'write'] },
        { resource: 'presence:*', actions: ['read', 'write'] },
      ]);
    });
  });

  describe('getById()', () => {
    it('should return agent by ID', () => {
      const registered = agentService.register({ name: 'GetByIdAgent' });
      const found = agentService.getById(registered.id);

      expect(found).toBeDefined();
      expect(found?.id).toBe(registered.id);
      expect(found?.name).toBe('GetByIdAgent');
    });

    it('should return undefined for non-existent ID', () => {
      const found = agentService.getById('agent-nonexistent');

      expect(found).toBeUndefined();
    });
  });

  describe('getByName()', () => {
    it('should return agent by name', () => {
      agentService.register({ name: 'GetByNameAgent' });
      const found = agentService.getByName('GetByNameAgent');

      expect(found).toBeDefined();
      expect(found?.name).toBe('GetByNameAgent');
    });

    it('should return undefined for non-existent name', () => {
      const found = agentService.getByName('NonExistentAgent');

      expect(found).toBeUndefined();
    });
  });

  describe('getAll()', () => {
    it('should return empty array when no agents registered', () => {
      const agents = agentService.getAll();

      expect(agents).toEqual([]);
    });

    it('should return all registered agents', () => {
      agentService.register({ name: 'Agent1' });
      agentService.register({ name: 'Agent2' });
      agentService.register({ name: 'Agent3' });

      const agents = agentService.getAll();

      expect(agents).toHaveLength(3);
      expect(agents.map(a => a.name).sort()).toEqual(['Agent1', 'Agent2', 'Agent3']);
    });
  });

  describe('getOnline()', () => {
    it('should return empty array when no agents are online', () => {
      agentService.register({ name: 'OfflineAgent' });

      const online = agentService.getOnline();

      expect(online).toEqual([]);
    });

    it('should return only online/active/idle agents', () => {
      const agent1 = agentService.register({ name: 'OnlineAgent' });
      const agent2 = agentService.register({ name: 'ActiveAgent' });
      const agent3 = agentService.register({ name: 'IdleAgent' });
      agentService.register({ name: 'OfflineAgent' });

      agentService.updatePresence(agent1.id, 'online');
      agentService.updatePresence(agent2.id, 'active');
      agentService.updatePresence(agent3.id, 'idle');

      const online = agentService.getOnline();

      expect(online).toHaveLength(3);
      expect(online.map(a => a.name).sort()).toEqual(['ActiveAgent', 'IdleAgent', 'OnlineAgent']);
    });
  });

  describe('updatePresence()', () => {
    it('should update presence status', () => {
      const agent = agentService.register({ name: 'PresenceAgent' });

      const result = agentService.updatePresence(agent.id, 'online');

      expect(result).toBe(true);
      const updated = agentService.getById(agent.id);
      expect(updated?.status).toBe('online');
    });

    it('should update lastSeenAt on presence change', () => {
      const agent = agentService.register({ name: 'PresenceTimeAgent' });
      const originalLastSeen = agent.lastSeenAt;

      agentService.updatePresence(agent.id, 'active');

      const updated = agentService.getById(agent.id);
      expect(updated?.lastSeenAt).toBeGreaterThanOrEqual(originalLastSeen);
    });

    it('should return false for non-existent agent', () => {
      const result = agentService.updatePresence('agent-nonexistent', 'online');

      expect(result).toBe(false);
    });

    it('should handle all presence status types', () => {
      const agent = agentService.register({ name: 'AllStatusAgent' });
      const statuses: PresenceStatus[] = ['online', 'active', 'idle', 'offline'];

      for (const status of statuses) {
        const result = agentService.updatePresence(agent.id, status);
        expect(result).toBe(true);
        expect(agentService.getById(agent.id)?.status).toBe(status);
      }
    });
  });

  describe('updateMetadata()', () => {
    it('should update agent metadata', () => {
      const agent = agentService.register({ name: 'MetadataAgent' });

      const result = agentService.updateMetadata(agent.id, { newKey: 'newValue' });

      expect(result).toBe(true);
      const updated = agentService.getById(agent.id);
      expect(updated?.metadata).toEqual({ newKey: 'newValue' });
    });

    it('should merge with existing metadata', () => {
      const agent = agentService.register({
        name: 'MergeMetadataAgent',
        metadata: { existing: 'value' },
      });

      agentService.updateMetadata(agent.id, { newKey: 'newValue' });

      const updated = agentService.getById(agent.id);
      expect(updated?.metadata).toEqual({
        existing: 'value',
        newKey: 'newValue',
      });
    });

    it('should return false for non-existent agent', () => {
      const result = agentService.updateMetadata('agent-nonexistent', { key: 'value' });

      expect(result).toBe(false);
    });
  });

  describe('updatePermissions()', () => {
    it('should update agent permissions', () => {
      const agent = agentService.register({ name: 'PermissionsAgent' });
      const newPermissions: Permission[] = [
        { resource: '*', actions: ['admin'] },
      ];

      const result = agentService.updatePermissions(agent.id, newPermissions);

      expect(result).toBe(true);
      const updated = agentService.getById(agent.id);
      expect(updated?.permissions).toEqual(newPermissions);
    });

    it('should regenerate token when permissions change', () => {
      const agent = agentService.register({ name: 'TokenRegenAgent' });
      vi.clearAllMocks();

      const newPermissions: Permission[] = [
        { resource: '*', actions: ['admin'] },
      ];
      agentService.updatePermissions(agent.id, newPermissions);

      expect(mockAuthService.generateToken).toHaveBeenCalled();
    });

    it('should return false for non-existent agent', () => {
      const result = agentService.updatePermissions('agent-nonexistent', []);

      expect(result).toBe(false);
    });
  });

  describe('refreshToken()', () => {
    it('should refresh agent token', () => {
      const agent = agentService.register({ name: 'RefreshTokenAgent' });
      vi.clearAllMocks();

      const newToken = agentService.refreshToken(agent.id);

      expect(newToken).toBe('mock-token-123');
      expect(mockAuthService.generateToken).toHaveBeenCalled();
    });

    it('should return null for non-existent agent', () => {
      const result = agentService.refreshToken('agent-nonexistent');

      expect(result).toBeNull();
    });

    it('should update the stored token', () => {
      const agent = agentService.register({ name: 'UpdatedTokenAgent' });
      (mockAuthService.generateToken as ReturnType<typeof vi.fn>).mockReturnValueOnce('new-token-456');

      agentService.refreshToken(agent.id);

      const updated = agentService.getById(agent.id);
      expect(updated?.token).toBe('new-token-456');
    });
  });

  describe('connect()', () => {
    it('should mark agent as online', () => {
      const agent = agentService.register({ name: 'ConnectAgent' });

      const result = agentService.connect(agent.id);

      expect(result).toBe(true);
      expect(agentService.getById(agent.id)?.status).toBe('online');
    });

    it('should return false for non-existent agent', () => {
      const result = agentService.connect('agent-nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('disconnect()', () => {
    it('should mark agent as offline', () => {
      const agent = agentService.register({ name: 'DisconnectAgent' });
      agentService.connect(agent.id);

      const result = agentService.disconnect(agent.id);

      expect(result).toBe(true);
      expect(agentService.getById(agent.id)?.status).toBe('offline');
    });

    it('should return false for non-existent agent', () => {
      const result = agentService.disconnect('agent-nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('unregister()', () => {
    it('should remove agent from registry', () => {
      const agent = agentService.register({ name: 'UnregisterAgent' });

      const result = agentService.unregister(agent.id);

      expect(result).toBe(true);
      expect(agentService.getById(agent.id)).toBeUndefined();
    });

    it('should remove agent from name index', () => {
      const agent = agentService.register({ name: 'UnregisterNameAgent' });

      agentService.unregister(agent.id);

      expect(agentService.getByName('UnregisterNameAgent')).toBeUndefined();
    });

    it('should allow re-registering same name after unregister', () => {
      const agent1 = agentService.register({ name: 'ReRegisterAgent' });
      agentService.unregister(agent1.id);

      const agent2 = agentService.register({ name: 'ReRegisterAgent' });

      expect(agent2).toBeDefined();
      expect(agent2.name).toBe('ReRegisterAgent');
      expect(agent2.id).not.toBe(agent1.id);
    });

    it('should return false for non-existent agent', () => {
      const result = agentService.unregister('agent-nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('getCount()', () => {
    it('should return 0 when no agents registered', () => {
      expect(agentService.getCount()).toBe(0);
    });

    it('should return correct count of agents', () => {
      agentService.register({ name: 'CountAgent1' });
      agentService.register({ name: 'CountAgent2' });

      expect(agentService.getCount()).toBe(2);
    });

    it('should decrease count after unregister', () => {
      const agent = agentService.register({ name: 'CountDecreaseAgent' });
      agentService.register({ name: 'CountStayAgent' });

      agentService.unregister(agent.id);

      expect(agentService.getCount()).toBe(1);
    });
  });

  describe('validateToken()', () => {
    it('should return agent for valid token', () => {
      const registered = agentService.register({ name: 'ValidateTokenAgent' });
      // Update mock to return the correct agent ID
      (mockAuthService.verifyToken as ReturnType<typeof vi.fn>).mockReturnValue({
        agentId: registered.id,
        agentName: 'ValidateTokenAgent',
        permissions: [],
        issuedAt: Date.now(),
        expiresAt: Date.now() + 86400000,
      });

      const agent = agentService.validateToken('mock-token-123');

      expect(agent).toBeDefined();
      expect(agent?.id).toBe(registered.id);
    });

    it('should return null for invalid token', () => {
      (mockAuthService.verifyToken as ReturnType<typeof vi.fn>).mockReturnValue(null);

      const agent = agentService.validateToken('invalid-token');

      expect(agent).toBeNull();
    });

    it('should return null when token belongs to non-existent agent', () => {
      (mockAuthService.verifyToken as ReturnType<typeof vi.fn>).mockReturnValue({
        agentId: 'agent-nonexistent',
        agentName: 'Nonexistent',
        permissions: [],
        issuedAt: Date.now(),
        expiresAt: Date.now() + 86400000,
      });

      const agent = agentService.validateToken('token-for-nonexistent');

      expect(agent).toBeNull();
    });

    it('should return null when stored token does not match', () => {
      const registered = agentService.register({ name: 'MismatchTokenAgent' });
      (mockAuthService.verifyToken as ReturnType<typeof vi.fn>).mockReturnValue({
        agentId: registered.id,
        agentName: 'MismatchTokenAgent',
        permissions: [],
        issuedAt: Date.now(),
        expiresAt: Date.now() + 86400000,
      });

      const agent = agentService.validateToken('different-token');

      expect(agent).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle empty string name', () => {
      const agent = agentService.register({ name: '' });

      expect(agent.name).toBe('');
    });

    it('should handle special characters in name', () => {
      const agent = agentService.register({ name: 'Agent@#$%^&*()' });

      expect(agent.name).toBe('Agent@#$%^&*()');
      expect(agentService.getByName('Agent@#$%^&*()')).toBeDefined();
    });

    it('should handle very long name', () => {
      const longName = 'A'.repeat(1000);
      const agent = agentService.register({ name: longName });

      expect(agent.name).toBe(longName);
    });

    it('should handle unicode characters in name', () => {
      const agent = agentService.register({ name: 'Agent-日本語-🚀' });

      expect(agent.name).toBe('Agent-日本語-🚀');
      expect(agentService.getByName('Agent-日本語-🚀')).toBeDefined();
    });

    it('should handle complex metadata objects', () => {
      const complexMetadata = {
        nested: {
          deeply: {
            value: 'test',
          },
        },
        array: [1, 2, 3],
        mixed: [{ key: 'value' }, 'string', 42],
      };

      const agent = agentService.register({
        name: 'ComplexMetadataAgent',
        metadata: complexMetadata,
      });

      expect(agent.metadata).toEqual(complexMetadata);
    });
  });
});
