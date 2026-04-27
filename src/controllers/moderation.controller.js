import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { Comment } from "../models/comment.models.js";
import { Tweet } from "../models/tweet.model.js";
import { Video } from "../models/video.models.js";
import mongoose, { isValidObjectId } from "mongoose";

// GET /api/v2/dashboard/flagged
export const getFlaggedContent = asyncHandler(async (req, res) => {
    const ownerId = req.user._id;

    // Get all video IDs owned by this user
    const ownedVideoIds = await Video.find({ owner: ownerId }).distinct("_id");

    // Fetch flagged comments on those videos + flagged tweet comments by this user
    const [flaggedComments, flaggedTweets] = await Promise.all([
        Comment.find({
            isFlagged: true,
            $or: [
                { video: { $in: ownedVideoIds } }, // comments on their videos
                { owner: ownerId }, // their own comments flagged
            ],
        })
            .populate("owner", "username avatar")
            .populate("video", "title")
            .sort({ createdAt: -1 })
            .lean(),

        Tweet.find({ isFlagged: true, owner: ownerId })
            .sort({ createdAt: -1 })
            .lean(),
    ]);

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                comments: flaggedComments,
                tweets: flaggedTweets,
            },
            "Flagged content fetched successfully"
        )
    );
});

// POST /api/v2/dashboard/flagged/restore/:type/:id
export const restoreFlaggedContent = asyncHandler(async (req, res) => {
    const { type, id } = req.params;

    if (!isValidObjectId(id)) throw new ApiError(400, "Invalid ID");
    if (!["comment", "tweet"].includes(type))
        throw new ApiError(400, "Type must be 'comment' or 'tweet'");

    const Model = type === "comment" ? Comment : Tweet;
    const doc = await Model.findById(id);

    if (!doc) throw new ApiError(404, `${type} not found`);

    // Only the owner of the video (for comments) or tweet owner can restore
    if (doc.owner.toString() !== req.user._id.toString()) {
        // For video comments, also allow the video owner to restore
        if (type === "comment" && doc.video) {
            const video = await Video.findById(doc.video).select("owner");
            if (!video || video.owner.toString() !== req.user._id.toString()) {
                throw new ApiError(
                    403,
                    "Not authorized to restore this content"
                );
            }
        } else {
            throw new ApiError(403, "Not authorized to restore this content");
        }
    }

    await Model.findByIdAndUpdate(id, { isFlagged: false });

    return res
        .status(200)
        .json(new ApiResponse(200, {}, `${type} restored successfully`));
});
