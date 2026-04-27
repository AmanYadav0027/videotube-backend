import { answerQuestion } from "../utils/ragService.js";
import { Video } from "../models/video.models.js";

/**
 * POST /api/v2/chat/:videoId
 *
 * Body: { message: string, history: Array<{ role, parts }> }
 * Returns: { answer: string }
 */
export const handleChatMessage = async (req, res) => {
    const context = `[chatController][handleChatMessage]`;
    const { videoId } = req.params;
    const { message, history = [] } = req.body;

    // ── Validate ───────────────────────────────────────────────────────────
    if (!message?.trim()) {
        return res
            .status(400)
            .json({ success: false, message: "Message is required." });
    }

    if (message.trim().length > 500) {
        return res.status(400).json({
            success: false,
            message: "Message too long (max 500 chars).",
        });
    }

    // ── Check video exists and AI is ready ─────────────────────────────────
    const video = await Video.findById(videoId).select("aiStatus title").lean();

    if (!video) {
        return res
            .status(404)
            .json({ success: false, message: "Video not found." });
    }

    if (video.aiStatus !== "COMPLETED") {
        return res.status(400).json({
            success: false,
            message:
                video.aiStatus === "PROCESSING"
                    ? "Video is still being analyzed. Please try again shortly."
                    : "AI analysis is not available for this video.",
        });
    }

    // ── Run RAG pipeline ───────────────────────────────────────────────────
    try {
        console.log(`${context}[video:${videoId}] Processing chat message.`);

        const answer = await answerQuestion(message.trim(), videoId, history);

        return res.status(200).json({ success: true, data: { answer } });
    } catch (error) {
        console.error(`${context}[video:${videoId}] RAG pipeline failed.`, {
            error: error.message,
        });
        return res.status(500).json({
            success: false,
            message: "Failed to generate an answer. Please try again.",
        });
    }
};
