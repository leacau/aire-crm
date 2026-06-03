import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';

export const runtime = 'nodejs';

const MAX_BASE64_LENGTH = 12_000_000;

function cleanHeader(value: unknown): string {
    return String(value || '').replace(/[\r\n]/g, ' ').trim();
}

function escapeHtml(value: unknown): string {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export async function POST(req: NextRequest) {
    try {
        const serverUser = await requireServerUser(req);
        if (isServerResponse(serverUser)) return serverUser;

        const body = await req.json();
        const { pdfBase64, noteTitle, advisorName } = body;

        if (!pdfBase64 || !noteTitle) {
            return NextResponse.json({ error: 'Faltan datos requeridos' }, { status: 400 });
        }

        if (String(pdfBase64).length > MAX_BASE64_LENGTH) {
            return NextResponse.json({ error: 'El adjunto supera el limite permitido' }, { status: 413 });
        }

        if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
            console.error('SMTP credentials missing');
            return NextResponse.json({ error: 'Configuracion de correo faltante en el servidor' }, { status: 500 });
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

        const safeTitle = cleanHeader(noteTitle);
        const safeAdvisorName = escapeHtml(advisorName || serverUser.email || 'Usuario');
        const base64Content = String(pdfBase64)
            .replace(/^data:application\/pdf;filename=generated.pdf;base64,/, '')
            .replace(/^data:image\/png;base64,/, '')
            .replace(/^data:application\/pdf;base64,/, '');

        await transporter.sendMail({
            from: `"Aire CRM" <${process.env.SMTP_USER}>`,
            to: process.env.NOTE_EMAIL_RECIPIENT || 'lchena@airedesantafe.com.ar',
            subject: `Nueva Nota Comercial: ${safeTitle}`,
            html: `
                <div style="font-family: Arial, sans-serif;">
                    <h2 style="color: #cc0000;">Nueva Nota Comercial Registrada</h2>
                    <p>El asesor <strong>${safeAdvisorName}</strong> ha registrado una nueva nota comercial.</p>
                    <p><strong>Titulo:</strong> ${escapeHtml(safeTitle)}</p>
                    <p>Se adjunta el PDF con los detalles completos.</p>
                </div>
            `,
            attachments: [
                {
                    filename: `Nota_${safeTitle.replace(/[^a-z0-9]/gi, '_').substring(0, 30)}.pdf`,
                    content: base64Content,
                    encoding: 'base64',
                },
            ],
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error sending email:', error);
        return NextResponse.json({ error: error.message || 'Error desconocido al enviar correo' }, { status: 500 });
    }
}
