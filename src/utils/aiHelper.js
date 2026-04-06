/**
 * @file aiHelper.js
 * @description AI orchestration layer. Owns the business logic:
 * updating Video.aiStatus in MongoDB, coordinating the two-phase
 * transcription → analysis pipeline, and surfacing clean errors
 * to controllers.
 *
 * This file does NOT talk to AI APIs directly — that's aiService.js.
 * This file does NOT handle HTTP requests/responses — that's the controller.
 */

import { Video } from "../models/video.models.js";
import {
    submitTranscriptionJob,
    fetchTranscriptText,
    generateVideoAnalysis,
    NoSpeechDetectedError,
    TranscriptionError,
    SummaryGenerationError,
} from "./aiService.js";

// ─────────────────────────────────────────────
// Internal DB Helpers
// ─────────────────────────────────────────────

/**
 * Updates the aiStatus field on a Video document.
 * Centralised here so every status transition is one line at the call site.
 *
 * @param {string} videoId
 * @param {"PENDING"|"PROCESSING"|"COMPLETED"|"FAILED"} status
 * @param {object} [additionalFields] - Extra fields to $set alongside status
 */
const setVideoAiStatus = async (videoId, status, additionalFields = {}) => {
    await Video.findByIdAndUpdate(videoId, {
        $set: { aiStatus: status, ...additionalFields },
    });
    console.log(
        `[aiHelper][setVideoAiStatus][video:${videoId}] Status → ${status}`
    );
};

// ─────────────────────────────────────────────
// Phase 1 — Trigger (called right after video upload)
// ─────────────────────────────────────────────

/**
 * Kicks off an async transcription job for a newly uploaded video.
 *
 * Flow:
 *   1. Sets aiStatus = "PROCESSING" immediately so the UI can show a spinner
 *   2. Submits the video URL to AssemblyAI (fire-and-forget, no waiting)
 *   3. AssemblyAI will POST to our webhook when the transcript is ready
 *
 * If the submission fails, sets aiStatus = "FAILED" so the UI can show an error.
 *
 * @param {string} videoUrl  - Cloudinary URL of the uploaded video
 * @param {string} videoId   - MongoDB _id of the Video document
 * @returns {Promise<boolean>} - true if job was submitted, false if it failed
 */
export const triggerTranscription = async (videoUrl, videoId) => {
    const context = `[aiHelper][triggerTranscription][video:${videoId}]`;
    console.log(`${context} Starting Phase 1 — submitting transcription job.`);

    try {
        // Immediately mark as PROCESSING so the frontend shows the right state
        await setVideoAiStatus(videoId, "PROCESSING");

        const transcriptId = await submitTranscriptionJob(videoUrl, videoId);

        // Optionally persist the transcriptId for debugging/audit purposes
        // Uncomment if you add a `transcriptJobId: String` field to your Video model:
        // await Video.findByIdAndUpdate(videoId, { $set: { transcriptJobId: transcriptId } });

        console.log(`${context} Phase 1 complete. Waiting for webhook.`, {
            transcriptId,
        });

        return true;
    } catch (error) {
        console.error(`${context} Phase 1 failed. Setting status to FAILED.`, {
            error: error.message,
            cause: error.cause?.message,
        });

        // Best-effort status update — don't let this throw and hide the original error
        await setVideoAiStatus(videoId, "FAILED").catch((dbError) => {
            console.error(
                `${context} CRITICAL: Could not update aiStatus to FAILED in DB.`,
                { dbError: dbError.message }
            );
        });

        return false;
    }
};

// ─────────────────────────────────────────────
// Phase 2 — Webhook Handler (called by AssemblyAI POST callback)
// ─────────────────────────────────────────────

/**
 * Processes the completed transcript and saves AI analysis to the Video document.
 *
 * Flow:
 *   1. Fetches the completed transcript text from AssemblyAI
 *   2. Sends transcript to Gemini for summary + chapter generation
 *   3. Validates the Gemini response shape
 *   4. Saves aiSummary, aiChapters, and sets aiStatus = "COMPLETED"
 *
 * On any failure, sets aiStatus = "FAILED" and re-throws so the
 * webhook controller can respond with the correct HTTP status code.
 *
 * @param {string} transcriptId - AssemblyAI transcript job ID (from webhook payload)
 * @param {string} videoId      - MongoDB _id of the Video document (from webhook query param)
 * @returns {Promise<void>}
 * @throws Will re-throw on failure after updating DB status to FAILED
 */
export const processWebhookAndGenerateSummary = async (
    transcriptId,
    videoId
) => {
    const context = `[aiHelper][processWebhookAndGenerateSummary][video:${videoId}]`;
    console.log(`${context} Phase 2 started.`, { transcriptId });

    try {
        // ── Step 1: Fetch transcript text ──────────────────────────────────
        const transcriptText = await fetchTranscriptText(transcriptId);

        // ── Step 2: Generate AI analysis via Gemini ───────────────────────
        const analysis = await generateVideoAnalysis(transcriptText, videoId);

        // ── Step 3: Persist to MongoDB ────────────────────────────────────
        await setVideoAiStatus(videoId, "COMPLETED", {
            aiSummary: analysis.AiSummary,
            aiChapters: analysis.AiChapters,
        });

        console.log(`${context} Phase 2 complete. AI data saved to DB.`);
    } catch (error) {
        // Log with full context before updating DB
        const errorType = error.name ?? "UnknownError";

        if (error instanceof NoSpeechDetectedError) {
            // This is expected for music-only or silent videos — not a system failure
            console.warn(`${context} No speech in video. Marking as FAILED.`, {
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
            console.error(
                `${context} Unexpected error in Phase 2. Marking as FAILED.`,
                {
                    errorType,
                    message: error.message,
                    stack: error.stack,
                }
            );
        }

        // Always update the DB on failure so the UI can surface an error state
        await setVideoAiStatus(videoId, "FAILED").catch((dbError) => {
            console.error(
                `${context} CRITICAL: Could not update aiStatus to FAILED in DB.`,
                { dbError: dbError.message }
            );
        });

        // Re-throw so the webhook controller can return the correct HTTP status
        throw error;
    }
};
