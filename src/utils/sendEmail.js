import nodemailer from "nodemailer";

const createTransporter = () =>
    nodemailer.createTransport({
        host: "smtp-relay.brevo.com",
        port: 587,
        secure: false,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

export const sendVerificationEmail = async (email, token) => {
    const verifyURL = `${process.env.CLIENT_URL}/verify-email?token=${token}`;

    const transporter = createTransporter();

    await transporter.sendMail({
        from: `"VideoTube" <videotube.support@gmail.com>`,
        to: email,
        subject: "Verify your email — VideoTube",
        html: `
            <h2>Welcome to VideoTube!</h2>
            <p>Click the link below to verify your email — it expires in 24 hours.</p>
            <a href="${verifyURL}">${verifyURL}</a>
        `,
    });
};
