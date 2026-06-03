import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

function cleanHeader(value: unknown): string {
    return String(value || '').replace(/[\r\n]/g, ' ').trim();
}

export async function POST(req: Request) {
    try {
        const serverUser = await requireServerUser(req);
        if (isServerResponse(serverUser)) return serverUser;

        const { accessToken, to, subject, body, attachments } = await req.json();

        if (!accessToken) {
            return NextResponse.json({ error: 'Missing access token' }, { status: 401 });
        }

        if (!to || !subject || !body) {
            return NextResponse.json({ error: 'Missing email fields' }, { status: 400 });
        }

        const safeTo = Array.isArray(to) ? to.map(cleanHeader).join(', ') : cleanHeader(to);
        const safeSubject = cleanHeader(subject);

        const boundary = "__myapp_boundary__";
        let message = [];

        message.push(`MIME-Version: 1.0`);
        message.push(`To: ${safeTo}`);
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
                const estimatedBytes = Math.ceil(content.length * 0.75);
                if (estimatedBytes > MAX_ATTACHMENT_BYTES) {
                    return NextResponse.json({ error: 'Attachment too large' }, { status: 413 });
                }

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
            return NextResponse.json(errorData, { status: response.status });
        }

        const data = await response.json();
        return NextResponse.json(data);

    } catch (error: any) {
        console.error('Error sending email:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
