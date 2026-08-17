export type MailAttachment = {
  filename: string;
  content: string;
  contentType?: string;
};

export type SendMailPayload = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string[];
  attachments?: MailAttachment[];
};

export type SendMailResult = {
  ok: boolean;
  messageId: string;
  accepted: string[];
  rejected: string[];
};
