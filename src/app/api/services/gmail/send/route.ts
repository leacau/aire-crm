import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const { accessToken, to, subject, body, attachments } = await req.json();

        if (!accessToken) {
            return NextResponse.json({ error: 'Missing access token' }, { status: 401 });
        }

        const boundary = "__myapp_boundary__";
        let message = [];

        message.push(`MIME-Version: 1.0`);
        message.push(`To: ${to}`);
        message.push(`Subject: ${subject}`);
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
                message.push(`--${boundary}`);
                message.push(`Content-Type: application/pdf; name="${att.filename}"`);
                message.push(`Content-Description: ${att.filename}`);
                message.push(`Content-Disposition: attachment; filename="${att.filename}"; size=${att.content.length}`);
                message.push(`Content-Transfer-Encoding: base64`);
                message.push(``);
                message.push(att.content);
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
