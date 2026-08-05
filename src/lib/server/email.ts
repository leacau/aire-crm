import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
	host: process.env.SMTP_HOST || 'smtp.gmail.com',
	port: Number(process.env.SMTP_PORT) || 465,
	secure: true, // true para 465, false para otros puertos
	auth: {
		user: process.env.SMTP_USER, // Tu email (ej: notificaciones@tucrm.com)
		pass: process.env.SMTP_PASS, // Tu contraseña de aplicación
	},
});

export const sendServerEmail = async ({
	to,
	subject,
	html,
}: {
	to: string;
	subject: string;
	html: string;
}) => {
	if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
		console.warn(
			'⚠️ SMTP no configurado. El correo no se enviará. Configura SMTP_USER y SMTP_PASS.',
		);
		return;
	}

	try {
		await transporter.sendMail({
			from: `"CRM Multimedios" <${process.env.SMTP_USER}>`,
			to,
			subject,
			html,
		});
		console.log(`📧 Correo enviado a ${to}: ${subject}`);
	} catch (error) {
		console.error('❌ Error enviando correo:', error);
	}
};

