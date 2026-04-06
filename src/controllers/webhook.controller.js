/**
 * @file webhook.controller.js
 * @description Handles incoming POST requests from AssemblyAI when transcription completes.
 */

import { processWebhookAndGenerateSummary } from "../utils/aiHelper.js";

/**
 * POST /api/v2/webhooks/assemblyai?videoId=:videoId
 *
 * AssemblyAI calls this when a transcript job finishes.
 * We must respond 200 FAST — any processing happens after the response.
 * If we return 5xx, AssemblyAI will retry (which is fine, but noisy).
 */
export const handleAssemblyAIWebhook = async (req, res) => {
    const context = `[webhookController][handleAssemblyAIWebhook]`;

    // ── 1. Extract & validate incoming payload ─────────────────────────
    const { transcript_id, status } = req.body;
    const { videoId } = req.query;

    if (!transcript_id || !videoId) {
        console.warn(`${context} Missing transcript_id or videoId.`, {
            transcript_id,
            videoId,
        });
        // 400 so AssemblyAI doesn't retry a malformed call pointlessly
        return res
            .status(400)
            .json({ success: false, message: "Missing required fields." });
    }

    // ── 2. Ignore non-completed statuses ───────────────────────────────
    // AssemblyAI may POST for "processing" updates too — we only care about "completed"
    if (status !== "completed") {
        console.log(
            `${context} Ignoring webhook with status: "${status}". video:${videoId}`
        );
        return res
            .status(200)
            .json({ success: true, message: `Status "${status}" ignored.` });
    }

    // ── 3. Acknowledge immediately ─────────────────────────────────────
    // AssemblyAI expects a 200 quickly. Heavy processing goes AFTER this response.
    res.status(200).json({ success: true, message: "Webhook received." });

    // ── 4. Process asynchronously (fire-and-forget after response) ─────
    console.log(`${context} Processing transcript for video:${videoId}`, {
        transcript_id,
    });

    processWebhookAndGenerateSummary(transcript_id, videoId).catch((error) => {
        // aiHelper already updated DB to FAILED and logged details.
        // This catch just prevents an unhandled promise rejection.
        console.error(
            `${context} Pipeline failed for video:${videoId}. DB marked FAILED.`,
            { error: error.message }
        );
    });
};
