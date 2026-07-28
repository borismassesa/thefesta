import { Resend } from 'resend';

if (!process.env.RESEND_API_KEY) {
  console.warn('RESEND_API_KEY is not set. Email functionality will be disabled.');
}

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
}

function getDefaultFromAddress(): string {
  if (process.env.RESEND_FROM_EMAIL) {
    return process.env.RESEND_FROM_EMAIL;
  }
  return 'OpusStudio <admin@opusfesta.com>';
}

export async function sendEmail(options: EmailOptions): Promise<{ success: boolean; error?: string }> {
  if (!resend) {
    console.error('[EMAIL]', 'Resend not configured. RESEND_API_KEY missing.', { subject: options.subject, to: options.to });
    return { success: false, error: 'Email service not configured' };
  }

  const fromAddress = options.from || getDefaultFromAddress();

  try {
    console.log('[EMAIL] Sending:', {
      to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
      subject: options.subject,
      from: fromAddress,
    });

    const result = await resend.emails.send({
      from: fromAddress,
      to: Array.isArray(options.to) ? options.to : [options.to],
      subject: options.subject,
      html: options.html,
      replyTo: options.replyTo,
    });

    if (result.error) {
      console.error('[EMAIL] API error:', result.error);
      return { success: false, error: result.error.message || 'Failed to send email' };
    }

    console.log('[EMAIL] Sent:', { id: result.data?.id });
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[EMAIL] Exception:', message);
    return { success: false, error: message };
  }
}
