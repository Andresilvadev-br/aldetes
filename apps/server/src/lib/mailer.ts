import nodemailer from 'nodemailer';
import type { FastifyBaseLogger } from 'fastify';
import type { Config } from '../config';

export interface Mailer {
  send(to: string, subject: string, text: string): Promise<void>;
}

export function createMailer(cfg: Config, log: FastifyBaseLogger): Mailer {
  if (!cfg.SMTP_HOST) {
    return {
      async send(to, subject, text) {
        log.warn({ to, subject }, 'SMTP não configurado — e-mail apenas registrado no log');
        if (cfg.NODE_ENV !== 'production') log.info({ text }, 'conteúdo do e-mail (dev)');
      },
    };
  }
  const transport = nodemailer.createTransport({
    host: cfg.SMTP_HOST,
    port: cfg.SMTP_PORT,
    secure: cfg.SMTP_SECURE,
    auth: cfg.SMTP_USER ? { user: cfg.SMTP_USER, pass: cfg.SMTP_PASS } : undefined,
  });
  return {
    async send(to, subject, text) {
      try {
        await transport.sendMail({ from: cfg.MAIL_FROM, to, subject, text });
      } catch (err) {
        log.error({ err, to }, 'falha ao enviar e-mail');
        if (cfg.NODE_ENV !== 'production') log.info({ text }, 'conteúdo do e-mail (dev, envio falhou)');
      }
    },
  };
}
