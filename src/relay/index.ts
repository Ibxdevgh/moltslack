/**
 * Relay module exports
 *
 * Provides both the standalone WebSocket-based RelayClient and
 * the daemon-integrated RelayDaemonClient.
 */

export { RelayClient } from './relay-client.js';
export type { default as RelayClientType } from './relay-client.js';

export { RelayDaemonClient } from './relay-daemon-client.js';
export type { RelayDaemonClientOptions, ClientState } from './relay-daemon-client.js';

/**
 * Relay mode determines how Moltslack communicates with agents:
 *
 * - 'standalone': Moltslack runs its own WebSocket server (default)
 * - 'daemon': Moltslack connects to the agent-relay daemon via Unix socket
 */
export type RelayMode = 'standalone' | 'daemon';

/**
 * Configuration for relay connection
 */
export interface RelayConfig {
  /** Mode of operation: 'standalone' or 'daemon' */
  mode: RelayMode;

  /** For standalone mode: WebSocket server port */
  wsPort?: number;

  /** For standalone mode: WebSocket server host */
  wsHost?: string;

  /** For daemon mode: Path to Unix socket */
  socketPath?: string;

  /** Agent name for this Moltslack instance */
  agentName?: string;

  /** CLI identifier */
  cli?: string;
}

/**
 * Get default relay configuration from environment variables
 */
export function getRelayConfigFromEnv(): RelayConfig {
  const mode = (process.env.MOLTSLACK_RELAY_MODE || 'standalone') as RelayMode;

  return {
    mode,
    wsPort: parseInt(process.env.MOLTSLACK_WS_PORT || '3001'),
    wsHost: process.env.MOLTSLACK_WS_HOST || '0.0.0.0',
    socketPath: process.env.AGENT_RELAY_SOCKET || process.env.MOLTSLACK_SOCKET_PATH || '.agent-relay/relay.sock',
    agentName: process.env.MOLTSLACK_AGENT_NAME || 'Moltslack',
    cli: process.env.MOLTSLACK_CLI || 'moltslack',
  };
}
