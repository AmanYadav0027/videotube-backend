import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
    deleteFromCloudinary,
    uploadOnCloudinary,
} from "../utils/cloudinary.js";
import { Video } from "../models/video.models.js";
import { User } from "../models/user.models.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import mongoose, { isValidObjectId } from "mongoose";
import fs from "fs";
import { generateFileHash } from "../utils/fileHash.js";

const publishAVideo = asyncHandler(async (req, res) => {
    // grab title and description from req.body
    // check if they exist
    //get local file path from req.files for both video and thumbnail
    //throw error if any one of the file is missing
    //upload on cloudinary
    //save to database
    //return success

    const { title, description } = req.body;

    if ([title, description].some((field) => field?.trim() === "")) {
        throw new ApiError(400, "VideoFile and Thumbnail are required");
    }

    const videoFileLocalPath = req.files?.videoFile?.[0]?.path;

    const thumbnailLocalPath = req.files?.thumbnail?.[0]?.path;

    if (!(videoFileLocalPath && thumbnailLocalPath)) {
        throw new ApiError(400, "VideoFile and Thumbnail are required");
    }

    // FILE HASHING
    const fileFingerPrint = await generateFileHash(videoFileLocalPath);

    const existingVideoFile = await Video.findOne({
        fileHash: fileFingerPrint,
    });

    if (existingVideoFile) {
        fs.unlinkSync(videoFileLocalPath);
        fs.unlinkSync(thumbnailLocalPath);

        throw new ApiError(
            409,
            "This Exact video file has already been uploaded to the server."
        );
    }

    const videoFile = await uploadOnCloudinary(videoFileLocalPath);

    const thumbnail = await uploadOnCloudinary(thumbnailLocalPath);

    if (!(videoFile && thumbnail)) {
        throw new ApiError(400, "videoFile and Thumbnail is required");
    }

    const video = await Video.create({
        videoFile: videoFile.url,
        thumbnail: thumbnail.url,
        title,
        description,
        duration: videoFile.duration,
        owner: req.user._id,
        fileHash: fileFingerPrint,
    });

    if (!video) {
        throw new ApiError(
            500,
            "Something went wrong while publishing the video"
        );
    }

    return res
        .status(201)
        .json(new ApiResponse(200, video, "video published successfully"));
});

const getVideoById = asyncHandler(async (req, res) => {
    const { videoId } = req.params;

    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid videoId");
    }

    const video = await Video.aggregate([
        // Stage 1: find the video
        {
            $match: {
                _id: new mongoose.Types.ObjectId(videoId),
            },
        },
        // Stage 2: join owner from users collection
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "owner",
            },
        },
        // Stage 3: $unwind converts owner from [{...}] to {...}
        {
            $unwind: "$owner",
        },
        // Stage 4: join likes to count them
        {
            $lookup: {
                from: "likes",
                localField: "_id",
                foreignField: "video",
                as: "likes",
            },
        },
        // Stage 5: project only what frontend needs
        {
            $project: {
                videoFile: 1,
                thumbnail: 1,
                title: 1,
                description: 1,
                duration: 1,
                views: 1,
                createdAt: 1,
                likesCount: { $size: "$likes" },
                "owner._id": 1,
                "owner.username": 1,
                "owner.fullName": 1,
                "owner.avatar": 1,
            },
        },
    ]);

    if (!video?.length) {
        throw new ApiError(404, "video not found");
    }

    await Video.findByIdAndUpdate(videoId, { $inc: { views: 1 } });

    if (req.user?._id) {
        await User.findByIdAndUpdate(req.user._id, {
            $addToSet: { watchHistory: videoId },
        });
    }

    return res
        .status(200)
        .json(new ApiResponse(200, video, "video found successfully"));
});

