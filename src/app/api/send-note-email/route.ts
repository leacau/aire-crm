import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

// Aumentar límite para recibir el PDF en base64
export const config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb',
        },
    },
};

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { pdfBase64, noteTitle, advisorName } = body;

        if (!pdfBase64 || !noteTitle) {
            return NextResponse.json({ error: 'Faltan datos requeridos (pdf o título)' }, { status: 400 });
        }

        // Verificar credenciales SMTP
        if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
            console.error("SMTP Credentials missing");
            return NextResponse.json({ error: 'Configuración de correo faltante en el servidor' }, { status: 500 });
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

        // Limpieza del base64
        const base64Content = pdfBase64.replace(/^data:application\/pdf;filename=generated.pdf;base64,/, "")
                                       .replace(/^data:image\/png;base64,/, "")
                                       .replace(/^data:application\/pdf;base64,/, "");

        await transporter.sendMail({
            from: `"Aire CRM" <${process.env.SMTP_USER}>`,
            to: 'lchena@airedesantafe.com.ar',
            subject: `Nueva Nota Comercial: ${noteTitle}`,
            html: `
                <div style="font-family: Arial, sans-serif;">
                    <h2 style="color: #cc0000;">Nueva Nota Comercial Registrada</h2>
                    <p>El asesor <strong>${advisorName}</strong> ha registrado una nueva nota comercial.</p>
                    <p><strong>Título:</strong> ${noteTitle}</p>
                    <p>Se adjunta el PDF con los detalles completos.</p>
                </div>
            `,
            attachments: [
                {
                    filename: `Nota_${noteTitle.replace(/[^a-z0-9]/gi, '_').substring(0, 30)}.pdf`,
                    content: base64Content,
                    encoding: 'base64',
                },
            ],
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Error sending email:", error);
        return NextResponse.json({ error: error.message || 'Error desconocido al enviar correo' }, { status: 500 });
    }
}
