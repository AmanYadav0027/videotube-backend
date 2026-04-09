import { isValidObjectId } from "mongoose";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { Comment } from "../models/comment.models.js";
import mongoose from "mongoose";
import { classifyComment } from "../utils/moderationService.js";

const addComment = asyncHandler(async (req, res) => {
    const { videoId } = req.params;
    if (!isValidObjectId(videoId)) throw new ApiError(400, "Invalid VideoId");

    const { content } = req.body;
    if (!content || content.trim() === "")
        throw new ApiError(400, "Content is required");

    const comment = await Comment.create({
        video: videoId,
        content,
        owner: req.user?._id,
    });

    if (!comment) throw new ApiError(500, "failed to create a comment");

    // Fire-and-forget moderation — response already sent, runs in background
    res.status(201).json(
        new ApiResponse(201, comment, "Comment created successfully")
    );

    classifyComment(content)
        .then(async ({ toxic }) => {
            if (toxic) {
                await Comment.findByIdAndUpdate(comment._id, {
                    isFlagged: true,
                });
                console.log(
                    `[moderation][comment:${comment._id}] Flagged as toxic.`
                );
            }
        })
        .catch((err) => {
            console.error(
                `[moderation][comment:${comment._id}] Moderation error.`,
                { error: err.message }
            );
        });
});

const updateComment = asyncHandler(async (req, res) => {
    const { commentId } = req.params;
    if (!isValidObjectId(commentId))
        throw new ApiError(400, "Invalid CommentId");

    const { content } = req.body;
    if (!content || content.trim() === "")
        throw new ApiError(400, "Content is required");

    const comment = await Comment.findById(commentId);
    if (!comment) throw new ApiError(404, "Comment doesn't exist");
    if (comment.owner.toString() !== req.user?._id.toString())
        throw new ApiError(
            403,
            "You do not have permission to modify this comment"
        );

    comment.content = content;
    comment.isFlagged = false; // reset flag on edit — re-moderate below
    const updatedComment = await comment.save();

    res.status(200).json(
        new ApiResponse(200, updatedComment, "Comment updated successfully")
    );

    // Re-moderate edited comment
    classifyComment(content)
        .then(async ({ toxic }) => {
            if (toxic) {
                await Comment.findByIdAndUpdate(commentId, { isFlagged: true });
                console.log(
                    `[moderation][comment:${commentId}] Re-flagged after edit.`
                );
            }
        })
        .catch(() => {});
});

const deleteComment = asyncHandler(async (req, res) => {
    const { commentId } = req.params;
    if (!isValidObjectId(commentId))
        throw new ApiError(400, "Invalid CommentId");

    const comment = await Comment.findById(commentId);
    if (!comment) throw new ApiError(404, "comment Doesn't Exist");
    if (comment.owner.toString() !== req.user?._id.toString())
        throw new ApiError(
            403,
            "You do not have permission to delete this comment"
        );

    await comment.deleteOne();
    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Comment deleted successfully"));
});

const getVideoComments = asyncHandler(async (req, res) => {
    const { videoId } = req.params;
    if (!isValidObjectId(videoId)) throw new ApiError(400, "Invalid videoId");

    const { page = 1, limit = 1 } = req.query;

    const commentAggregate = Comment.aggregate([
        {
            $match: {
                video: new mongoose.Types.ObjectId(videoId),
                isFlagged: { $ne: true }, // ← exclude flagged comments
            },
        },
        { $sort: { createdAt: -1 } },
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "owner",
            },
        },
        { $unwind: "$owner" },
    ]);

    const options = { page: parseInt(page, 10), limit: parseInt(limit, 10) };
    const comments = await Comment.aggregatePaginate(commentAggregate, options);

    return res
        .status(200)
        .json(new ApiResponse(200, comments, "Comments fetched successfully"));
});

const addTweetComment = asyncHandler(async (req, res) => {
    const { tweetId } = req.params;
    const { content } = req.body;

    if (!isValidObjectId(tweetId)) throw new ApiError(400, "Invalid tweetId");
    if (!content || content.trim() === "")
        throw new ApiError(400, "Comment content is required");

    const comment = await Comment.create({
        content,
        tweet: tweetId,
        owner: req.user?._id,
    });

    if (!comment) throw new ApiError(500, "Failed to add comment");

    res.status(201).json(
        new ApiResponse(201, comment, "Comment added successfully")
    );

    classifyComment(content)
        .then(async ({ toxic }) => {
            if (toxic) {
                await Comment.findByIdAndUpdate(comment._id, {
                    isFlagged: true,
                });
                console.log(
                    `[moderation][tweetComment:${comment._id}] Flagged as toxic.`
                );
            }
        })
        .catch(() => {});
});

export {
    addComment,
    updateComment,
    deleteComment,
    getVideoComments,
    addTweetComment,
};
