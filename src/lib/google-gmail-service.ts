
'use server';

const GMAIL_API_URL = 'https://www.googleapis.com/gmail/v1/users/me/messages/send';

// --- Gmail Service ---

interface EmailParams {
    accessToken: string;
    to: string;
    subject: string;
    body: string;
}

export async function sendEmail({ accessToken, to, subject, body }: EmailParams) {
    // RFC 2822 formatted email
    const emailParts = [
        `To: ${to}`,
        `Content-Type: text/html; charset=utf-8`,
        `Subject: ${subject}`,
        ``,
        body,
    ];
    const email = emailParts.join('\r\n');

    const response = await fetch(GMAIL_API_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            // The raw email message has to be base64url encoded
            raw: Buffer.from(email).toString('base64url'),
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        console.error('Google Gmail API Error:', error);
        throw new Error('Failed to send email: ' + (error.error?.message || 'Unknown error'));
    }

    return await response.json();
}
