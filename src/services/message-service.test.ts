/**
 * MessageService Unit Tests
 * Exercises message creation, indexing, delivery state, integrity, and search
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import MessageService, { MessageSendInput } from './message-service.js';
import {
  ChannelAccessLevel,
  MessageDeliveryStatus,
  MessageType,
} from '../schemas/models.js';
import type { RelayClient } from '../relay/relay-client.js';
import type { ChannelService } from './channel-service.js';

describe('MessageService', () => {
  const projectId = 'proj-123';
  let relayClientMock: RelayClient;
  let channelServiceMock: ChannelService;
  let service: MessageService;

  beforeEach(() => {
    vi.useFakeTimers();
    process.env.MESSAGE_SIGNING_KEY = 'test-signing-key';

    relayClientMock = {
      broadcastToChannel: vi.fn(),
      sendToAgent: vi.fn(),
      broadcast: vi.fn(),
      emitRelayEvent: vi.fn(),
    } as unknown as RelayClient;

    channelServiceMock = {
      checkAccess: vi.fn().mockReturnValue(true),
    } as unknown as ChannelService;

    service = new MessageService(projectId, relayClientMock, channelServiceMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  const send = (input: Partial<MessageSendInput> & { targetId: string; targetType: 'channel' | 'agent' | 'broadcast'; text: string }, senderId = 'agent-1') =>
    service.send(
      {
        type: MessageType.TEXT,
        ...input,
      },
      senderId
    );

  describe('send()', () => {
    it('stores and indexes channel messages, extracts mentions, and broadcasts', () => {
      (channelServiceMock.checkAccess as any).mockReturnValue(true);
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

      const message = send({ targetId: 'ch-1', targetType: 'channel', text: 'Hello @all team' });

      expect(service.getById(message.id)).toBe(message);
      expect(message.projectId).toBe(projectId);
      expect(message.deliveryStatus).toBe(MessageDeliveryStatus.SENT);
      expect(message.content.mentions).toEqual([
        { type: 'all', startIndex: 6, length: 4 },
      ]);
      expect(relayClientMock.broadcastToChannel).toHaveBeenCalledWith(
        'ch-1',
        expect.objectContaining({
          type: 'message',
          data: message,
        })
      );
      expect(channelServiceMock.checkAccess).toHaveBeenCalledWith('ch-1', 'agent-1', ChannelAccessLevel.WRITE);
    });

    it('extracts multiple @mentions including @here and users', () => {
      const message = send({
        targetId: 'ch-1',
        targetType: 'channel',
        text: 'Hi @here ping @alice and @bob',
      });

      expect(message.content.mentions).toEqual([
        { type: 'all', startIndex: 3, length: 5 },
        { type: 'agent', startIndex: 14, length: 6 },
        { type: 'agent', startIndex: 25, length: 4 },
      ]);
    });

    it('throws when channel write access is denied', () => {
      (channelServiceMock.checkAccess as any).mockReturnValue(false);

      expect(() =>
        send({ targetId: 'ch-locked', targetType: 'channel', text: 'blocked' })
      ).toThrow('Permission denied: cannot send to this channel');
    });

    it('routes direct messages via relay sendToAgent', () => {
      const message = send({ targetId: 'agent-2', targetType: 'agent', text: 'ping' });

      expect(relayClientMock.sendToAgent).toHaveBeenCalledWith(
        'agent-2',
        expect.objectContaining({
          type: 'message',
          data: message,
        })
      );
    });

    it('routes broadcast messages via relay broadcast', () => {
      const message = send({ targetId: '*', targetType: 'broadcast', text: 'hello world' });

      expect(relayClientMock.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'message',
          data: message,
        })
      );
    });
  });

  describe('getById()', () => {
    it('returns undefined for unknown id', () => {
      expect(service.getById('missing')).toBeUndefined();
    });
  });

  describe('getChannelMessages()', () => {
    it('sorts by sentAt desc, respects limit and before cursor, and omits deleted', () => {
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      const first = send({ targetId: 'ch-1', targetType: 'channel', text: 'first' });

      vi.setSystemTime(new Date('2026-01-01T00:00:10Z'));
      const second = send({ targetId: 'ch-1', targetType: 'channel', text: 'second' });

      vi.setSystemTime(new Date('2026-01-01T00:00:20Z'));
      const third = send({ targetId: 'ch-1', targetType: 'channel', text: 'third' });

      service.delete(second.id, 'agent-1');

      const all = service.getChannelMessages('ch-1');
      expect(all.map(m => m.id)).toEqual([third.id, first.id]);

      const limited = service.getChannelMessages('ch-1', 1);
      expect(limited).toHaveLength(1);
      expect(limited[0].id).toBe(third.id);

      const beforeSecond = service.getChannelMessages('ch-1', 5, second.id);
      expect(beforeSecond.map(m => m.id)).toEqual([first.id]);
    });
  });

  describe('getThreadMessages()', () => {
    it('returns chronological messages in a thread and skips deleted ones', () => {
      vi.setSystemTime(new Date('2026-02-01T00:00:00Z'));
      const threadId = 'thread-1';
      const m1 = send({ targetId: 'ch-1', targetType: 'channel', threadId, text: 'm1' });
      vi.setSystemTime(new Date('2026-02-01T00:00:05Z'));
      const m2 = send({ targetId: 'ch-1', targetType: 'channel', threadId, text: 'm2' });

      service.delete(m1.id, 'agent-1');

      const threadMessages = service.getThreadMessages(threadId);
      expect(threadMessages.map(m => m.id)).toEqual([m2.id]);
      expect(threadMessages[0].sentAt <= m2.sentAt).toBe(true);
    });
  });

  describe('edit()', () => {
    it('returns false when message not found', () => {
      expect(service.edit('missing', 'updated', 'agent-1')).toBe(false);
    });

    it('throws when editor is not the sender', () => {
      const message = send({ targetId: 'ch-1', targetType: 'channel', text: 'hello' }, 'agent-1');

      expect(() => service.edit(message.id, 'hack', 'agent-2')).toThrow(
        'Permission denied: only sender can edit message'
      );
    });

    it('updates text, editedAt, and signature then broadcasts edit', () => {
      const message = send({ targetId: 'ch-1', targetType: 'channel', text: 'hello' }, 'agent-1');
      const originalSignature = message.signature;

      const result = service.edit(message.id, 'updated text', 'agent-1');

      expect(result).toBe(true);
      const updated = service.getById(message.id)!;
      expect(updated.content.text).toBe('updated text');
      expect(updated.editedAt).toBeDefined();
      expect(updated.signature).not.toBe(originalSignature);
      expect(service.verifySignature(updated)).toBe(true);
      expect(relayClientMock.emitRelayEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'message.sent',
          data: expect.objectContaining({ messageId: message.id, action: 'edited', newText: 'updated text' }),
        })
      );
    });
  });

  describe('delete()', () => {
    it('returns false when message not found', () => {
      expect(service.delete('missing', 'agent-1')).toBe(false);
    });

    it('throws when deleter is not the sender', () => {
      const message = send({ targetId: 'ch-1', targetType: 'channel', text: 'hello' }, 'agent-1');

      expect(() => service.delete(message.id, 'agent-2')).toThrow(
        'Permission denied: only sender can delete message'
      );
    });

    it('marks message as deleted and broadcasts delete event', () => {
      const message = send({ targetId: 'ch-1', targetType: 'channel', text: 'hello' }, 'agent-1');

      const result = service.delete(message.id, 'agent-1');

      expect(result).toBe(true);
      const deleted = service.getById(message.id)!;
      expect(deleted.deletedAt).toBeDefined();
      expect(relayClientMock.emitRelayEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'message.sent',
          data: expect.objectContaining({ messageId: message.id, action: 'deleted' }),
        })
      );
    });
  });

  describe('delivery state helpers', () => {
    it('markDelivered only updates from SENT', () => {
      const message = send({ targetId: 'agent-2', targetType: 'agent', text: 'ping' });

      service.markDelivered(message.id, 'agent-2');
      expect(service.getById(message.id)?.deliveryStatus).toBe(MessageDeliveryStatus.DELIVERED);

      service.markDelivered(message.id, 'agent-2');
      expect(service.getById(message.id)?.deliveryStatus).toBe(MessageDeliveryStatus.DELIVERED);
    });

    it('markRead sets status to READ regardless of prior state', () => {
      const message = send({ targetId: 'agent-2', targetType: 'agent', text: 'ping' });
      service.markRead(message.id, 'agent-2');
      expect(service.getById(message.id)?.deliveryStatus).toBe(MessageDeliveryStatus.READ);

      service.markDelivered(message.id, 'agent-2');
      expect(service.getById(message.id)?.deliveryStatus).toBe(MessageDeliveryStatus.READ);
    });

    it('ignores markDelivered/markRead for unknown message ids', () => {
      expect(() => service.markDelivered('missing', 'agent-2')).not.toThrow();
      expect(() => service.markRead('missing', 'agent-2')).not.toThrow();
      expect(service.getCount()).toBe(0);
    });
  });

  describe('integrity', () => {
    it('verifySignature returns false when content is tampered', () => {
      const message = send({ targetId: 'ch-1', targetType: 'channel', text: 'secure' });
      message.content.text = 'tampered';

      expect(service.verifySignature(message)).toBe(false);
    });
  });

  describe('search()', () => {
    beforeEach(() => {
      vi.setSystemTime(new Date('2026-03-01T00:00:00Z'));
      send({ targetId: 'ch-1', targetType: 'channel', text: 'Hello World', threadId: 't1' }, 'agent-1');
      send({ targetId: 'ch-1', targetType: 'channel', text: 'Another hello', threadId: 't2' }, 'agent-2');
      send({ targetId: 'ch-2', targetType: 'channel', text: 'Different channel text', threadId: 't3' }, 'agent-1');
    });

    it('returns matching messages case-insensitively and honors limit', () => {
      const results = service.search('hello', { limit: 1 });
      expect(results).toHaveLength(1);
      expect(results[0].content.text.toLowerCase()).toContain('hello');
    });

    it('filters by channel and sender and skips deleted messages', () => {
      const toDelete = send({ targetId: 'ch-1', targetType: 'channel', text: 'hello delete me' }, 'agent-1');
      service.delete(toDelete.id, 'agent-1');

      const results = service.search('hello', { channelId: 'ch-1', senderId: 'agent-2' });
      expect(results).toHaveLength(1);
      expect(results[0].senderId).toBe('agent-2');
      expect(results[0].targetId).toBe('ch-1');
    });
  });

  describe('getCount()', () => {
    it('returns total stored messages including deleted', () => {
      send({ targetId: 'ch-1', targetType: 'channel', text: 'a' });
      const msg = send({ targetId: 'ch-1', targetType: 'channel', text: 'b' });
      service.delete(msg.id, 'agent-1');

      expect(service.getCount()).toBe(2);
    });
  });
});
