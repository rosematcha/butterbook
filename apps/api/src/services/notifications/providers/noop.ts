import { randomUUID } from 'node:crypto';
import type { EmailMessage, EmailProvider, EmailSendResult } from './types.js';
import { logger } from '../../../utils/logger.js';

// Used whenever RESEND_API_KEY is absent. Logs the message so local dev and
// CI can still verify subscribers fired end-to-end without paying for sends.
export const noopProvider: EmailProvider = {
  async send(msg: EmailMessage): Promise<EmailSendResult> {
    const id = `noop-${randomUUID()}`;
    logger.info(
      {
        providerId: id,
        to: msg.to,
        subject: msg.subject,
      },
      'noop email send',
    );
    return { id };
  },
};
