/**
 * PostHog Analytics - Server-side tracking module
 */

import { PostHog } from 'posthog-node';

const POSTHOG_KEY = 'phc_5gjcxZS4q9d6gWlyOi3J2ddSdIvzrdiRe1MfWgGLQYH';
const isDev = process.env.NODE_ENV === 'development';

// Disabled in dev mode
const client = !isDev
  ? new PostHog(POSTHOG_KEY, { host: 'https://us.i.posthog.com' })
  : null;

export function track(distinctId: string, event: string, properties?: Record<string, unknown>) {
  client?.capture({ distinctId, event, properties });
}

export function identify(distinctId: string, properties: Record<string, unknown>) {
  client?.identify({ distinctId, properties });
}

export async function shutdown() {
  await client?.shutdown();
}
