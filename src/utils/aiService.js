/**
 * @file aiService.js
 * @description Pure AI layer. No database calls, no business logic.
 * Handles all communication with AssemblyAI and Gemini.
 * Each function is independently retryable and testable.
 */

import { assemblyClient, geminiClient } from "../config/ai.config.js";

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const GEMINI_MODEL = "gemini-2.5-flash";

const GEMINI_GENERATION_CONFIG = {
    responseMimeType: "application/json", // Forces JSON — no markdown fences to strip
    temperature: 0.3, // Low temp = consistent, structured output
};

// How many times to retry a flaky AI API call before giving up
const MAX_RETRIES = 3;

// Base delay in ms for exponential backoff (doubles each retry: 500 → 1000 → 2000)
const BASE_RETRY_DELAY_MS = 500;

// ─────────────────────────────────────────────
// Custom Error Classes
// ─────────────────────────────────────────────

export class TranscriptionError extends Error {
    constructor(message, cause) {
        super(message);
        this.name = "TranscriptionError";
        this.cause = cause;
    }
}

export class SummaryGenerationError extends Error {
    constructor(message, cause) {
        super(message);
        this.name = "SummaryGenerationError";
        this.cause = cause;
    }
}

export class NoSpeechDetectedError extends Error {
    constructor(videoId) {
        super(`No speech detected in transcript for video: ${videoId}`);
        this.name = "NoSpeechDetectedError";
    }
}

// ─────────────────────────────────────────────
// Internal Helpers
// ─────────────────────────────────────────────

/**
 * Retries an async function with exponential backoff.
 * Only retries on transient errors (network, rate limits, 5xx).
 * Never retries on logic errors (bad API key, invalid input).
 *
 * @param {Function} fn          - Async function to retry
 * @param {string}   context     - Label for logs (e.g. "[aiService][submitTranscription]")
 * @param {number}   maxRetries  - Max number of attempts
 * @returns {Promise<any>}
 */
const withRetry = async (fn, context, maxRetries = MAX_RETRIES) => {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            // Don't retry on auth errors, bad requests, or SDK validation errors.
            // AssemblyAI's SDK throws plain Errors without a .status for validation
            // failures, so we also pattern-match the message as a fallback.
            const isHttpNonRetryable = [400, 401, 403, 404].includes(
                error.status
            );
            const isSdkValidationError =
                !error.status &&
                (error.message?.includes("must be") ||
                    error.message?.includes("invalid") ||
                    error.message?.includes("Unauthorized"));
            const isNonRetryable = isHttpNonRetryable || isSdkValidationError;

            if (isNonRetryable) {
                console.error(
                    `${context} Non-retryable error. Aborting immediately.`,
                    { message: error.message }
                );
                throw error;
            }

            if (attempt < maxRetries) {
                const retryMatch = error.message?.match(
                    /retry in (\d+(\.\d+)?)s/
                );
                const delayMs = retryMatch
                    ? Math.ceil(parseFloat(retryMatch[1])) * 1000
                    : BASE_RETRY_DELAY_MS * 2 ** (attempt - 1);
                console.warn(
                    `${context} Attempt ${attempt}/${maxRetries} failed. Retrying in ${delayMs}ms...`,
                    { message: error.message }
                );
                await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
        }
    }

    console.error(`${context} All ${maxRetries} attempts failed.`, {
        message: lastError.message,
    });
    throw lastError;
};

/**
 * Builds the structured Gemini prompt for video analysis.
 * Keeping the prompt in one place makes iteration easy.
 *
 * @param {string} transcriptText
 * @returns {string}
 */
const buildAnalysisPrompt = (transcriptText) => `
You are an expert video content analyst. Analyze the following transcript and return a JSON object.

Your response MUST be a single, valid JSON object with exactly these two keys:
- "AiSummary": A concise, engaging 2-paragraph summary. First paragraph covers the core topic. Second paragraph highlights key insights or takeaways.
- "AiChapters": An array of 3–5 chapter objects, each with:
  - "time": A timestamp string in "MM:SS" format representing roughly when this topic starts (estimate logically from the transcript flow, starting from "00:00").
  - "title": A short, descriptive chapter title (max 6 words).

Important rules:
- Do NOT include markdown, code fences, or any text outside the JSON object.
- Chapter times must be in ascending order starting at "00:00".
- If the transcript is too short for 5 chapters, use fewer. Minimum is 2.

Transcript:
---
${transcriptText}
---
`;

// ─────────────────────────────────────────────
// Public Service Functions
// ─────────────────────────────────────────────

