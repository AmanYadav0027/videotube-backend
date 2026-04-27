import { isValidObjectId } from "mongoose";
import { asyncHandler } from "../utils/asyncHandler.js";
import { Like } from "../models/like.models.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import mongoose from "mongoose";
import { notifyLike } from "../utils/notificationHelper.js";
import { Video } from "../models/video.models.js";

const toggleVideoLike = asyncHandler(async (req, res) => {
    //get videoId from params and validate
    // fetch the video document so we have video.owner for the notification
    //check if the like doc exist matching with the userId
    //declare isliked
    //if yes delete the doc and set isliked to false
    //if not create one and set isliked to true
    // notify video owner on like only (not on unlike)
    //return success

    const { videoId } = req.params;

    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid videoId");
    }

    const video = await Video.findById(videoId).select("owner");
    if (!video) {
        throw new ApiError(404, "Video not found");
    }

    const existingLike = await Like.findOne({
        video: videoId,
        likedBy: req.user._id,
    });

    let isLiked;
    if (existingLike) {
        await existingLike.deleteOne();
        isLiked = false;
    } else {
        await Like.create({ video: videoId, likedBy: req.user._id });
        isLiked = true;
    }

    if (isLiked) notifyLike(video.owner, req.user._id, videoId);

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                { VideoLiked: isLiked },
                isLiked ? "Video liked" : "Video unliked"
            )
        );
});

const toggleCommentLike = asyncHandler(async (req, res) => {
    //get commentId from params and validate
    //check if the comment docs of specifc user exist using likedby: req.user?._id in findOne
    //if it exist delete the doc using deleteOne
    //if not create a doc and give a message response comment liked successfully
    //return success

    const { commentId } = req.params;

    if (!isValidObjectId(commentId)) {
        throw new ApiError(400, "Invalid commentId");
    }

    const commentLike = await Like.findOne({
        comment: commentId,
        likedBy: req.user?._id,
    });

    if (commentLike) {
        await commentLike.deleteOne();
        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    { commentLiked: false },
                    "Comment disliked successfully"
                )
            );
    } else {
        await Like.create({
            comment: commentId,
            likedBy: req.user?._id,
        });
        return res
            .status(201)
            .json(
                new ApiResponse(
                    201,
                    { commentLiked: true },
                    "Comment liked successfully"
                )
            );
    }
});

const toggleTweetLike = asyncHandler(async (req, res) => {
    //get tweetId from params and validate
    //check if the tweet docs of specifc user exist using likedby: req.user?._id in findOne
    //if it exist delete the doc using deleteOne
    //if not create a doc and give a message response tweet liked successfully
    //return success

    const { tweetId } = req.params;

    if (!isValidObjectId(tweetId)) {
        throw new ApiError(400, "Invalid tweetId");
    }

    const tweetLiked = await Like.findOne({
        tweet: tweetId,
        likedBy: req.user?._id,
    });

    if (tweetLiked) {
        await tweetLiked.deleteOne();
        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    { tweetLiked: false },
                    "Tweet disliked successfully"
                )
            );
    } else {
        await Like.create({
            tweet: tweetId,
            likedBy: req.user?._id,
        });

        return res
            .status(201)
            .json(
                new ApiResponse(
                    201,
                    { tweetLiked: true },
                    "Tweet liked successfully"
                )
            );
    }
});

const getLikedVideos = asyncHandler(async (req, res) => {
    //get user Id and validate
    //use aggregate pipelines
    //$match for collecting liked videos of current user
    //$lookup to join videos collection , (write video in localfield)
    //use $unwind to convert it into single object
    //in $project write title=1, description...
    //return success

    const likedVideos = await Like.aggregate([
        {
            $match: {
                likedBy: new mongoose.Types.ObjectId(req.user?._id),
                video: { $exists: true },
            },
        },
        {
            $lookup: {
                from: "videos",
                localField: "video",
                foreignField: "_id",
                as: "videoDetails",
            },
        },
        {
            $unwind: {
                path: "$videoDetails",
                preserveNullAndEmptyArrays: false,
            },
        },
        {
            $lookup: {
                from: "users",
                localField: "videoDetails.owner",
                foreignField: "_id",
                as: "ownerDetails",
            },
        },
        {
            $unwind: {
                path: "$ownerDetails",
                preserveNullAndEmptyArrays: true,
            },
        },
        {
            $project: {
                _id: "$videoDetails._id",
                title: "$videoDetails.title",
                description: "$videoDetails.description",
                thumbnail: "$videoDetails.thumbnail",
                views: "$videoDetails.views",
                duration: "$videoDetails.duration",
                createdAt: "$videoDetails.createdAt",
                owner: {
                    _id: { $ifNull: ["$ownerDetails._id", null] },
                    username: {
                        $ifNull: ["$ownerDetails.username", "Unknown User"],
                    },
                    fullName: {
                        $ifNull: ["$ownerDetails.fullName", "Unknown User"],
                    },
                    avatar: { $ifNull: ["$ownerDetails.avatar", ""] },
                },
            },
        },
    ]);

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                likedVideos,
                "fetched all liked videos successfully"
            )
        );
});

export { toggleVideoLike, toggleCommentLike, toggleTweetLike, getLikedVideos };
