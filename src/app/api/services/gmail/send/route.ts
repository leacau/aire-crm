import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { externalServiceErrorResponse } from '@/app/api/services/utils';

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

function cleanHeader(value: unknown): string {
    return String(value || '').replace(/[\r\n]/g, ' ').trim();
}

function formatMailbox(name: unknown, email: unknown): string {
    const safeEmail = cleanHeader(email);
    if (!safeEmail) return '';
    const safeName = cleanHeader(name).replace(/"/g, "'");
    return safeName ? `"${safeName}" <${safeEmail}>` : safeEmail;
}

function normalizeSmtpError(error: any) {
    const message = String(error?.message || error || '');
    if (
        error?.code === 'EAUTH' ||
        error?.responseCode === 535 ||
        message.includes('Username and Password not accepted') ||
        message.includes('BadCredentials')
    ) {
        return {
            code: 'SMTP_AUTH_FAILED',
            status: 502,
            message: 'Gmail rechazo las credenciales SMTP. Revisar SMTP_USER y SMTP_PASS en Vercel; para Gmail debe usarse una contraseña de aplicacion, no la contraseña normal de la cuenta.',
        };
    }

    return {
        code: error?.code || 'SMTP_SEND_FAILED',
        status: 502,
        message: message || 'No se pudo enviar el correo por SMTP.',
    };
}

function getSmtpTransporter() {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        return null;
    }

    return nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: Number(process.env.SMTP_PORT) || 465,
        secure: Number(process.env.SMTP_PORT || 465) === 465,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });
}

async function sendViaSmtp(params: {
    to: string | string[];
    subject: string;
    body: string;
    attachments?: Array<{ filename?: string; content?: string; encoding?: string }>;
    fromName?: string;
    fromEmail?: string;
    replyTo?: string;
}) {
    const transporter = getSmtpTransporter();
    if (!transporter) {
        throw new Error('SMTP no configurado en el servidor.');
    }

    const toList = Array.isArray(params.to) ? params.to.map(cleanHeader).filter(Boolean) : cleanHeader(params.to);
    const safeAttachments = (params.attachments || []).map(att => ({
        filename: cleanHeader(att.filename || 'attachment.pdf'),
        content: String(att.content || ''),
        encoding: att.encoding || 'base64',
    }));

    try {
        await transporter.sendMail({
            from: formatMailbox(params.fromName || 'Aire CRM', params.fromEmail || process.env.SMTP_FROM || process.env.SMTP_USER),
            to: toList,
            replyTo: cleanHeader(params.replyTo || params.fromEmail || ''),
            subject: cleanHeader(params.subject),
            html: params.body,
            attachments: safeAttachments,
        });
    } catch (error: any) {
        const normalized = normalizeSmtpError(error);
        const smtpError = new Error(normalized.message) as Error & { status?: number; code?: string };
        smtpError.status = normalized.status;
        smtpError.code = normalized.code;
        throw smtpError;
    }
}

export async function POST(req: Request) {
    try {
        const serverUser = await requireServerUser(req);
        if (isServerResponse(serverUser)) return serverUser;

        const { accessToken, to, subject, body, attachments, fromName, fromEmail, replyTo } = await req.json();

        if (!to || !subject || !body) {
            return NextResponse.json({ error: 'Missing email fields' }, { status: 400 });
        }

        if (attachments && Array.isArray(attachments)) {
            for (const att of attachments) {
                const content = String(att.content || '');
                const estimatedBytes = Math.ceil(content.length * 0.75);
                if (estimatedBytes > MAX_ATTACHMENT_BYTES) {
                    return NextResponse.json({ error: 'Attachment too large' }, { status: 413 });
                }
            }
        }

        if (!accessToken) {
            await sendViaSmtp({ to, subject, body, attachments, fromName, fromEmail, replyTo });
            return NextResponse.json({ success: true, provider: 'smtp' });
        }

        const safeTo = Array.isArray(to) ? to.map(cleanHeader).join(', ') : cleanHeader(to);
        const safeSubject = cleanHeader(subject);

        const boundary = "__myapp_boundary__";
        let message = [];

        message.push(`MIME-Version: 1.0`);
        const formattedFrom = formatMailbox(fromName, fromEmail);
        if (formattedFrom) {
            message.push(`From: ${formattedFrom}`);
        }
        message.push(`To: ${safeTo}`);
        const safeReplyTo = cleanHeader(replyTo);
        if (safeReplyTo) {
            message.push(`Reply-To: ${safeReplyTo}`);
        }
        message.push(`Subject: ${safeSubject}`);
        message.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
        message.push(``);
        
        // Body
        message.push(`--${boundary}`);
        message.push(`Content-Type: text/html; charset="UTF-8"`);
        message.push(`Content-Transfer-Encoding: 7bit`);
        message.push(``);
        message.push(body);
        message.push(``);

        // Attachments
        if (attachments && Array.isArray(attachments)) {
            for (const att of attachments) {
                const filename = cleanHeader(att.filename || 'attachment.pdf');
                const content = String(att.content || '');

                message.push(`--${boundary}`);
                message.push(`Content-Type: application/pdf; name="${filename}"`);
                message.push(`Content-Description: ${filename}`);
                message.push(`Content-Disposition: attachment; filename="${filename}"; size=${content.length}`);
                message.push(`Content-Transfer-Encoding: base64`);
                message.push(``);
                message.push(content);
                message.push(``);
            }
        }

        message.push(`--${boundary}--`);
        
        const raw = Buffer.from(message.join('\r\n')).toString('base64url');

        const response = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ raw }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Gmail API Error:', errorData);
            try {
                await sendViaSmtp({ to, subject, body, attachments, fromName, fromEmail, replyTo });
                return NextResponse.json({ success: true, provider: 'smtp-fallback', gmailError: errorData });
            } catch (smtpError: any) {
                return NextResponse.json(
                    { error: smtpError.message || 'SMTP fallback failed', code: smtpError.code || 'SMTP_FALLBACK_FAILED', gmailError: errorData },
                    { status: smtpError.status || response.status },
                );
            }
        }

        const data = await response.json();
        return NextResponse.json(data);

    } catch (error: any) {
        return externalServiceErrorResponse(error, {
            service: 'GMAIL',
            action: 'SEND',
            publicError: error?.message || 'No se pudo enviar el correo.',
            status: error?.status || 502,
        });
    }
}
