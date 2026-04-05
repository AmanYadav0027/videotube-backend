import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { Tweet } from "../models/tweet.model.js";
import { isValidObjectId } from "mongoose";
import { ApiResponse } from "../utils/ApiResponse.js";
import mongoose from "mongoose";

const createTweet = asyncHandler(async (req, res) => {
    // extract content from req.body
    // validate it to check they are not empty
    //create a database entry using create
    // give error if create method fails
    // return success

    const { content } = req.body;

    if (!content) {
        throw new ApiError(400, "Content is required");
    }

    const tweet = await Tweet.create({
        content,
        owner: req.user?._id,
    });

    if (!tweet) {
        throw new ApiError(500, "Failed to create a tweet");
    }

    return res
        .status(201)
        .json(new ApiResponse(201, tweet, "Tweet created successfully"));
});

const getUserTweets = asyncHandler(async (req, res) => {
    //get userId from params and validate
    //find all tweets using userId in find method
    //populate tweets to display owners fullname and avatar
    //check the length of tweets if its empty throw error tweets not found
    //return success

    const { userId } = req.params;

    if (!isValidObjectId(userId)) {
        throw new ApiError(400, "Invalid UserId");
    }

    const allTweets = await Tweet.aggregate([
        {
            $match: {
                owner: new mongoose.Types.ObjectId(userId),
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
        {
            $unwind: {
                path: "$ownerDetails",
            },
        },
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
                        if: {
                            $in: [req.user?._id, "$likeDetails.likedBy"],
                        },
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
        {
            $sort: {
                createdAt: -1, // Newest tweets first!
            },
        },
    ]);

    return res
        .status(200)
        .json(
            new ApiResponse(200, allTweets, "All tweets fetched Successfully")
        );
});

const updateTweet = asyncHandler(async (req, res) => {
    //get tweetId from params and validate
    //get content from body and validate
    //fetch tweet using findById
    //check if the owner is the one updating the tweet
    // update content
    //if failed to update throw error
    //return success

    const { tweetId } = req.params;
    if (!isValidObjectId(tweetId)) {
        throw new ApiError(400, "Invalid tweetId");
    }

    const { content } = req.body;
    if (!content) {
        throw new ApiError(400, "Content not found");
    }

    const tweet = await Tweet.findById(tweetId);

    if (!tweetId) {
        throw new ApiError(404, "Tweet Id not found");
    }

    if (tweet.owner.toString() !== req.user?._id.toString()) {
        throw new ApiError(
            403,
            "You do not have permission to modify this tweet"
        );
    }

    tweet.content = content;
    const updatedTweet = await tweet.save();

    return res
        .status(200)
        .json(new ApiResponse(200, updatedTweet, "Tweet updated successfully"));
});

const deleteTweet = asyncHandler(async (req, res) => {
    //get tweetId from params and validate
    //find the tweet using findbyid
    //check if the tweet exist
    //check if the owner is the one deleting
    //delete the tweet using deleteOne
    //return success

    const { tweetId } = req.params;
    if (!isValidObjectId(tweetId)) {
        throw new ApiError(400, "Invalid TweetId");
    }

    const tweet = await Tweet.findById(tweetId);
    if (!tweet) {
        throw new ApiError(404, "Tweet not found");
    }

    if (tweet.owner.toString() !== req.user?._id.toString()) {
        throw new ApiError(
            403,
            "You do not have permission to delete this tweet"
        );
    }

    await tweet.deleteOne();

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Tweet deleted successfully"));
});

const toggleRetweet = asyncHandler(async (req, res) => {
    const { tweetId } = req.params;

    if (!isValidObjectId(tweetId)) {
        throw new ApiError(400, "Invalid tweetId");
    }

    // Check if the user has already retweeted this specific tweet
    const existingRetweet = await Tweet.findOne({
        owner: req.user?._id,
        originalTweet: tweetId,
    });

    if (existingRetweet) {
        // Un-retweet: delete the retweet document
        await existingRetweet.deleteOne();
        return res
            .status(200)
            .json(
                new ApiResponse(200, { retweeted: false }, "Retweet removed")
            );
    } else {
        // Retweet: create a new tweet document that points to the original
        await Tweet.create({
            owner: req.user?._id,
            originalTweet: tweetId,
        });

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
