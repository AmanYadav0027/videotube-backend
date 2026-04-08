/**
 * @file aiHelper.js
 * @description AI orchestration layer. Owns the business logic:
 * updating Video.aiStatus in MongoDB, coordinating the two-phase
 * transcription → analysis pipeline, and surfacing clean errors
 * to controllers.
 */

import { Video } from "../models/video.models.js";
import { TranscriptChunk } from "../models/transcriptChunk.models.js";
import {
    submitTranscriptionJob,
    fetchTranscriptText,
    generateVideoAnalysis,
    NoSpeechDetectedError,
    TranscriptionError,
    SummaryGenerationError,
} from "./aiService.js";
import { chunkTranscript, embedChunks } from "./embeddingService.js";

const setVideoAiStatus = async (videoId, status, additionalFields = {}) => {
    await Video.findByIdAndUpdate(videoId, {
        $set: { aiStatus: status, ...additionalFields },
    });
    console.log(
        `[aiHelper][setVideoAiStatus][video:${videoId}] Status → ${status}`
    );
};

const embedAndStoreTranscript = async (videoId, transcriptText) => {
    const context = `[aiHelper][embedAndStoreTranscript][video:${videoId}]`;
    await TranscriptChunk.deleteMany({ videoId });
    const chunks = chunkTranscript(transcriptText);
    console.log(
        `${context} Split into ${chunks.length} chunks. Embedding now...`
    );
    const embeddedChunks = await embedChunks(chunks, videoId);
    const docs = embeddedChunks.map(({ text, embedding, chunkIndex }) => ({
        videoId,
        chunkIndex,
        text,
        embedding,
    }));
    await TranscriptChunk.insertMany(docs);
    console.log(`${context} ${docs.length} chunks stored in MongoDB.`);
};

export const triggerTranscription = async (videoUrl, videoId) => {
    const context = `[aiHelper][triggerTranscription][video:${videoId}]`;
    console.log(`${context} Starting Phase 1 — submitting transcription job.`);
    try {
        await setVideoAiStatus(videoId, "PROCESSING");
        const transcriptId = await submitTranscriptionJob(videoUrl, videoId);
        console.log(`${context} Phase 1 complete. Waiting for webhook.`, {
            transcriptId,
        });
        return true;
    } catch (error) {
        console.error(`${context} Phase 1 failed. Setting status to FAILED.`, {
            error: error.message,
            cause: error.cause?.message,
        });
        await setVideoAiStatus(videoId, "FAILED").catch((dbError) => {
            console.error(
                `${context} CRITICAL: Could not update aiStatus to FAILED.`,
                { dbError: dbError.message }
            );
        });
        return false;
    }
};

export const processWebhookAndGenerateSummary = async (
    transcriptId,
    videoId
) => {
    const context = `[aiHelper][processWebhookAndGenerateSummary][video:${videoId}]`;
    console.log(`${context} Phase 2 started.`, { transcriptId });
    try {
        const transcriptText = await fetchTranscriptText(transcriptId);
        const analysis = await generateVideoAnalysis(transcriptText, videoId);
        await setVideoAiStatus(videoId, "COMPLETED", {
            aiSummary: analysis.AiSummary,
            aiChapters: analysis.AiChapters,
        });
        // Runs AFTER status=COMPLETED so the video is usable even if embedding fails
        await embedAndStoreTranscript(videoId, transcriptText);
        console.log(`${context} Phase 2 complete. Summary + embeddings saved.`);
    } catch (error) {
        const errorType = error.name ?? "UnknownError";
        if (error instanceof NoSpeechDetectedError) {
            console.warn(`${context} No speech detected. Marking as FAILED.`, {
                errorType,
                message: error.message,
            });
        } else if (
            error instanceof TranscriptionError ||
            error instanceof SummaryGenerationError
        ) {
            console.error(`${context} AI pipeline error. Marking as FAILED.`, {
                errorType,
                message: error.message,
                cause: error.cause?.message,
            });
        } else {
            console.error(`${context} Unexpected error. Marking as FAILED.`, {
                errorType,
                message: error.message,
                stack: error.stack,
            });
        }
        await setVideoAiStatus(videoId, "FAILED").catch((dbError) => {
            console.error(
                `${context} CRITICAL: Could not update aiStatus to FAILED.`,
                { dbError: dbError.message }
            );
        });
        throw error;
    }
};
