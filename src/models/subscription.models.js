import mongoose, { Schema } from "mongoose";

const subscriptionSchema = new Schema(
    {
        subscriber: {
            type: Schema.Types.ObjectId, //one who is subscribing
            ref: "User",
        },
        channel: {
            type: Schema.Types.ObjectId, //one to whom 'subscriber is subscribing
            ref: "User",
        },
    },
    { timestamps: true }
);

subscriptionSchema.index({ subscriber: 1, channel: 1 }, { unique: true });

export const Subscription = mongoose.model("Subscription", subscriptionSchema);

// Notes on how subscription model works

// 1. whenever a user(for eg. a,b,c,d) subscribe a channel (for eg. CAC,HCC,FCC) it creates a new document every time like {ch --> CAC / subs --> a}

// 2. even if same user subscribe muitiple channel it creates new docs {ch --> CAC / subs --> b}, {ch --> HCC / subs --> b}

// 3. now to find the count the number of subs for a channel(CAC), we select documents with same channel(like docs with CAC)

// 4. to find how many channels does a user have subscribed we find the docs with same users and count the channels they have subscribed
