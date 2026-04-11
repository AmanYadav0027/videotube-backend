import mongoose, { Schema } from "mongoose";

const notificationSchema = new Schema(
    {
        recipient: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        actor: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        type: {
            type: String,
            enum: ["like", "subscribe", "comment", "upload"],
            required: true,
        },
        video: { type: Schema.Types.ObjectId, ref: "Video", default: null },
        comment: { type: Schema.Types.ObjectId, ref: "Comment", default: null },
        read: {
            type: Boolean,
            default: false,
        },
    },
    { timestamps: true }
);

// Index for fast unread count queries
notificationSchema.index({ recipient: 1, read: 1 });

export const Notification = mongoose.model("Notification", notificationSchema);
