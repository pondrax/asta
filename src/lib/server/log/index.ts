import { db } from '#lib/server/db/index.ts';
import { createId } from '#lib/utils/index.ts';

export class Logger {
  async log(level: 'info' | 'error' | 'warn', message: string, metadata?: Record<string, any>) {
    await db.query.__logs.upsert({
      data: {
        id: createId(),
        level,
        message,
        metadata,
      }
    });
  }
}