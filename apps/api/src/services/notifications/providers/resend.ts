import { Resend } from 'resend';
import type { EmailMessage, EmailProvider, EmailSendResult } from './types.js';

export function createResendProvider(apiKey: string): EmailProvider {
  const client = new Resend(apiKey);
  return {
    async send(msg: EmailMessage): Promise<EmailSendResult> {
      const { data, error } = await client.emails.send({
        from: msg.from,
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
      });
      if (error) throw new Error(`resend send failed: ${error.message}`);
      if (!data?.id) throw new Error('resend send: no id returned');
      return { id: data.id };
    },
  };
}
