/**
 * PresenceService Unit Tests
 * Covers connection lifecycle, heartbeats, typing, channel membership, and status/activity changes
 */

import { describe, it, expect, beforeEach, afterEach, vi, type MockedFunction } from 'vitest';
import PresenceService from './presence-service.js';
import { PresenceStatus } from '../schemas/models.js';
import type { RelayClient } from '../relay/relay-client.js';
import type { WSMessage } from '../models/types.js';

// Mock type that includes vitest mock properties
interface MockedRelayClient {
  broadcast: MockedFunction<(message: WSMessage<unknown>) => void>;
  broadcastToChannel: MockedFunction<(channelId: string, message: WSMessage<unknown>) => void>;
}

describe('PresenceService', () => {
  const projectId = 'proj-123';
  let relayClientMock: MockedRelayClient;
  let service: PresenceService;

  beforeEach(() => {
    vi.useFakeTimers();
    relayClientMock = {
      broadcast: vi.fn(),
      broadcastToChannel: vi.fn(),
    };

    service = new PresenceService(projectId, relayClientMock as unknown as RelayClient);
  });

  afterEach(() => {
    service.stop();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('connect()', () => {
    it('registers presence with defaults and broadcasts online', () => {
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

      const presence = service.connect('agent-1', { clientType: 'cli', ipAddress: '127.0.0.1' });

      expect(presence.agentId).toBe('agent-1');
      expect(presence.projectId).toBe(projectId);
      expect(presence.status).toBe(PresenceStatus.ONLINE);
      expect(presence.lastHeartbeat).toBe(new Date('2026-01-01T00:00:00Z').toISOString());
      expect(presence.activeChannels).toEqual([]);
      expect(presence.isTyping).toBe(false);
      expect(presence.connection.connectionId).toBeDefined();
      expect(service.get('agent-1')).toEqual(presence);
      expect(relayClientMock.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ agentId: 'agent-1', status: PresenceStatus.ONLINE }),
        })
      );
    });

    it('reconnect overwrites prior connection for same agent', () => {
      const first = service.connect('agent-1', { connectionId: 'conn-1', clientVersion: '1.0.0' });
      relayClientMock.broadcast.mockClear();

      const second = service.connect('agent-1', { connectionId: 'conn-2', clientVersion: '1.1.0' });

      expect(service.getAll()).toHaveLength(1);
      expect(service.get('agent-1')?.connection.connectionId).toBe('conn-2');
      expect(second.connection.clientVersion).toBe('1.1.0');
      expect(relayClientMock.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ agentId: 'agent-1', status: PresenceStatus.ONLINE }),
        })
      );
      expect(first.connection.connectionId).toBe('conn-1');
    });
  });

  describe('disconnect()', () => {
    it('marks agent offline, broadcasts, and removes presence', () => {
      service.connect('agent-1');
      relayClientMock.broadcast.mockClear();

      service.disconnect('agent-1', 'graceful');

      expect(service.get('agent-1')).toBeUndefined();
      expect(relayClientMock.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ agentId: 'agent-1', status: PresenceStatus.OFFLINE, reason: 'graceful' }),
        })
      );
    });
  });

  describe('setStatus()', () => {
    it('returns false when presence does not exist', () => {
      expect(service.setStatus('missing', PresenceStatus.BUSY)).toBe(false);
      expect(relayClientMock.broadcast).not.toHaveBeenCalled();
    });

    it('updates status, statusMessage, lastHeartbeat, and broadcasts on change', () => {
      service.connect('agent-1');
      relayClientMock.broadcast.mockClear();
      vi.setSystemTime(new Date('2026-02-01T00:00:00Z'));

      const changed = service.setStatus('agent-1', PresenceStatus.BUSY, 'focusing');
      const updated = service.get('agent-1')!;

      expect(changed).toBe(true);
      expect(updated.status).toBe(PresenceStatus.BUSY);
      expect(updated.statusMessage).toBe('focusing');
      expect(updated.lastHeartbeat).toBe(new Date('2026-02-01T00:00:00Z').toISOString());
      expect(relayClientMock.broadcast).toHaveBeenCalledTimes(1);

      // Same status should not broadcast again
      const count = relayClientMock.broadcast.mock.calls.length;
      service.setStatus('agent-1', PresenceStatus.BUSY, 'still busy');
      expect(relayClientMock.broadcast).toHaveBeenCalledTimes(count);
      expect(service.get('agent-1')?.statusMessage).toBe('still busy');
    });
  });

  describe('heartbeat()', () => {
    it('returns false when presence missing', () => {
      expect(service.heartbeat('unknown')).toBe(false);
    });

    it('updates lastHeartbeat, active channels, and restores from idle', () => {
      service.connect('agent-1');
      service.setStatus('agent-1', PresenceStatus.IDLE);
      relayClientMock.broadcast.mockClear();
      vi.setSystemTime(new Date('2026-03-01T00:00:00Z'));

      const ok = service.heartbeat('agent-1', ['ch-1', 'ch-2']);
      const updated = service.get('agent-1')!;

      expect(ok).toBe(true);
      expect(updated.lastHeartbeat).toBe(new Date('2026-03-01T00:00:00Z').toISOString());
      expect(updated.activeChannels).toEqual(['ch-1', 'ch-2']);
      expect(updated.status).toBe(PresenceStatus.ONLINE);
      expect(relayClientMock.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ agentId: 'agent-1', status: PresenceStatus.ONLINE }),
        })
      );
    });

    it('does not change BUSY status on heartbeat', () => {
      service.connect('agent-1');
      service.setStatus('agent-1', PresenceStatus.BUSY);
      relayClientMock.broadcast.mockClear();

      const ok = service.heartbeat('agent-1');

      expect(ok).toBe(true);
      expect(service.get('agent-1')?.status).toBe(PresenceStatus.BUSY);
      expect(relayClientMock.broadcast).not.toHaveBeenCalled();
    });
  });

  describe('activity lifecycle', () => {
    it('returns false when starting activity for unknown agent', () => {
      expect(service.startActivity('missing', 'working', 'desc')).toBe(false);
    });

    it('startActivity sets activity, status busy, and endActivity clears it', () => {
      vi.setSystemTime(new Date('2026-04-01T00:00:00Z'));
      service.connect('agent-1');
      relayClientMock.broadcast.mockClear();

      const started = service.startActivity('agent-1', 'working', 'building', 'ctx-1');
      const withActivity = service.get('agent-1')!;

      expect(started).toBe(true);
      expect(withActivity.activity).toMatchObject({
        type: 'working',
        description: 'building',
        contextId: 'ctx-1',
        startedAt: new Date('2026-04-01T00:00:00Z').toISOString(),
      });
      expect(withActivity.status).toBe(PresenceStatus.BUSY);
      expect(relayClientMock.broadcast).toHaveBeenCalled();

      relayClientMock.broadcast.mockClear();
      const ended = service.endActivity('agent-1');
      const afterEnd = service.get('agent-1')!;

      expect(ended).toBe(true);
      expect(afterEnd.activity).toBeUndefined();
      expect(afterEnd.status).toBe(PresenceStatus.ONLINE);
      expect(relayClientMock.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: PresenceStatus.ONLINE }),
        })
      );
    });
  });

  describe('setTyping()', () => {
    it('returns false when presence missing', () => {
      expect(service.setTyping('missing', 'ch-1', true)).toBe(false);
    });

    it('toggles typing state and broadcasts start/stop', () => {
      service.connect('agent-1');
      relayClientMock.broadcastToChannel.mockClear();

      const started = service.setTyping('agent-1', 'ch-1', true);
      expect(started).toBe(true);
      expect(service.get('agent-1')?.isTyping).toBe(true);
      expect(service.get('agent-1')?.typingInChannel).toBe('ch-1');
      expect(relayClientMock.broadcastToChannel).toHaveBeenCalledWith(
        'ch-1',
        expect.objectContaining({ data: expect.objectContaining({ agentId: 'agent-1', isTyping: true }) })
      );

      relayClientMock.broadcastToChannel.mockClear();
      const stopped = service.setTyping('agent-1', 'ch-1', false);
      expect(stopped).toBe(true);
      expect(service.get('agent-1')?.isTyping).toBe(false);
      expect(relayClientMock.broadcastToChannel).toHaveBeenCalledWith(
        'ch-1',
        expect.objectContaining({ data: expect.objectContaining({ agentId: 'agent-1', isTyping: false }) })
      );
    });

    it('auto clears typing indicator after timeout', () => {
      service.connect('agent-1');
      relayClientMock.broadcastToChannel.mockClear();

      service.setTyping('agent-1', 'ch-2', true);
      vi.advanceTimersByTime(10000);

      expect(service.get('agent-1')?.isTyping).toBe(false);
      expect(relayClientMock.broadcastToChannel).toHaveBeenCalledTimes(2);
      expect(relayClientMock.broadcastToChannel).toHaveBeenLastCalledWith(
        'ch-2',
        expect.objectContaining({ data: expect.objectContaining({ agentId: 'agent-1', isTyping: false }) })
      );
    });
  });

  describe('channel membership', () => {
    it('joinChannel and leaveChannel update activeChannels and handle duplicates', () => {
      service.connect('agent-1');

      expect(service.joinChannel('agent-1', 'ch-1')).toBe(true);
      expect(service.joinChannel('agent-1', 'ch-1')).toBe(true);
      expect(service.get('agent-1')?.activeChannels).toEqual(['ch-1']);

      expect(service.leaveChannel('agent-1', 'ch-1')).toBe(true);
      expect(service.get('agent-1')?.activeChannels).toEqual([]);
    });

    it('returns false when joining/leaving without presence', () => {
      expect(service.joinChannel('missing', 'ch-1')).toBe(false);
      expect(service.leaveChannel('missing', 'ch-1')).toBe(false);
    });
  });

  describe('queries', () => {
    it('getAll, getOnline, and getInChannel reflect current state', () => {
      service.connect('agent-1');
      service.connect('agent-2');
      service.setStatus('agent-2', PresenceStatus.IDLE);
      service.disconnect('agent-1');
      service.joinChannel('agent-2', 'ch-1');

      const all = service.getAll();
      expect(all.map(p => p.agentId).sort()).toEqual(['agent-2']);

      const online = service.getOnline();
      expect(online.map(p => p.agentId)).toEqual(['agent-2']);

      const inChannel = service.getInChannel('ch-1');
      expect(inChannel.map(p => p.agentId)).toEqual(['agent-2']);
    });
  });

  describe('heartbeat checker', () => {
    it('transitions to idle then offline when heartbeats stop', () => {
      service.connect('agent-1');
      relayClientMock.broadcast.mockClear();

      // After 90s (> IDLE_TIMEOUT) status should become idle
      vi.advanceTimersByTime(90000);
      expect(service.get('agent-1')?.status).toBe(PresenceStatus.IDLE);
      expect(relayClientMock.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ agentId: 'agent-1', status: PresenceStatus.IDLE }),
        })
      );

      relayClientMock.broadcast.mockClear();
      // Advance another 2.5 minutes to exceed OFFLINE_TIMEOUT from last heartbeat
      vi.advanceTimersByTime(150000);
      expect(service.get('agent-1')).toBeUndefined();
      expect(relayClientMock.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ agentId: 'agent-1', status: PresenceStatus.OFFLINE, reason: 'timeout' }),
        })
      );
    });
  });
});
