import mongoose from "mongoose";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Notification } from "../models/notification.models.js";

// GET /api/v2/notifications?filter=all|unread&page=1&limit=20
const getNotifications = asyncHandler(async (req, res) => {
    const { filter = "all", page = 1, limit = 20 } = req.query;

    const match = { recipient: req.user._id };
    if (filter === "unread") match.read = false;

    const notifications = await Notification.aggregate([
        { $match: match },
        { $sort: { createdAt: -1 } },
        { $skip: (parseInt(page) - 1) * parseInt(limit) },
        { $limit: parseInt(limit) },
        // Join actor info
        {
            $lookup: {
                from: "users",
                localField: "actor",
                foreignField: "_id",
                as: "actor",
                pipeline: [
                    { $project: { username: 1, avatar: 1, fullName: 1 } },
                ],
            },
        },
        { $unwind: "$actor" },
        // Join video title/thumbnail if present
        {
            $lookup: {
                from: "videos",
                localField: "video",
                foreignField: "_id",
                as: "video",
                pipeline: [{ $project: { title: 1, thumbnail: 1 } }],
            },
        },
        {
            $addFields: {
                video: { $ifNull: [{ $first: "$video" }, null] },
            },
        },
    ]);

    const unreadCount = await Notification.countDocuments({
        recipient: req.user._id,
        read: false,
    });

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                { notifications, unreadCount },
                "Notifications fetched"
            )
        );
});

// PATCH /api/v2/notifications/read-all
const markAllRead = asyncHandler(async (req, res) => {
    await Notification.updateMany(
        { recipient: req.user._id, read: false },
        { $set: { read: true } }
    );
    return res
        .status(200)
        .json(new ApiResponse(200, {}, "All notifications marked as read"));
});

// PATCH /api/v2/notifications/:notificationId/read
const markOneRead = asyncHandler(async (req, res) => {
    const { notificationId } = req.params;

    const notif = await Notification.findOne({
        _id: notificationId,
        recipient: req.user._id,
    });

    if (!notif) throw new ApiError(404, "Notification not found");

    notif.read = true;
    await notif.save({ validateBeforeSave: false });

    return res.status(200).json(new ApiResponse(200, {}, "Marked as read"));
});

// DELETE /api/v2/notifications/:notificationId
const deleteNotification = asyncHandler(async (req, res) => {
    const { notificationId } = req.params;

    const notif = await Notification.findOneAndDelete({
        _id: notificationId,
        recipient: req.user._id,
    });

    if (!notif) throw new ApiError(404, "Notification not found");

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Notification dismissed"));
});

export { getNotifications, markAllRead, markOneRead, deleteNotification };