/**
 * Submits an audio/video URL to AssemblyAI for async transcription.
 * Returns immediately with a transcript job ID — does NOT wait for completion.
 * Completion is handled via webhook.
 *
 * @param {string} videoUrl  - Publicly accessible URL of the video/audio
 * @param {string} videoId   - Your internal MongoDB video ID (passed via webhook query param)
 * @returns {Promise<string>} - The AssemblyAI transcript job ID
 * @throws {TranscriptionError}
 */
export const submitTranscriptionJob = async (videoUrl, videoId) => {
    const context = `[aiService][submitTranscriptionJob][video:${videoId}]`;

    console.log(`${context} Submitting transcription job.`, { videoUrl });

    try {
        const transcript = await withRetry(
            () =>
                assemblyClient.transcripts.submit({
                    audio_url: videoUrl,

                    webhook_url: `${process.env.SERVER_BASE_URL}/api/v2/webhooks/assemblyai?videoId=${videoId}`,

                    // NEW: Tell AssemblyAI to use their newest model, and fallback to Universal-2 if needed

                    speech_models: ["universal-3-pro", "universal-2"],
                }),

            context
        );

        if (!transcript?.id) {
            throw new TranscriptionError(
                "AssemblyAI returned a response with no transcript ID.",

                null
            );
        }

        console.log(`${context} Job submitted successfully.`, {
            transcriptId: transcript.id,
        });

        return transcript.id;
    } catch (error) {
        if (error instanceof TranscriptionError) throw error;

        throw new TranscriptionError(
            `Failed to submit transcription job for video ${videoId}.`,

            error
        );
    }
};

/**
 * Fetches a completed transcript from AssemblyAI by its job ID.
 * Call this ONLY inside a webhook handler after AssemblyAI confirms completion.
 *
 * @param {string} transcriptId - The job ID returned by submitTranscriptionJob
 * @returns {Promise<string>}   - The full transcript text
 * @throws {NoSpeechDetectedError | TranscriptionError}
 */
export const fetchTranscriptText = async (transcriptId) => {
    const context = `[aiService][fetchTranscriptText][transcriptId:${transcriptId}]`;
    console.log(`${context} Fetching completed transcript.`);

    try {
        const transcript = await withRetry(
            () => assemblyClient.transcripts.get(transcriptId),
            context
        );

        if (transcript.status === "error") {
            throw new TranscriptionError(
                `AssemblyAI processing failed: ${transcript.error}`,
                null
            );
        }

        if (!transcript.text || transcript.text.trim().length === 0) {
            throw new NoSpeechDetectedError(transcriptId);
        }

        console.log(`${context} Transcript fetched.`, {
            charCount: transcript.text.length,
        });

        return transcript.text;
    } catch (error) {
        if (
            error instanceof NoSpeechDetectedError ||
            error instanceof TranscriptionError
        ) {
            throw error;
        }
        throw new TranscriptionError(
            `Failed to fetch transcript ${transcriptId}.`,
            error
        );
    }
};

/**
 * Sends transcript text to Gemini and returns a structured analysis.
 * Gemini is instructed to respond with JSON directly via responseMimeType.
 *
 * @param {string} transcriptText - Raw transcript text from AssemblyAI
 * @param {string} videoId        - Used for logging context only
 * @returns {Promise<{ AiSummary: string, AiChapters: Array<{ time: string, title: string }> }>}
 * @throws {SummaryGenerationError}
 */
export const generateVideoAnalysis = async (transcriptText, videoId) => {
    const context = `[aiService][generateVideoAnalysis][video:${videoId}]`;
    console.log(`${context} Sending transcript to Gemini for analysis.`, {
        transcriptCharCount: transcriptText.length,
    });

    try {
        const result = await withRetry(
            () =>
                geminiClient.models.generateContent({
                    model: GEMINI_MODEL,
                    contents: buildAnalysisPrompt(transcriptText),
                    config: GEMINI_GENERATION_CONFIG,
                }),
            context
        );
        const rawText = result.text;

        let parsed;
        try {
            parsed = JSON.parse(rawText);
        } catch {
            console.error(`${context} Gemini returned malformed JSON.`, {
                rawText,
            });
            throw new SummaryGenerationError(
                "Gemini response was not valid JSON.",
                null
            );
        }

        // Validate shape — don't save garbage to the DB
        if (
            typeof parsed.AiSummary !== "string" ||
            !Array.isArray(parsed.AiChapters)
        ) {
            throw new SummaryGenerationError(
                "Gemini JSON response is missing required fields (AiSummary, AiChapters).",
                null
            );
        }

        console.log(`${context} Analysis generated successfully.`, {
            chapterCount: parsed.AiChapters.length,
            summaryLength: parsed.AiSummary.length,
        });

        return parsed;
    } catch (error) {
        if (error instanceof SummaryGenerationError) throw error;
        throw new SummaryGenerationError(
            `Gemini analysis failed for video ${videoId}.`,
            error
        );
    }
};
