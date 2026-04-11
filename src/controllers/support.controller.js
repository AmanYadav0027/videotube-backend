import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { SupportTicket } from "../models/support.models.js";

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
