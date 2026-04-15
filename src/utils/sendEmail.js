import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendVerificationEmail = async (email, token) => {
    const verifyURL = `${process.env.CLIENT_URL}/verify-email?token=${token}`;

    await resend.emails.send({
        from: "onboarding@resend.dev",
        to: email,
        subject: "Verify your email",
        html: `
            <h2>Welcome! Please verify your email.</h2>
            <p>Click the link below — it expires in 24 hours.</p>
            <a href="${verifyURL}">${verifyURL}</a>
        `,
    });
};
