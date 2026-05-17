import * as Brevo from "@getbrevo/brevo";

const apiInstance = new Brevo.TransactionalEmailsApi();
apiInstance.setApiKey(
    Brevo.TransactionalEmailsApiApiKeys.apiKey,
    process.env.BREVO_API_KEY
);

export const sendVerificationEmail = async (email, token) => {
    const verifyURL = `${process.env.CLIENT_URL}/verify-email?token=${token}`;

    const sendSmtpEmail = new Brevo.SendSmtpEmail();
    sendSmtpEmail.to = [{ email }];
    sendSmtpEmail.sender = { email: "videotube.support@gmail.com", name: "VideoTube" };
    sendSmtpEmail.subject = "Verify your email — VideoTube";
    sendSmtpEmail.htmlContent = `
        <h2>Welcome to VideoTube!</h2>
        <p>Click the link below to verify your email — it expires in 24 hours.</p>
        <a href="${verifyURL}">${verifyURL}</a>
    `;

    await apiInstance.sendTransacEmail(sendSmtpEmail);
};