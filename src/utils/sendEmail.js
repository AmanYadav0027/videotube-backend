import { BrevoClient, BrevoEnvironment } from "@getbrevo/brevo";

const client = new BrevoClient({
    apiKey: process.env.BREVO_API_KEY,
    environment: BrevoEnvironment.Production,
});

export const sendVerificationEmail = async (email, token) => {
    const verifyURL = `${process.env.CLIENT_URL}/verify-email?token=${token}`;

    await client.transactionalEmails.sendTransacEmail({
        to: [{ email }],
        sender: { email: "videotube.support@gmail.com", name: "VideoTube" },
        subject: "Verify your email — VideoTube",
        htmlContent: `
            <h2>Welcome to VideoTube!</h2>
            <p>Click the link below to verify your email — it expires in 24 hours.</p>
            <a href="${verifyURL}">${verifyURL}</a>
        `,
    });
};
