import type { IncomingMessage, ServerResponse } from 'node:http';

export default function handler(
  req: IncomingMessage & { body?: unknown },
  res: ServerResponse,
): Promise<void>;
