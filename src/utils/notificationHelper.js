import { Notification } from "../models/notification.models.js";

export const createNotification = async ({
    recipient,
    actor,
    type,
    video = null,
    comment = null,
}) => {
    try {
        if (recipient.toString() === actor.toString()) return; // no self-notifs
        await Notification.create({ recipient, actor, type, video, comment });
    } catch (err) {
        console.error("[notification] failed to create:", err.message);
    }
};

// ── Convenience wrappers ────────────────────────────────────────────────────

export const notifyLike = (recipientId, actorId, videoId) =>
    createNotification({
        recipient: recipientId,
        actor: actorId,
        type: "like",
        video: videoId,
    });

export const notifySubscribe = (recipientId, actorId) =>
    createNotification({
        recipient: recipientId,
        actor: actorId,
        type: "subscribe",
    });

export const notifyComment = (recipientId, actorId, videoId, commentId) =>
    createNotification({
        recipient: recipientId,
        actor: actorId,
        type: "comment",
        video: videoId,
        comment: commentId,
    });

export const notifyUpload = (subscriberIds, actorId, videoId) => {
    // Fan-out: notify every subscriber when a new video is published
    subscriberIds.forEach((id) =>
        createNotification({
            recipient: id,
            actor: actorId,
            type: "upload",
            video: videoId,
        })
    );
};
