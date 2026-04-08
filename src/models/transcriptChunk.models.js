import mongoose, { Schema } from "mongoose";

const transcriptChunkSchema = new Schema(
    {
        videoId: {
            type: Schema.Types.ObjectId,
            ref: "Video",
            required: true,
            index: true,
        },
        chunkIndex: {
            type: Number,
            required: true,
        },
        text: {
            type: String,
            required: true,
        },
        embedding: {
            type: [Number], // 768-dimensional vector from text-embedding-004
            required: true,
        },
    },
    { timestamps: true }
);

export const TranscriptChunk = mongoose.model(
    "TranscriptChunk",
    transcriptChunkSchema
);
