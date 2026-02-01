/**
 * ChannelService Unit Tests
 * Comprehensive tests covering channel creation, membership, and access control
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChannelService, type ChannelCreateInput } from './channel-service.js';
import { ChannelType, ChannelAccessLevel } from '../schemas/models.js';
import type { RelayClient } from '../relay/relay-client.js';

// Mock RelayClient
const mockRelayClient = {
  subscribeToChannel: vi.fn(),
  unsubscribeFromChannel: vi.fn(),
} as unknown as RelayClient;

describe('ChannelService', () => {
  let channelService: ChannelService;
  const projectId = 'project-123';

  beforeEach(() => {
    vi.clearAllMocks();
    channelService = new ChannelService(projectId, mockRelayClient);
  });

  describe('constructor', () => {
    it('should create default channels on initialization', () => {
      const channels = channelService.getAll();

      // Should have #general and #announcements
      expect(channels).toHaveLength(2);
      expect(channelService.getByName('general')).toBeDefined();
      expect(channelService.getByName('announcements')).toBeDefined();
    });

    it('should set up #general as PUBLIC channel', () => {
      const general = channelService.getByName('general');

      expect(general?.type).toBe(ChannelType.PUBLIC);
      expect(general?.metadata.topic).toBe('General discussion for all agents');
    });

    it('should set up #announcements as BROADCAST channel', () => {
      const announcements = channelService.getByName('announcements');

      expect(announcements?.type).toBe(ChannelType.BROADCAST);
      expect(announcements?.metadata.topic).toBe('System-wide announcements');
    });

    it('should work without RelayClient', () => {
      const serviceWithoutRelay = new ChannelService(projectId);

      expect(serviceWithoutRelay.getAll()).toHaveLength(2);
    });
  });

  describe('create()', () => {
    it('should create a new channel with minimal input', () => {
      const input: ChannelCreateInput = { name: 'test-channel' };
      const channel = channelService.create(input, 'agent-1');

      expect(channel).toBeDefined();
      expect(channel.name).toBe('test-channel');
      expect(channel.id).toMatch(/^ch-/);
      expect(channel.projectId).toBe(projectId);
      expect(channel.type).toBe(ChannelType.PUBLIC);
      expect(channel.createdBy).toBe('agent-1');
      expect(channel.memberCount).toBe(0);
    });

    it('should create a channel with full input', () => {
      const input: ChannelCreateInput = {
        name: 'full-channel',
        type: ChannelType.PRIVATE,
        topic: 'A private channel',
        metadata: {
          displayName: 'Full Channel',
          purpose: 'Testing purposes',
          isArchived: false,
          allowExternal: true,
        },
      };
      const channel = channelService.create(input, 'agent-2');

      expect(channel.name).toBe('full-channel');
      expect(channel.type).toBe(ChannelType.PRIVATE);
      expect(channel.metadata.topic).toBe('A private channel');
      expect(channel.metadata.allowExternal).toBe(true);
    });

    it('should throw error for duplicate channel name', () => {
      channelService.create({ name: 'duplicate-channel' }, 'agent-1');

      expect(() => {
        channelService.create({ name: 'duplicate-channel' }, 'agent-2');
      }).toThrow('Channel "duplicate-channel" already exists');
    });

    it('should set correct access rules for PUBLIC channel', () => {
      const channel = channelService.create(
        { name: 'public-test', type: ChannelType.PUBLIC },
        'agent-1'
      );

      expect(channel.accessRules).toHaveLength(1);
      expect(channel.accessRules[0]).toEqual({
        principal: '*',
        principalType: 'all',
        level: ChannelAccessLevel.WRITE,
      });
      expect(channel.defaultAccess).toBe(ChannelAccessLevel.READ);
    });

    it('should set correct access rules for PRIVATE channel', () => {
      const channel = channelService.create(
        { name: 'private-test', type: ChannelType.PRIVATE },
        'agent-1'
      );

      expect(channel.accessRules).toHaveLength(0);
      expect(channel.defaultAccess).toBeNull();
    });

    it('should set correct access rules for BROADCAST channel', () => {
      const channel = channelService.create(
        { name: 'broadcast-test', type: ChannelType.BROADCAST },
        'agent-1'
      );

      expect(channel.accessRules).toHaveLength(1);
      expect(channel.accessRules[0].level).toBe(ChannelAccessLevel.READ);
    });

    it('should set correct access rules for DIRECT channel', () => {
      const channel = channelService.create(
        { name: 'direct-test', type: ChannelType.DIRECT },
        'agent-1'
      );

      expect(channel.accessRules).toHaveLength(0);
    });
  });

  describe('getById()', () => {
    it('should return channel by ID', () => {
      const created = channelService.create({ name: 'get-by-id' }, 'agent-1');
      const found = channelService.getById(created.id);

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
    });

    it('should return undefined for non-existent ID', () => {
      const found = channelService.getById('ch-nonexistent');

      expect(found).toBeUndefined();
    });
  });

  describe('getByName()', () => {
    it('should return channel by name', () => {
      channelService.create({ name: 'get-by-name' }, 'agent-1');
      const found = channelService.getByName('get-by-name');

      expect(found).toBeDefined();
      expect(found?.name).toBe('get-by-name');
    });

    it('should return undefined for non-existent name', () => {
      const found = channelService.getByName('nonexistent-channel');

      expect(found).toBeUndefined();
    });
  });

  describe('getAll()', () => {
    it('should return all channels including defaults', () => {
      channelService.create({ name: 'custom-1' }, 'agent-1');
      channelService.create({ name: 'custom-2' }, 'agent-1');

      const channels = channelService.getAll();

      // 2 default + 2 custom
      expect(channels).toHaveLength(4);
    });
  });

  describe('getPublic()', () => {
    it('should return only public channels', () => {
      channelService.create({ name: 'public-1', type: ChannelType.PUBLIC }, 'agent-1');
      channelService.create({ name: 'private-1', type: ChannelType.PRIVATE }, 'agent-1');

      const publicChannels = channelService.getPublic();

      // #general (default) + public-1
      expect(publicChannels).toHaveLength(2);
      expect(publicChannels.every(c => c.type === ChannelType.PUBLIC)).toBe(true);
    });
  });

  describe('join()', () => {
    it('should add agent to channel', () => {
      const channel = channelService.create({ name: 'join-test' }, 'agent-1');

      const result = channelService.join(channel.id, 'agent-2');

      expect(result).toBe(true);
      expect(channelService.isMember(channel.id, 'agent-2')).toBe(true);
    });

    it('should update member count', () => {
      const channel = channelService.create({ name: 'member-count-test' }, 'agent-1');

      channelService.join(channel.id, 'agent-2');
      channelService.join(channel.id, 'agent-3');

      const updated = channelService.getById(channel.id);
      expect(updated?.memberCount).toBe(2);
    });

    it('should not duplicate membership', () => {
      const channel = channelService.create({ name: 'no-duplicate-test' }, 'agent-1');

      channelService.join(channel.id, 'agent-2');
      channelService.join(channel.id, 'agent-2');

      const updated = channelService.getById(channel.id);
      expect(updated?.memberCount).toBe(1);
    });

    it('should notify RelayClient on join', () => {
      const channel = channelService.create({ name: 'relay-join-test' }, 'agent-1');

      channelService.join(channel.id, 'agent-2');

      expect(mockRelayClient.subscribeToChannel).toHaveBeenCalledWith('agent-2', channel.id);
    });

    it('should return false for non-existent channel', () => {
      const result = channelService.join('ch-nonexistent', 'agent-1');

      expect(result).toBe(false);
    });

    it('should throw error when joining private channel without access', () => {
      const channel = channelService.create(
        { name: 'private-join-test', type: ChannelType.PRIVATE },
        'agent-1'
      );

      expect(() => {
        channelService.join(channel.id, 'agent-2');
      }).toThrow('Permission denied: cannot join channel');
    });
  });

  describe('leave()', () => {
    it('should remove agent from channel', () => {
      const channel = channelService.create({ name: 'leave-test' }, 'agent-1');
      channelService.join(channel.id, 'agent-2');

      const result = channelService.leave(channel.id, 'agent-2');

      expect(result).toBe(true);
      expect(channelService.isMember(channel.id, 'agent-2')).toBe(false);
    });

    it('should update member count on leave', () => {
      const channel = channelService.create({ name: 'leave-count-test' }, 'agent-1');
      channelService.join(channel.id, 'agent-2');
      channelService.join(channel.id, 'agent-3');

      channelService.leave(channel.id, 'agent-2');

      const updated = channelService.getById(channel.id);
      expect(updated?.memberCount).toBe(1);
    });

    it('should notify RelayClient on leave', () => {
      const channel = channelService.create({ name: 'relay-leave-test' }, 'agent-1');
      channelService.join(channel.id, 'agent-2');

      channelService.leave(channel.id, 'agent-2');

      expect(mockRelayClient.unsubscribeFromChannel).toHaveBeenCalledWith('agent-2', channel.id);
    });

    it('should return false for non-existent channel', () => {
      const result = channelService.leave('ch-nonexistent', 'agent-1');

      expect(result).toBe(false);
    });

    it('should handle leaving when not a member', () => {
      const channel = channelService.create({ name: 'not-member-leave' }, 'agent-1');

      const result = channelService.leave(channel.id, 'agent-2');

      expect(result).toBe(true); // Still returns true, just no-op
    });
  });

  describe('getMembers()', () => {
    it('should return all members of a channel', () => {
      const channel = channelService.create({ name: 'get-members-test' }, 'agent-1');
      channelService.join(channel.id, 'agent-2');
      channelService.join(channel.id, 'agent-3');

      const members = channelService.getMembers(channel.id);

      expect(members).toHaveLength(2);
      expect(members.sort()).toEqual(['agent-2', 'agent-3']);
    });

    it('should return empty array for channel with no members', () => {
      const channel = channelService.create({ name: 'no-members-test' }, 'agent-1');

      const members = channelService.getMembers(channel.id);

      expect(members).toEqual([]);
    });

    it('should return empty array for non-existent channel', () => {
      const members = channelService.getMembers('ch-nonexistent');

      expect(members).toEqual([]);
    });
  });

  describe('isMember()', () => {
    it('should return true when agent is member', () => {
      const channel = channelService.create({ name: 'is-member-test' }, 'agent-1');
      channelService.join(channel.id, 'agent-2');

      expect(channelService.isMember(channel.id, 'agent-2')).toBe(true);
    });

    it('should return false when agent is not member', () => {
      const channel = channelService.create({ name: 'not-member-test' }, 'agent-1');

      expect(channelService.isMember(channel.id, 'agent-2')).toBe(false);
    });

    it('should return false for non-existent channel', () => {
      expect(channelService.isMember('ch-nonexistent', 'agent-1')).toBe(false);
    });
  });

  describe('checkAccess()', () => {
    it('should grant access based on wildcard rule', () => {
      const channel = channelService.create(
        { name: 'wildcard-access-test', type: ChannelType.PUBLIC },
        'agent-1'
      );

      const hasRead = channelService.checkAccess(channel.id, 'any-agent', ChannelAccessLevel.READ);
      const hasWrite = channelService.checkAccess(channel.id, 'any-agent', ChannelAccessLevel.WRITE);

      expect(hasRead).toBe(true);
      expect(hasWrite).toBe(true);
    });

    it('should deny access to private channel without rule', () => {
      const channel = channelService.create(
        { name: 'private-access-test', type: ChannelType.PRIVATE },
        'agent-1'
      );

      const hasAccess = channelService.checkAccess(channel.id, 'any-agent', ChannelAccessLevel.READ);

      expect(hasAccess).toBe(false);
    });

    it('should grant access based on specific agent rule', () => {
      const channel = channelService.create(
        { name: 'agent-rule-test', type: ChannelType.PRIVATE },
        'agent-1'
      );
      channelService.addAccessRule(channel.id, {
        principal: 'agent-2',
        principalType: 'agent',
        level: ChannelAccessLevel.WRITE,
      });

      expect(channelService.checkAccess(channel.id, 'agent-2', ChannelAccessLevel.READ)).toBe(true);
      expect(channelService.checkAccess(channel.id, 'agent-2', ChannelAccessLevel.WRITE)).toBe(true);
      expect(channelService.checkAccess(channel.id, 'agent-3', ChannelAccessLevel.READ)).toBe(false);
    });

    it('should return false for non-existent channel', () => {
      const hasAccess = channelService.checkAccess('ch-nonexistent', 'agent-1', ChannelAccessLevel.READ);

      expect(hasAccess).toBe(false);
    });

    it('should check access levels correctly (READ < WRITE < ADMIN)', () => {
      const channel = channelService.create(
        { name: 'access-level-test', type: ChannelType.PRIVATE },
        'agent-1'
      );
      channelService.addAccessRule(channel.id, {
        principal: 'agent-read',
        principalType: 'agent',
        level: ChannelAccessLevel.READ,
      });
      channelService.addAccessRule(channel.id, {
        principal: 'agent-admin',
        principalType: 'agent',
        level: ChannelAccessLevel.ADMIN,
      });

      // READ agent can only read
      expect(channelService.checkAccess(channel.id, 'agent-read', ChannelAccessLevel.READ)).toBe(true);
      expect(channelService.checkAccess(channel.id, 'agent-read', ChannelAccessLevel.WRITE)).toBe(false);
      expect(channelService.checkAccess(channel.id, 'agent-read', ChannelAccessLevel.ADMIN)).toBe(false);

      // ADMIN agent can do everything
      expect(channelService.checkAccess(channel.id, 'agent-admin', ChannelAccessLevel.READ)).toBe(true);
      expect(channelService.checkAccess(channel.id, 'agent-admin', ChannelAccessLevel.WRITE)).toBe(true);
      expect(channelService.checkAccess(channel.id, 'agent-admin', ChannelAccessLevel.ADMIN)).toBe(true);
    });

    it('should use default access when no rule matches', () => {
      // Get #general which has default READ access
      const general = channelService.getByName('general');

      // Should have access via default
      expect(channelService.checkAccess(general!.id, 'unknown-agent', ChannelAccessLevel.READ)).toBe(true);
    });
  });

  describe('update()', () => {
    it('should update channel metadata', () => {
      const channel = channelService.create({ name: 'update-test' }, 'agent-1');

      const result = channelService.update(channel.id, { topic: 'New topic' });

      expect(result).toBe(true);
      const updated = channelService.getById(channel.id);
      expect(updated?.metadata.topic).toBe('New topic');
    });

    it('should merge with existing metadata', () => {
      const channel = channelService.create(
        { name: 'merge-update-test', topic: 'Original topic' },
        'agent-1'
      );

      channelService.update(channel.id, { purpose: 'Testing' });

      const updated = channelService.getById(channel.id);
      expect(updated?.metadata.topic).toBe('Original topic');
      expect(updated?.metadata.purpose).toBe('Testing');
    });

    it('should return false for non-existent channel', () => {
      const result = channelService.update('ch-nonexistent', { topic: 'Test' });

      expect(result).toBe(false);
    });
  });

  describe('addAccessRule()', () => {
    it('should add access rule to channel', () => {
      const channel = channelService.create(
        { name: 'add-rule-test', type: ChannelType.PRIVATE },
        'agent-1'
      );

      const result = channelService.addAccessRule(channel.id, {
        principal: 'agent-2',
        principalType: 'agent',
        level: ChannelAccessLevel.READ,
      });

      expect(result).toBe(true);
      const updated = channelService.getById(channel.id);
      expect(updated?.accessRules).toHaveLength(1);
    });

    it('should return false for non-existent channel', () => {
      const result = channelService.addAccessRule('ch-nonexistent', {
        principal: 'agent-1',
        principalType: 'agent',
        level: ChannelAccessLevel.READ,
      });

      expect(result).toBe(false);
    });
  });

  describe('delete()', () => {
    it('should delete a channel', () => {
      const channel = channelService.create({ name: 'delete-test' }, 'agent-1');

      const result = channelService.delete(channel.id);

      expect(result).toBe(true);
      expect(channelService.getById(channel.id)).toBeUndefined();
    });

    it('should remove from name index', () => {
      const channel = channelService.create({ name: 'delete-name-test' }, 'agent-1');

      channelService.delete(channel.id);

      expect(channelService.getByName('delete-name-test')).toBeUndefined();
    });

    it('should allow re-creating channel with same name after delete', () => {
      const channel1 = channelService.create({ name: 'recreate-test' }, 'agent-1');
      channelService.delete(channel1.id);

      const channel2 = channelService.create({ name: 'recreate-test' }, 'agent-2');

      expect(channel2).toBeDefined();
      expect(channel2.id).not.toBe(channel1.id);
    });

    it('should return false for non-existent channel', () => {
      const result = channelService.delete('ch-nonexistent');

      expect(result).toBe(false);
    });

    it('should clear memberships on delete', () => {
      const channel = channelService.create({ name: 'clear-members-test' }, 'agent-1');
      channelService.join(channel.id, 'agent-2');

      channelService.delete(channel.id);

      // Create new channel with same ID would have different memberships
      expect(channelService.getMembers(channel.id)).toEqual([]);
    });
  });

  describe('getCount()', () => {
    it('should return correct count including defaults', () => {
      expect(channelService.getCount()).toBe(2); // general + announcements
    });

    it('should increase count after creating channels', () => {
      channelService.create({ name: 'count-test-1' }, 'agent-1');
      channelService.create({ name: 'count-test-2' }, 'agent-1');

      expect(channelService.getCount()).toBe(4);
    });

    it('should decrease count after deleting channel', () => {
      const channel = channelService.create({ name: 'count-delete-test' }, 'agent-1');

      channelService.delete(channel.id);

      expect(channelService.getCount()).toBe(2);
    });
  });

  describe('getAccessibleChannels()', () => {
    it('should return channels agent has access to', () => {
      // Public channel - everyone has access
      channelService.create({ name: 'public-accessible', type: ChannelType.PUBLIC }, 'agent-1');

      // Private channel - no access by default
      channelService.create({ name: 'private-no-access', type: ChannelType.PRIVATE }, 'agent-1');

      const accessible = channelService.getAccessibleChannels('agent-2');

      // Should include: general, announcements (broadcast has read access), public-accessible
      expect(accessible.length).toBeGreaterThanOrEqual(3);
      expect(accessible.find(c => c.name === 'private-no-access')).toBeUndefined();
    });
  });

  describe('getJoinedChannels()', () => {
    it('should return channels agent is member of', () => {
      const channel1 = channelService.create({ name: 'joined-1' }, 'agent-1');
      const channel2 = channelService.create({ name: 'joined-2' }, 'agent-1');
      channelService.create({ name: 'not-joined' }, 'agent-1');

      channelService.join(channel1.id, 'agent-2');
      channelService.join(channel2.id, 'agent-2');

      const joined = channelService.getJoinedChannels('agent-2');

      expect(joined).toHaveLength(2);
      expect(joined.map(c => c.name).sort()).toEqual(['joined-1', 'joined-2']);
    });

    it('should return empty array when agent has not joined any channels', () => {
      const joined = channelService.getJoinedChannels('agent-no-joins');

      expect(joined).toEqual([]);
    });
  });

  describe('edge cases', () => {
    it('should handle empty channel name', () => {
      const channel = channelService.create({ name: '' }, 'agent-1');

      expect(channel.name).toBe('');
    });

    it('should handle special characters in channel name', () => {
      const channel = channelService.create({ name: 'channel-with_special.chars' }, 'agent-1');

      expect(channel.name).toBe('channel-with_special.chars');
      expect(channelService.getByName('channel-with_special.chars')).toBeDefined();
    });

    it('should handle unicode characters in channel name', () => {
      const channel = channelService.create({ name: 'channel-日本語-🚀' }, 'agent-1');

      expect(channel.name).toBe('channel-日本語-🚀');
      expect(channelService.getByName('channel-日本語-🚀')).toBeDefined();
    });

    it('should handle channel with many members', () => {
      const channel = channelService.create({ name: 'many-members-test' }, 'agent-1');

      for (let i = 0; i < 100; i++) {
        channelService.join(channel.id, `agent-${i}`);
      }

      expect(channelService.getById(channel.id)?.memberCount).toBe(100);
      expect(channelService.getMembers(channel.id)).toHaveLength(100);
    });

    it('should handle multiple access rules', () => {
      const channel = channelService.create(
        { name: 'multi-rule-test', type: ChannelType.PRIVATE },
        'agent-1'
      );

      for (let i = 0; i < 10; i++) {
        channelService.addAccessRule(channel.id, {
          principal: `agent-${i}`,
          principalType: 'agent',
          level: ChannelAccessLevel.READ,
        });
      }

      expect(channelService.getById(channel.id)?.accessRules).toHaveLength(10);
      expect(channelService.checkAccess(channel.id, 'agent-5', ChannelAccessLevel.READ)).toBe(true);
    });
  });
});
