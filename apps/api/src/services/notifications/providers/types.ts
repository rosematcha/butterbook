export interface EmailMessage {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailSendResult {
  id: string;
}

export interface EmailProvider {
  send(msg: EmailMessage): Promise<EmailSendResult>;
}
