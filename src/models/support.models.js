import mongoose, { Schema } from "mongoose";

const supportTicketSchema = new Schema(
    {
        user: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null, // null = submitted while logged out
        },
        email: {
            type: String,
            trim: true,
            lowercase: true,
        },
        subject: {
            type: String,
            required: true,
            trim: true,
            maxlength: 200,
        },
        message: {
            type: String,
            required: true,
            trim: true,
            maxlength: 5000,
        },
        status: {
            type: String,
            enum: ["open", "in_review", "resolved"],
            default: "open",
        },
    },
    { timestamps: true }
);

export const SupportTicket = mongoose.model(
    "SupportTicket",
    supportTicketSchema
);
