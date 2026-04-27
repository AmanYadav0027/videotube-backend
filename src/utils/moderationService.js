import { geminiClient } from "../config/ai.config.js";

const MODERATION_MODEL = "gemini-2.0-flash-lite";

// ─────────────────────────────────────────────
// Prompt
// ─────────────────────────────────────────────

const buildModerationPrompt = (comment) => `
You are a content moderation system. Classify the following comment as toxic or not.

Toxic means: hate speech, slurs, targeted harassment, explicit threats, or severe profanity directed at a person.
NOT toxic: criticism, sarcasm, sports trash talk, mild swearing, negative opinions about content.

Respond ONLY with valid JSON, no markdown:
{"toxic": true/false, "reason": "one short sentence explanation"}

Comment: "${comment.replace(/"/g, "'")}"
`;

// ─────────────────────────────────────────────
// Public
// ─────────────────────────────────────────────

export const classifyComment = async (id, commentText) => {
    const context = `[moderationService][classifyComment]`;

    try {
        const result = await geminiClient.models.generateContent({
            model: MODERATION_MODEL,
            contents: buildModerationPrompt(commentText),
            config: {
                responseMimeType: "application/json",
                temperature: 0.1, // very low — we want deterministic classification
            },
        });

        const parsed = JSON.parse(result.text);

        if (typeof parsed.toxic !== "boolean") {
            throw new Error("Gemini returned unexpected moderation shape.");
        }

        console.log(`${context} Classification complete.`, {
            toxic: parsed.toxic,
            reason: parsed.reason,
        });

        return { toxic: parsed.toxic, reason: parsed.reason ?? "" };
    } catch (error) {
        // Fail open — if moderation errors, don't flag the comment
        console.error(
            `${context} Classification failed. Defaulting to not toxic.`,
            {
                error: error.message,
            }
        );
        return { toxic: false, reason: "moderation_error" };
    }
};
