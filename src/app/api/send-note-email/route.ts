import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

// Configuración para permitir payloads más grandes (PDFs)
export const config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb',
        },
    },
};

export async function POST(req: NextRequest) {
    try {
        const { pdfBase64, noteTitle, advisorName } = await req.json();

        if (!pdfBase64 || !noteTitle) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: Number(process.env.SMTP_PORT) || 465,
            secure: true,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });

        // Limpiar el string base64 si viene con el prefijo
        const base64Content = pdfBase64.replace(/^data:application\/pdf;filename=generated.pdf;base64,/, "").replace(/^data:image\/png;base64,/, "");

        await transporter.sendMail({
            from: `"Aire CRM" <${process.env.SMTP_USER}>`,
            to: 'lchena@airedesantafe.com.ar',
            subject: `Nueva Nota Comercial: ${noteTitle}`,
            html: `
                <h1>Nueva Nota Comercial Registrada</h1>
                <p>El asesor <strong>${advisorName}</strong> ha registrado una nueva nota comercial.</p>
                <p><strong>Título:</strong> ${noteTitle}</p>
                <p>Se adjunta el PDF con los detalles.</p>
            `,
            attachments: [
                {
                    filename: `Nota_${noteTitle.replace(/[^a-z0-9]/gi, '_').substring(0, 20)}.pdf`,
                    content: base64Content,
                    encoding: 'base64',
                },
            ],
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error sending email:", error);
        return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
    }
}
