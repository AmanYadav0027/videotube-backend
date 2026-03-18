import { isValidObjectId } from "mongoose";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";

const addComment = asyncHandler(async (req, res) => {
    //extract videoId from params and validate
    //get content from body and check if is ti empty or not
    //create a comment using create method
    //give error if the method fails to create the comment
    //return success

    const { videoId } = req.params;
    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid VideoId");
    }

    const { content } = req.body;
    if (!content || content.trim() === "") {
        throw new ApiError(400, "Content is required");
    }

    const comment = await Comment.create({
        video: videoId,
        content,
        owner: req.user?._id,
    });

    if (!comment) {
        throw new ApiError(500, "failed to create a comment");
    }

    return res
        .status(201)
        .json(new ApiResponse(201, comment, "Comment created successfully"));
});

const updateComment = asyncHandler(async (req, res) => {
    //get commentId from params and validate
    //get content from body and check for empty string
    //check if the owner of the comment is the making changes
    //use findOneandupdate to update the content
    //return success

    const { commentId } = req.params;
    if (!isValidObjectId(commentId)) {
        throw new ApiError(400, "Invalid CommentId");
    }

    const { content } = req.body;
    if (!content || content.trim() === "") {
        throw new ApiError(400, "Content is required");
    }

    const comment = await Comment.findById(commentId);

    if (!comment) {
        throw new ApiError(404, "Comment doesn't exist");
    }

    if (comment.owner.toString() !== req.user?._id.toString()) {
        throw new ApiError(
            403,
            "You do not have permission to modify this comment"
        );
    }

    comment.content = content;
    const updatedComment = await comment.save();

    return res
        .status(200)
        .json(
            new ApiResponse(200, updatedComment, "Comment updated successfully")
        );
});

const deleteComment = asyncHandler(async (req, res) => {
    //get commentId from params and validate
    //check if the owner is deleting the comment
    //delete using deleteOne
    //return success

    const { commentId } = req.params;
    if (!isValidObjectId(commentId)) {
        throw new ApiError(400, "Invalid CommentId");
    }

    const comment = await Comment.findById(commentId);
    if (!comment) {
        throw new ApiError(404, "comment Doesn't Exist");
    }

    if (comment.owner.toString() !== req.user?._id.toString()) {
        throw new ApiError(
            403,
            "You do not have permission to delete this comment"
        );
    }

    await comment.deleteOne();

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Comment deleted successfully"));
});

const getVideoComments = asyncHandler(async (req, res) => {
    //get page=1, limit=10, query, sortBy, sortType, from req.query
    //get videoId from params validate the videoId
    //use parseInt to convert page and limit into numbers
    //use $match sortby and sorttype to filter data
    //create options object
    //execuet the aggregate-pagginate
    //return success

    const { videoId } = req.params;
    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid videoId");
    }

    const { page = 1, limit = 1 } = req.query;

    const commentAggregate = Comment.aggregate([
        {
            $match: {
                video: new mongoose.Types.ObjectId(videoId),
            },
        },
        {
            $sort: {
                createdAt: -1,
            },
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
            $unwind: "$owner",
        },
    ]);

    const options = {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
    };

    const comments = await Comment.aggregatePaginate(commentAggregate, options);

    return res
        .status(200)
        .json(new ApiResponse(200, comments, "Comments fetched successfully"));
});

export { addComment, updateComment, deleteComment, getVideoComments };
