import { isValidObjectId } from "mongoose";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { Subscription } from "./../models/subscription.models";
import { ApiResponse } from "../utils/ApiResponse";

const toggleSubscription = asyncHandler(async (req, res) => {
    //get channelId from params and validate
    //check if the user is subscribing his own channel
    //check for existing subscription
    // if it exist delete the doc
    // if not create a doc containing user and channel id

    const { channelId } = req.params;

    if (!isValidObjectId(channelId)) {
        throw new ApiError(400, "Invaliid Channel Id");
    }

    if (channelId === req.user?._id.toString()) {
        throw new ApiError(400, "You can't subscribe to your own channel.");
    }

    const subscription = await Subscription.findOne({
        subscriber: req.user?._id,
        channel: channelId,
    });

    if (subscription) {
        await subscription.deleteOne();
        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    { subscribed: false },
                    "Unsubscribed successfully"
                )
            );
    } else {
        await Subscription.create({
            subscriber: req.user?._id,
            channel: channelId,
        });
        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    { subscribed: true },
                    "Subscribed successfully"
                )
            );
    }
});

const getUserChannelSubscribers = asyncHandler(async (req, res) => {
    //extract channelId from params and validate
    //fetch channel matching channelId from Subscription collection
    //get the subscriber and populate to get there details
    //map to get only subscribers data
    //return success

    const { channelId } = req.params;

    if (!isValidObjectId(channelId)) {
        throw new ApiError(400, "Invalid Channel Id");
    }

    const subscribers = await Subscription.find({
        channel: channelId,
    }).populate("subscriber", "fullName email username avatar");

    const subscriberList = subscribers.map((sub) => sub.subscriber);

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                subscriberList,
                "Subscribers fetched successfully"
            )
        );
});

const getSubscribedChannels = asyncHandler(async (req, res) => {
    //get userid and validate
    //fetch channel matching userid from Subscription collection
    //populate to get channel details
    //use .map to get onlu channels data
    //return success

    const { subscriberId } = req.params;

    if (!isValidObjectId(subscriberId)) {
        throw new ApiError(400, "Invalid subscriber Id");
    }

    const subscribedChannels = await Subscription.find({
        subscriber: subscriberId,
    }).populate("channel", "fullName username avatar");

    const subscribedChannelsList = subscribedChannels.map(
        (chanl) => chanl.channel
    );

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                subscribedChannelsList,
                "Subscribed Channels list fetched successfully"
            )
        );
});

export { toggleSubscription, getUserChannelSubscribers, getSubscribedChannels };
