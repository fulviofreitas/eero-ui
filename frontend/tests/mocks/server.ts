/**
 * MSW server instance for testing.
 *
 * This server intercepts HTTP requests during tests and
 * returns mock responses defined in handlers.ts.
 */

import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
