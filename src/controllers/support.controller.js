import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { SupportTicket } from "../models/support.models.js";
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// POST /api/v2/support/contact
// Works for both logged-in and guest users.
// Auth middleware is optional — use optionalVerifyJWT.
const submitContactForm = asyncHandler(async (req, res) => {
    const { subject, message, email } = req.body;

    if (!subject?.trim() || !message?.trim()) {
        throw new ApiError(400, "Subject and message are required");
    }

    if (subject.trim().length > 200) {
        throw new ApiError(400, "Subject must be under 200 characters");
    }

    if (message.trim().length > 5000) {
        throw new ApiError(400, "Message must be under 5000 characters");
    }

    // If logged in, pull email from their account; otherwise use the submitted email
    const resolvedEmail = req.user?.email || email?.trim()?.toLowerCase();

    const ticket = await SupportTicket.create({
        user: req.user?._id ?? null,
        email: resolvedEmail,
        subject: subject.trim(),
        message: message.trim(),
    });

    // Send email notification to yourself
    try {
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: process.env.EMAIL_USER,
            subject: `[VideoTube Support] ${subject.trim()}`,
            html: `
            <h3>New Support Ticket</h3>
            <p><b>Ticket ID:</b> ${ticket._id}</p>
            <p><b>From:</b> ${resolvedEmail || "Guest"}</p>
            <p><b>Subject:</b> ${subject.trim()}</p>
            <p><b>Message:</b><br/>${message.trim().replace(/\n/g, "<br/>")}</p>
        `,
        });
    } catch (err) {
        // Don't fail the request if email fails
        console.error("Support email failed:", err.message);
    }

    return res
        .status(201)
        .json(
            new ApiResponse(
                201,
                { ticketId: ticket._id },
                "Message received. We'll get back to you soon."
            )
        );
});

export { submitContactForm };
