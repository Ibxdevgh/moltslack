/**
 * API Routes Integration Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { createRoutes } from './routes.js';
import { AuthService } from '../services/auth-service.js';
import { AgentService } from '../services/agent-service.js';
import { ChannelService } from '../services/channel-service.js';
import { MessageService } from '../services/message-service.js';
import { PresenceService } from '../services/presence-service.js';
import { v4 as uuid } from 'uuid';

describe('API Routes', () => {
  let app: Express;
  let authService: AuthService;
  let agentService: AgentService;
  let channelService: ChannelService;
  let messageService: MessageService;
  let presenceService: PresenceService;
  let testProjectId: string;

  beforeEach(async () => {
    // Setup fresh services for each test
    testProjectId = uuid();
    authService = new AuthService('test-secret-key');
    agentService = new AgentService(authService);
    channelService = new ChannelService(testProjectId);
    await channelService.initializeChannels();
    messageService = new MessageService(testProjectId, undefined, channelService);
    presenceService = new PresenceService(testProjectId);

    // Create Express app with routes
    app = express();
    app.use(express.json());
    app.use(
      '/api',
      createRoutes({
        agentService,
        channelService,
        messageService,
        presenceService,
        authService,
      })
    );
  });

  afterEach(() => {
    // Cleanup presence service timers
    presenceService.stop();
  });

  // Helper to create a test agent and get its token
  const createTestAgent = async (name: string = 'TestAgent') => {
    const agent = await agentService.register({ name, capabilities: ['test'] });
    return { agent, token: agent.token };
  };

  describe('GET /api/health', () => {
    it('should return health status with stats', async () => {
      const res = await request(app).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('healthy');
      expect(res.body.data.timestamp).toBeDefined();
      expect(res.body.data.stats).toBeDefined();
      expect(typeof res.body.data.stats.agents).toBe('number');
      expect(typeof res.body.data.stats.channels).toBe('number');
      expect(typeof res.body.data.stats.messages).toBe('number');
      expect(typeof res.body.data.stats.onlineAgents).toBe('number');
    });

    it('should not require authentication', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
    });
  });

  describe('Agent Routes', () => {
    describe('POST /api/agents', () => {
      it('should register a new agent', async () => {
        const res = await request(app)
          .post('/api/agents')
          .send({ name: 'NewAgent', capabilities: ['code', 'search'] });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.id).toBeDefined();
        expect(res.body.data.name).toBe('NewAgent');
        expect(res.body.data.token).toBeDefined();
        expect(res.body.data.capabilities).toEqual(['code', 'search']);
        expect(res.body.data.status).toBe('offline');
      });

      it('should return 400 when name is missing', async () => {
        const res = await request(app)
          .post('/api/agents')
          .send({ capabilities: ['test'] });

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('INVALID_INPUT');
      });

      it('should return 400 for duplicate agent name', async () => {
        await request(app).post('/api/agents').send({ name: 'DuplicateAgent' });

        const res = await request(app)
          .post('/api/agents')
          .send({ name: 'DuplicateAgent' });

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('REGISTRATION_FAILED');
      });

      it('should register agent with metadata', async () => {
        const res = await request(app).post('/api/agents').send({
          name: 'MetadataAgent',
          metadata: { model: 'claude-3', version: '1.0' },
        });

        expect(res.status).toBe(201);
        expect(res.body.data.name).toBe('MetadataAgent');
      });
    });

    describe('GET /api/agents', () => {
      it('should list all agents', async () => {
        await createTestAgent('Agent1');
        await createTestAgent('Agent2');

        const res = await request(app).get('/api/agents');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data.length).toBe(2);
      });

      it('should not include token in list response', async () => {
        await createTestAgent('SecretAgent');

        const res = await request(app).get('/api/agents');

        expect(res.status).toBe(200);
        expect(res.body.data[0].token).toBeUndefined();
      });

      it('should include basic agent info in list', async () => {
        await createTestAgent('InfoAgent');

        const res = await request(app).get('/api/agents');

        const agent = res.body.data[0];
        expect(agent.id).toBeDefined();
        expect(agent.name).toBe('InfoAgent');
        expect(agent.status).toBeDefined();
        expect(agent.capabilities).toBeDefined();
      });
    });

    describe('GET /api/agents/:id', () => {
      it('should get agent by ID', async () => {
        const { agent } = await createTestAgent('SpecificAgent');

        const res = await request(app).get(`/api/agents/${agent.id}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.id).toBe(agent.id);
        expect(res.body.data.name).toBe('SpecificAgent');
      });

      it('should return 404 for non-existent agent', async () => {
        const res = await request(app).get('/api/agents/non-existent-id');

        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('NOT_FOUND');
      });
    });

    describe('GET /api/agents/me', () => {
      it('should return current agent info when authenticated', async () => {
        const { agent, token } = await createTestAgent('MeAgent');

        const res = await request(app)
          .get('/api/agents/me')
          .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.id).toBe(agent.id);
        expect(res.body.data.name).toBe('MeAgent');
      });

      it('should return 401 without authentication', async () => {
        const res = await request(app).get('/api/agents/me');

        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('UNAUTHORIZED');
      });

      it('should return 401 with invalid token', async () => {
        const res = await request(app)
          .get('/api/agents/me')
          .set('Authorization', 'Bearer invalid-token');

        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('INVALID_TOKEN');
      });
    });
  });

  describe('Channel Routes', () => {
    describe('GET /api/channels', () => {
      it('should list all channels including defaults', async () => {
        const res = await request(app).get('/api/channels');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
        // Default channels: #general and #announcements
        expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      });

      it('should include channel info in list', async () => {
        const res = await request(app).get('/api/channels');

        const channel = res.body.data.find((c: any) => c.name === 'general');
        expect(channel).toBeDefined();
        expect(channel.id).toBeDefined();
        expect(channel.type).toBeDefined();
        expect(channel.createdAt).toBeDefined();
      });
    });

    describe('POST /api/channels', () => {
      it('should create a new channel when authenticated', async () => {
        const { token } = await createTestAgent('ChannelCreator');

        const res = await request(app)
          .post('/api/channels')
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'dev-team', topic: 'Development discussion' });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.id).toBeDefined();
        expect(res.body.data.name).toBe('dev-team');
        expect(res.body.data.topic).toBe('Development discussion');
      });

      it('should return 401 without authentication', async () => {
        const res = await request(app)
          .post('/api/channels')
          .send({ name: 'no-auth-channel' });

        expect(res.status).toBe(401);
      });

      it('should return 400 when name is missing', async () => {
        const { token } = await createTestAgent('NoNameChannel');

        const res = await request(app)
          .post('/api/channels')
          .set('Authorization', `Bearer ${token}`)
          .send({ topic: 'Missing name' });

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('INVALID_INPUT');
      });

      it('should return 400 for duplicate channel name', async () => {
        const { token } = await createTestAgent('DupChannelAgent');

        await request(app)
          .post('/api/channels')
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'duplicate-channel' });

        const res = await request(app)
          .post('/api/channels')
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'duplicate-channel' });

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('CHANNEL_CREATE_FAILED');
      });
    });

    describe('GET /api/channels/:id', () => {
      it('should get channel by ID', async () => {
        const { token } = await createTestAgent('GetChannelAgent');

        const createRes = await request(app)
          .post('/api/channels')
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'get-channel', topic: 'Test topic' });

        const channelId = createRes.body.data.id;

        const res = await request(app).get(`/api/channels/${channelId}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.id).toBe(channelId);
        expect(res.body.data.name).toBe('get-channel');
        expect(res.body.data.topic).toBe('Test topic');
      });

      it('should return 404 for non-existent channel', async () => {
        const res = await request(app).get('/api/channels/non-existent-id');

        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('NOT_FOUND');
      });
    });

    describe('POST /api/channels/:id/join', () => {
      it('should allow agent to join a channel', async () => {
        const { token } = await createTestAgent('JoinAgent');
        const general = channelService.getByName('general');

        const res = await request(app)
          .post(`/api/channels/${general!.id}/join`)
          .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.joined).toBe(true);
      });

      it('should return 401 without authentication', async () => {
        const general = channelService.getByName('general');

        const res = await request(app).post(`/api/channels/${general!.id}/join`);

        expect(res.status).toBe(401);
      });

      it('should return 404 for non-existent channel', async () => {
        const { token } = await createTestAgent('JoinNonExistent');

        const res = await request(app)
          .post('/api/channels/non-existent/join')
          .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(404);
      });

      it('should return 403 when joining private channel without access', async () => {
        const { agent, token } = await createTestAgent('PrivateJoinAgent');
        const { token: creatorToken } = await createTestAgent('PrivateCreator');

        // Create a private channel
        const createRes = await request(app)
          .post('/api/channels')
          .set('Authorization', `Bearer ${creatorToken}`)
          .send({ name: 'private-channel', type: 'private' });

        const privateChannelId = createRes.body.data.id;

        // Try to join without access
        const res = await request(app)
          .post(`/api/channels/${privateChannelId}/join`)
          .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('PERMISSION_DENIED');
      });

      it('should handle double-join idempotently', async () => {
        const { token } = await createTestAgent('DoubleJoinAgent');
        const general = channelService.getByName('general');

        // First join
        const res1 = await request(app)
          .post(`/api/channels/${general!.id}/join`)
          .set('Authorization', `Bearer ${token}`);

        expect(res1.status).toBe(200);
        expect(res1.body.data.joined).toBe(true);

        // Second join (should succeed idempotently)
        const res2 = await request(app)
          .post(`/api/channels/${general!.id}/join`)
          .set('Authorization', `Bearer ${token}`);

        expect(res2.status).toBe(200);
        expect(res2.body.data.joined).toBe(true);
      });
    });

    describe('POST /api/channels/:id/leave', () => {
      it('should allow agent to leave a channel', async () => {
        const { agent, token } = await createTestAgent('LeaveAgent');
        const general = channelService.getByName('general');

        // First join
        await request(app)
          .post(`/api/channels/${general!.id}/join`)
          .set('Authorization', `Bearer ${token}`);

        // Then leave
        const res = await request(app)
          .post(`/api/channels/${general!.id}/leave`)
          .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.left).toBe(true);
      });

      it('should return 404 for non-existent channel', async () => {
        const { token } = await createTestAgent('LeaveNonExistent');

        const res = await request(app)
          .post('/api/channels/non-existent/leave')
          .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(404);
      });

      it('should handle double-leave idempotently', async () => {
        const { token } = await createTestAgent('DoubleLeaveAgent');
        const general = channelService.getByName('general');

        // Join first
        await request(app)
          .post(`/api/channels/${general!.id}/join`)
          .set('Authorization', `Bearer ${token}`);

        // First leave
        const res1 = await request(app)
          .post(`/api/channels/${general!.id}/leave`)
          .set('Authorization', `Bearer ${token}`);

        expect(res1.status).toBe(200);
        expect(res1.body.data.left).toBe(true);

        // Second leave (should succeed idempotently)
        const res2 = await request(app)
          .post(`/api/channels/${general!.id}/leave`)
          .set('Authorization', `Bearer ${token}`);

        expect(res2.status).toBe(200);
        expect(res2.body.data.left).toBe(true);
      });
    });

    describe('GET /api/channels/:id/members', () => {
      it('should list channel members', async () => {
        const { agent, token } = await createTestAgent('MemberAgent');
        const general = channelService.getByName('general');

        // Join the channel
        await request(app)
          .post(`/api/channels/${general!.id}/join`)
          .set('Authorization', `Bearer ${token}`);

        const res = await request(app).get(`/api/channels/${general!.id}/members`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data.some((m: any) => m.id === agent.id)).toBe(true);
      });

      it('should return empty array for channel with no members', async () => {
        const { token } = await createTestAgent('EmptyMemberAgent');

        const createRes = await request(app)
          .post('/api/channels')
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'empty-channel' });

        const res = await request(app).get(
          `/api/channels/${createRes.body.data.id}/members`
        );

        expect(res.status).toBe(200);
        expect(res.body.data).toEqual([]);
      });
    });
  });

  describe('Message Routes', () => {
    describe('GET /api/channels/:id/messages', () => {
      it('should get channel messages', async () => {
        const { agent, token } = await createTestAgent('MessageReader');
        const general = channelService.getByName('general');

        // Join and send a message first
        await request(app)
          .post(`/api/channels/${general!.id}/join`)
          .set('Authorization', `Bearer ${token}`);

        await request(app)
          .post(`/api/channels/${general!.id}/messages`)
          .set('Authorization', `Bearer ${token}`)
          .send({ text: 'Hello, world!' });

        const res = await request(app).get(`/api/channels/${general!.id}/messages`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      });

      it('should support limit parameter', async () => {
        const { token } = await createTestAgent('LimitAgent');
        const general = channelService.getByName('general');

        // Send multiple messages
        for (let i = 0; i < 5; i++) {
          await request(app)
            .post(`/api/channels/${general!.id}/messages`)
            .set('Authorization', `Bearer ${token}`)
            .send({ text: `Message ${i}` });
        }

        const res = await request(app)
          .get(`/api/channels/${general!.id}/messages`)
          .query({ limit: 2 });

        expect(res.status).toBe(200);
        expect(res.body.data.length).toBe(2);
      });

      it('should support before parameter for pagination', async () => {
        const { token } = await createTestAgent('BeforeAgent');
        const general = channelService.getByName('general');

        // Send multiple messages
        const messageIds: string[] = [];
        for (let i = 0; i < 5; i++) {
          const res = await request(app)
            .post(`/api/channels/${general!.id}/messages`)
            .set('Authorization', `Bearer ${token}`)
            .send({ text: `Paginated Message ${i}` });
          messageIds.push(res.body.data.id);
        }

        // Get all messages first
        const allRes = await request(app).get(`/api/channels/${general!.id}/messages`);
        expect(allRes.body.data.length).toBe(5);

        // Get messages before the 3rd message (use the 3rd message id as cursor)
        const thirdMessageId = messageIds[2];
        const beforeRes = await request(app)
          .get(`/api/channels/${general!.id}/messages`)
          .query({ before: thirdMessageId });

        // Should return messages older than the 3rd message
        expect(beforeRes.status).toBe(200);
        // Messages 0 and 1 were sent before message 2
        expect(beforeRes.body.data.length).toBe(2);
      });
    });

    describe('POST /api/channels/:id/messages', () => {
      it('should send a message to a channel', async () => {
        const { token } = await createTestAgent('MessageSender');
        const general = channelService.getByName('general');

        const res = await request(app)
          .post(`/api/channels/${general!.id}/messages`)
          .set('Authorization', `Bearer ${token}`)
          .send({ text: 'Test message' });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.id).toBeDefined();
        expect(res.body.data.sentAt).toBeDefined();
      });

      it('should return 401 without authentication', async () => {
        const general = channelService.getByName('general');

        const res = await request(app)
          .post(`/api/channels/${general!.id}/messages`)
          .send({ text: 'Unauthorized message' });

        expect(res.status).toBe(401);
      });

      it('should return 400 when text is missing', async () => {
        const { token } = await createTestAgent('NoTextAgent');
        const general = channelService.getByName('general');

        const res = await request(app)
          .post(`/api/channels/${general!.id}/messages`)
          .set('Authorization', `Bearer ${token}`)
          .send({});

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('INVALID_INPUT');
      });

      it('should send message with type and data', async () => {
        const { token } = await createTestAgent('TypedMessageAgent');
        const general = channelService.getByName('general');

        const res = await request(app)
          .post(`/api/channels/${general!.id}/messages`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            text: 'Command message',
            type: 'command',
            data: { action: 'deploy', target: 'prod' },
          });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
      });

      it('should send message with threadId', async () => {
        const { token } = await createTestAgent('ThreadAgent');
        const general = channelService.getByName('general');

        // First send a parent message
        const parentRes = await request(app)
          .post(`/api/channels/${general!.id}/messages`)
          .set('Authorization', `Bearer ${token}`)
          .send({ text: 'Parent message' });

        // Then send a reply
        const res = await request(app)
          .post(`/api/channels/${general!.id}/messages`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            text: 'Thread reply',
            threadId: parentRes.body.data.id,
          });

        expect(res.status).toBe(201);
      });

      it('should return 403 when sending to non-existent channel', async () => {
        const { token } = await createTestAgent('NonExistentChannelAgent');

        const res = await request(app)
          .post('/api/channels/ch-nonexistent/messages')
          .set('Authorization', `Bearer ${token}`)
          .send({ text: 'Message to nowhere' });

        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('SEND_FAILED');
      });
    });

    describe('GET /api/threads/:id/messages', () => {
      it('should get thread messages', async () => {
        const { token } = await createTestAgent('ThreadReader');
        const general = channelService.getByName('general');

        // Create parent message
        const parentRes = await request(app)
          .post(`/api/channels/${general!.id}/messages`)
          .set('Authorization', `Bearer ${token}`)
          .send({ text: 'Thread parent' });

        const threadId = parentRes.body.data.id;

        // Create thread replies
        await request(app)
          .post(`/api/channels/${general!.id}/messages`)
          .set('Authorization', `Bearer ${token}`)
          .send({ text: 'Reply 1', threadId });

        await request(app)
          .post(`/api/channels/${general!.id}/messages`)
          .set('Authorization', `Bearer ${token}`)
          .send({ text: 'Reply 2', threadId });

        const res = await request(app).get(`/api/threads/${threadId}/messages`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.length).toBe(2);
      });

      it('should return empty array for thread with no replies', async () => {
        const res = await request(app).get('/api/threads/no-replies-thread/messages');

        expect(res.status).toBe(200);
        expect(res.body.data).toEqual([]);
      });
    });

    describe('POST /api/agents/:id/messages', () => {
      it('should send a direct message to another agent', async () => {
        const { token: senderToken } = await createTestAgent('DMSender');
        const { agent: receiver } = await createTestAgent('DMReceiver');

        const res = await request(app)
          .post(`/api/agents/${receiver.id}/messages`)
          .set('Authorization', `Bearer ${senderToken}`)
          .send({ text: 'Direct message' });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.id).toBeDefined();

        // Verify the message was actually stored
        const messageId = res.body.data.id;
        const storedMessage = messageService.getById(messageId);
        expect(storedMessage).toBeDefined();
        expect(storedMessage?.targetId).toBe(receiver.id);
        expect(storedMessage?.content.text).toBe('Direct message');
      });

      it('should return 401 without authentication', async () => {
        const { agent: receiver } = await createTestAgent('DMReceiverNoAuth');

        const res = await request(app)
          .post(`/api/agents/${receiver.id}/messages`)
          .send({ text: 'Unauthorized DM' });

        expect(res.status).toBe(401);
      });

      it('should return 400 when text is missing', async () => {
        const { token } = await createTestAgent('DMNoText');
        const { agent: receiver } = await createTestAgent('DMReceiverNoText');

        const res = await request(app)
          .post(`/api/agents/${receiver.id}/messages`)
          .set('Authorization', `Bearer ${token}`)
          .send({});

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('INVALID_INPUT');
      });

      it('should send DM to non-existent agent (no validation)', async () => {
        // Note: The API doesn't validate target agent exists - message is stored anyway
        const { token } = await createTestAgent('DMToNonExistent');

        const res = await request(app)
          .post('/api/agents/agent-nonexistent/messages')
          .set('Authorization', `Bearer ${token}`)
          .send({ text: 'DM to nobody' });

        // Currently succeeds - target validation not implemented
        expect(res.status).toBe(201);
      });
    });
  });

  describe('Presence Routes', () => {
    describe('GET /api/presence', () => {
      it('should list all presence info', async () => {
        const { agent, token } = await createTestAgent('PresenceAgent');

        // Connect the agent
        await request(app)
          .post('/api/presence/connect')
          .set('Authorization', `Bearer ${token}`)
          .send({ clientType: 'cli', clientVersion: '1.0.0' });

        const res = await request(app).get('/api/presence');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data.some((p: any) => p.agentId === agent.id)).toBe(true);
      });

      it('should return empty array when no agents connected', async () => {
        const res = await request(app).get('/api/presence');

        expect(res.status).toBe(200);
        expect(res.body.data).toEqual([]);
      });
    });

    describe('POST /api/presence/connect', () => {
      it('should connect an agent', async () => {
        const { token } = await createTestAgent('ConnectAgent');

        const res = await request(app)
          .post('/api/presence/connect')
          .set('Authorization', `Bearer ${token}`)
          .send({ clientType: 'api', clientVersion: '2.0.0' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.connectionId).toBeDefined();
        expect(res.body.data.status).toBe('online');
      });

      it('should return 401 without authentication', async () => {
        const res = await request(app).post('/api/presence/connect').send({});

        expect(res.status).toBe(401);
      });

      it('should handle double-connect idempotently', async () => {
        const { token } = await createTestAgent('DoubleConnectAgent');

        // First connect
        const res1 = await request(app)
          .post('/api/presence/connect')
          .set('Authorization', `Bearer ${token}`)
          .send({ clientType: 'cli', clientVersion: '1.0.0' });

        expect(res1.status).toBe(200);
        expect(res1.body.data.status).toBe('online');

        // Second connect (should succeed and update connection)
        const res2 = await request(app)
          .post('/api/presence/connect')
          .set('Authorization', `Bearer ${token}`)
          .send({ clientType: 'cli', clientVersion: '1.0.1' });

        expect(res2.status).toBe(200);
        expect(res2.body.data.status).toBe('online');
      });
    });

    describe('POST /api/presence/heartbeat', () => {
      it('should update heartbeat', async () => {
        const { token } = await createTestAgent('HeartbeatAgent');

        // First connect
        await request(app)
          .post('/api/presence/connect')
          .set('Authorization', `Bearer ${token}`);

        const res = await request(app)
          .post('/api/presence/heartbeat')
          .set('Authorization', `Bearer ${token}`)
          .send({ activeChannels: [] });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.received).toBe(true);
      });

      it('should return 401 without authentication', async () => {
        const res = await request(app).post('/api/presence/heartbeat').send({});

        expect(res.status).toBe(401);
      });
    });

    describe('PUT /api/presence/status', () => {
      it('should update status', async () => {
        const { token } = await createTestAgent('StatusAgent');

        // First connect
        await request(app)
          .post('/api/presence/connect')
          .set('Authorization', `Bearer ${token}`);

        const res = await request(app)
          .put('/api/presence/status')
          .set('Authorization', `Bearer ${token}`)
          .send({ status: 'busy', statusMessage: 'Working on task' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.updated).toBe(true);
      });

      it('should return 401 without authentication', async () => {
        const res = await request(app)
          .put('/api/presence/status')
          .send({ status: 'idle' });

        expect(res.status).toBe(401);
      });
    });

    describe('POST /api/presence/typing', () => {
      it('should set typing indicator', async () => {
        const { token } = await createTestAgent('TypingAgent');
        const general = channelService.getByName('general');

        // First connect
        await request(app)
          .post('/api/presence/connect')
          .set('Authorization', `Bearer ${token}`);

        const res = await request(app)
          .post('/api/presence/typing')
          .set('Authorization', `Bearer ${token}`)
          .send({ channelId: general!.id, isTyping: true });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.set).toBe(true);
      });

      it('should return 400 when channelId is missing', async () => {
        const { token } = await createTestAgent('TypingNoChannel');

        await request(app)
          .post('/api/presence/connect')
          .set('Authorization', `Bearer ${token}`);

        const res = await request(app)
          .post('/api/presence/typing')
          .set('Authorization', `Bearer ${token}`)
          .send({ isTyping: true });

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('INVALID_INPUT');
      });

      it('should return 401 without authentication', async () => {
        const res = await request(app)
          .post('/api/presence/typing')
          .send({ channelId: 'ch-123', isTyping: true });

        expect(res.status).toBe(401);
      });
    });

    describe('POST /api/presence/disconnect', () => {
      it('should disconnect an agent', async () => {
        const { agent, token } = await createTestAgent('DisconnectAgent');

        // First connect
        await request(app)
          .post('/api/presence/connect')
          .set('Authorization', `Bearer ${token}`);

        const res = await request(app)
          .post('/api/presence/disconnect')
          .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.disconnected).toBe(true);

        // Verify agent is offline
        const presenceRes = await request(app).get('/api/presence');
        expect(presenceRes.body.data.find((p: any) => p.agentId === agent.id)).toBeUndefined();
      });

      it('should return 401 without authentication', async () => {
        const res = await request(app).post('/api/presence/disconnect');

        expect(res.status).toBe(401);
      });
    });
  });

  describe('Authentication Integration', () => {
    it('should reject expired tokens', async () => {
      // Create auth service with 1 second expiry (minimum for jwt.sign)
      const shortExpiryAuth = new AuthService('short-secret', 1000);
      const shortAgentService = new AgentService(shortExpiryAuth);
      const agent = shortAgentService.register({ name: 'ExpiredAgent' });

      // Create new app with short expiry
      const shortApp = express();
      shortApp.use(express.json());
      shortApp.use(
        '/api',
        createRoutes({
          agentService: shortAgentService,
          channelService,
          messageService,
          presenceService,
          authService: shortExpiryAuth,
        })
      );

      // Wait for token to expire (slightly longer than 1 second)
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const res = await request(shortApp)
        .get('/api/agents/me')
        .set('Authorization', `Bearer ${agent.token}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    });

    it('should accept valid tokens from different agents', async () => {
      const { token: token1 } = await createTestAgent('Agent1Auth');
      const { token: token2 } = await createTestAgent('Agent2Auth');

      const res1 = await request(app)
        .get('/api/agents/me')
        .set('Authorization', `Bearer ${token1}`);

      const res2 = await request(app)
        .get('/api/agents/me')
        .set('Authorization', `Bearer ${token2}`);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res1.body.data.name).toBe('Agent1Auth');
      expect(res2.body.data.name).toBe('Agent2Auth');
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON gracefully', async () => {
      const res = await request(app)
        .post('/api/agents')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      expect(res.status).toBe(400);
    });

    it('should handle empty request body', async () => {
      const res = await request(app)
        .post('/api/agents')
        .set('Content-Type', 'application/json')
        .send('');

      expect(res.status).toBe(400);
    });
  });
});
