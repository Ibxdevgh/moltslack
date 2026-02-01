/**
 * AgentService - Agent registration, identity, and lifecycle management
 */

import { v4 as uuid } from 'uuid';
import type {
  Agent,
  AgentRegistration,
  PresenceStatus,
  Permission,
} from '../models/types.js';
import { AuthService } from './auth-service.js';
import { track } from '../analytics/posthog.js';

export class AgentService {
  private agents: Map<string, Agent> = new Map();
  private nameIndex: Map<string, string> = new Map(); // name -> id
  private authService: AuthService;

  constructor(authService: AuthService) {
    this.authService = authService;
  }

  /**
   * Register a new agent
   */
  register(registration: AgentRegistration): Agent {
    // Check for duplicate name
    if (this.nameIndex.has(registration.name)) {
      throw new Error(`Agent with name "${registration.name}" already exists`);
    }

    const id = `agent-${uuid()}`;
    const permissions = this.authService.createDefaultPermissions();

    const agent: Agent = {
      id,
      name: registration.name,
      token: '', // Will be set after creation
      capabilities: registration.capabilities || [],
      permissions,
      status: 'offline',
      metadata: registration.metadata || {},
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
    };

    // Generate token
    agent.token = this.authService.generateToken(agent);

    // Store agent
    this.agents.set(id, agent);
    this.nameIndex.set(registration.name, id);

    // Track registration
    track(id, 'agent_registered', { agent_id: id, agent_name: agent.name });

    console.log(`[AgentService] Registered agent: ${agent.name} (${id})`);
    return agent;
  }

  /**
   * Get agent by ID
   */
  getById(id: string): Agent | undefined {
    return this.agents.get(id);
  }

  /**
   * Get agent by name
   */
  getByName(name: string): Agent | undefined {
    const id = this.nameIndex.get(name);
    return id ? this.agents.get(id) : undefined;
  }

  /**
   * Get all agents
   */
  getAll(): Agent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get online agents
   */
  getOnline(): Agent[] {
    return this.getAll().filter(a => a.status !== 'offline');
  }

  /**
   * Update agent presence status
   */
  updatePresence(id: string, status: PresenceStatus): boolean {
    const agent = this.agents.get(id);
    if (!agent) return false;

    agent.status = status;
    agent.lastSeenAt = Date.now();
    return true;
  }

  /**
   * Update agent metadata
   */
  updateMetadata(id: string, metadata: Record<string, unknown>): boolean {
    const agent = this.agents.get(id);
    if (!agent) return false;

    agent.metadata = { ...agent.metadata, ...metadata };
    return true;
  }

  /**
   * Update agent permissions
   */
  updatePermissions(id: string, permissions: Permission[]): boolean {
    const agent = this.agents.get(id);
    if (!agent) return false;

    agent.permissions = permissions;
    // Regenerate token with new permissions
    agent.token = this.authService.generateToken(agent);
    return true;
  }

  /**
   * Refresh agent token
   */
  refreshToken(id: string): string | null {
    const agent = this.agents.get(id);
    if (!agent) return null;

    agent.token = this.authService.generateToken(agent);
    return agent.token;
  }

  /**
   * Mark agent as connected
   */
  connect(id: string): boolean {
    const result = this.updatePresence(id, 'online');
    if (result) {
      track(id, 'agent_connected', { agent_id: id });
    }
    return result;
  }

  /**
   * Mark agent as disconnected
   */
  disconnect(id: string): boolean {
    const result = this.updatePresence(id, 'offline');
    if (result) {
      track(id, 'agent_disconnected', { agent_id: id });
    }
    return result;
  }

  /**
   * Unregister an agent
   */
  unregister(id: string): boolean {
    const agent = this.agents.get(id);
    if (!agent) return false;

    this.nameIndex.delete(agent.name);
    this.agents.delete(id);
    console.log(`[AgentService] Unregistered agent: ${agent.name} (${id})`);
    return true;
  }

  /**
   * Get agent count
   */
  getCount(): number {
    return this.agents.size;
  }

  /**
   * Validate agent token
   */
  validateToken(token: string): Agent | null {
    const payload = this.authService.verifyToken(token);
    if (!payload) return null;

    const agent = this.agents.get(payload.agentId);
    if (!agent || agent.token !== token) return null;

    return agent;
  }
}

export default AgentService;