const updateVideo = asyncHandler(async (req, res) => {
    //extract the videoId from req.params and title and description from req.body
    //validate all three
    //check if user uploaded a thumbnail
    //if yes upload it on cloudinary
    //delet the old thumbnail by fetching existing details of video from database
    //update the database
    //return success

    const { videoId } = req.params;
    const { title, description } = req.body;

    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid videoId");
    }

    if (!(title && description)) {
        throw new ApiError(400, "title or description is missing");
    }

    const video = await Video.findById(videoId);

    if (!video) {
        throw new ApiError(404, "video not found");
    }

    const updateData = {
        title,
        description,
    };

    const thumbnailLocalPath = req.file?.path;

    if (thumbnailLocalPath) {
        const thumbnailupload = await uploadOnCloudinary(thumbnailLocalPath);

        if (!thumbnailupload.url) {
            throw new ApiError(400, "Error while uploading thumbnail");
        }

        updateData.thumbnail = thumbnailupload.url;

        if (video.thumbnail) {
            await deleteFromCloudinary(video.thumbnail);
        }
    }

    const updatedVideo = await Video.findByIdAndUpdate(
        videoId,
        {
            $set: updateData,
        },
        { new: true }
    );

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                updatedVideo,
                "video detail updated successfully"
            )
        );
});

const deleteVideo = asyncHandler(async (req, res) => {
    //get videoId from params
    //validate
    //fetch the video using videoId
    //check if the video is returned or not
    //delete the video by calling deleteFromCloudinary utility
    //delete from database
    //return success

    const { videoId } = req.params;

    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid videoId");
    }

    const video = await Video.findById(videoId);

    if (!video) {
        throw new ApiError(
            404,
            "the video doesn't exist or was already deleted"
        );
    }

    await deleteFromCloudinary(video.thumbnail);
    await deleteFromCloudinary(video.videoFile, "video");

    await Video.findByIdAndDelete(videoId);

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "video deleted successfully"));
});

const getAllVideos = asyncHandler(async (req, res) => {
    //get data from req.query
    //convert page and limit in integer cause req.query always return string

    //aggregate pipeline  //imp and difficult //needs attention

    //Execute Pagination
    //return success

    const { page = 1, limit = 10, query, sortBy, sortType, userId } = req.query;

    const matchCondition = {};

    if (query) {
        matchCondition.$or = [
            { title: { $regex: query, $options: "i" } },
            { description: { $regex: query, $options: "i" } },
        ];
    }

    if (userId) {
        matchCondition.owner = new mongoose.Types.objectId(userId);
    }

    const sortOptions = {};

    if (sortBy && sortType) {
        sortOptions[sortBy] = sortType === "asc" ? 1 : -1;
    } else {
        sortOptions.createdAt = -1;
    }

    // Replace this block in getAllVideos
    const videoAggregate = Video.aggregate([
        {
            $match: matchCondition,
        },
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "owner",
            },
        },
        {
            // $lookup returns an array. $unwind turns it back into a single object.
            $unwind: "$owner",
        },
        {
            // Security Check: Only send the specific owner data the frontend needs!
            $project: {
                videoFile: 1,
                thumbnail: 1,
                title: 1,
                description: 1,
                duration: 1,
                views: 1,
                isPublished: 1,
                createdAt: 1,
                "owner._id": 1,
                "owner.username": 1,
                "owner.avatar": 1,
            },
        },
        {
            $sort: sortOptions,
        },
    ]);

    const options = {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
    };

    const videos = await Video.aggregatePaginate(videoAggregate, options);

    return res
        .status(200)
        .json(new ApiResponse(200, videos, "Videos fetched successfully"));
});

const togglePublishStatus = asyncHandler(async (req, res) => {
    //get videoId from params
    //fetch the vide using id
    //use not operator(!) to flip
    //save changes in db
    //return success

    const { videoId } = req.params;

    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid Object Id");
    }

    const video = await Video.findById(videoId);

    if (!video) {
        throw new ApiError(404, "Video is not available");
    }

    video.isPublished = !video.isPublished;

    await video.save({ validateBeforeSave: false });

    return res
        .status(200)
        .json(new ApiResponse(200, video, "status was toggled successfully"));
});

const incrementVideoViews = asyncHandler(async (req, res) => {
    const { videoId } = req.params;

    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid videoId");
    }

    await Video.findByIdAndUpdate(videoId, { $inc: { views: 1 } });

    return res.status(200).json(new ApiResponse(200, {}, "View counted"));
});

export {
    publishAVideo,
    getVideoById,
    updateVideo,
    deleteVideo,
    getAllVideos,
    togglePublishStatus,
    incrementVideoViews,
};
