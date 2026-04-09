import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { Tweet } from "../models/tweet.model.js";
import { isValidObjectId } from "mongoose";
import { ApiResponse } from "../utils/ApiResponse.js";
import mongoose from "mongoose";
import { classifyComment } from "../utils/moderationService.js";

const createTweet = asyncHandler(async (req, res) => {
    const { content } = req.body;
    if (!content) throw new ApiError(400, "Content is required");

    const tweet = await Tweet.create({ content, owner: req.user?._id });
    if (!tweet) throw new ApiError(500, "Failed to create a tweet");

    res.status(201).json(
        new ApiResponse(201, tweet, "Tweet created successfully")
    );

    // Fire-and-forget moderation
    classifyComment(content)
        .then(async ({ toxic }) => {
            if (toxic) {
                await Tweet.findByIdAndUpdate(tweet._id, { isFlagged: true });
                console.log(
                    `[moderation][tweet:${tweet._id}] Flagged as toxic.`
                );
            }
        })
        .catch((err) => {
            console.error(
                `[moderation][tweet:${tweet._id}] Moderation error.`,
                { error: err.message }
            );
        });
});

const getUserTweets = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    if (!isValidObjectId(userId)) throw new ApiError(400, "Invalid UserId");

    const allTweets = await Tweet.aggregate([
        {
            $match: {
                owner: new mongoose.Types.ObjectId(userId),
                isFlagged: { $ne: true }, // ← exclude flagged tweets
            },
        },
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "ownerDetails",
            },
        },
        { $unwind: { path: "$ownerDetails" } },
        {
            $lookup: {
                from: "likes",
                localField: "_id",
                foreignField: "tweet",
                as: "likeDetails",
            },
        },
        {
            $lookup: {
                from: "comments",
                localField: "_id",
                foreignField: "tweet",
                as: "commentDetails",
            },
        },
        {
            $lookup: {
                from: "tweets",
                localField: "_id",
                foreignField: "originalTweet",
                as: "retweetDetails",
            },
        },
        {
            $addFields: {
                likesCount: { $size: "$likeDetails" },
                isLiked: {
                    $cond: {
                        if: { $in: [req.user?._id, "$likeDetails.likedBy"] },
                        then: true,
                        else: false,
                    },
                },
            },
        },
        {
            $project: {
                content: 1,
                createdAt: 1,
                likesCount: 1,
                isLiked: 1,
                owner: {
                    _id: "$ownerDetails._id",
                    username: "$ownerDetails.username",
                    fullName: "$ownerDetails.fullName",
                    avatar: "$ownerDetails.avatar",
                },
            },
        },
        { $sort: { createdAt: -1 } },
    ]);

    return res
        .status(200)
        .json(
            new ApiResponse(200, allTweets, "All tweets fetched Successfully")
        );
});

const updateTweet = asyncHandler(async (req, res) => {
    const { tweetId } = req.params;
    if (!isValidObjectId(tweetId)) throw new ApiError(400, "Invalid tweetId");

    const { content } = req.body;
    if (!content) throw new ApiError(400, "Content not found");

    const tweet = await Tweet.findById(tweetId);
    if (!tweet) throw new ApiError(404, "Tweet not found");
    if (tweet.owner.toString() !== req.user?._id.toString())
        throw new ApiError(
            403,
            "You do not have permission to modify this tweet"
        );

    tweet.content = content;
    tweet.isFlagged = false; // reset on edit, re-moderate below
    const updatedTweet = await tweet.save();

    res.status(200).json(
        new ApiResponse(200, updatedTweet, "Tweet updated successfully")
    );

    classifyComment(content)
        .then(async ({ toxic }) => {
            if (toxic) {
                await Tweet.findByIdAndUpdate(tweetId, { isFlagged: true });
                console.log(
                    `[moderation][tweet:${tweetId}] Re-flagged after edit.`
                );
            }
        })
        .catch(() => {});
});

const deleteTweet = asyncHandler(async (req, res) => {
    const { tweetId } = req.params;
    if (!isValidObjectId(tweetId)) throw new ApiError(400, "Invalid TweetId");

    const tweet = await Tweet.findById(tweetId);
    if (!tweet) throw new ApiError(404, "Tweet not found");
    if (tweet.owner.toString() !== req.user?._id.toString())
        throw new ApiError(
            403,
            "You do not have permission to delete this tweet"
        );

    await tweet.deleteOne();
    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Tweet deleted successfully"));
});

const toggleRetweet = asyncHandler(async (req, res) => {
    const { tweetId } = req.params;
    if (!isValidObjectId(tweetId)) throw new ApiError(400, "Invalid tweetId");

    const existingRetweet = await Tweet.findOne({
        owner: req.user?._id,
        originalTweet: tweetId,
    });

    if (existingRetweet) {
        await existingRetweet.deleteOne();
        return res
            .status(200)
            .json(
                new ApiResponse(200, { retweeted: false }, "Retweet removed")
            );
    } else {
        await Tweet.create({ owner: req.user?._id, originalTweet: tweetId });
        return res
            .status(201)
            .json(
                new ApiResponse(
                    201,
                    { retweeted: true },
                    "Retweeted successfully"
                )
            );
    }
});

export { createTweet, getUserTweets, updateTweet, deleteTweet, toggleRetweet };
