/**
 * @file ragService.js
 * @description Core RAG logic.
 * 1. Embeds the user's question
 * 2. Retrieves the most relevant transcript chunks via Atlas Vector Search
 * 3. Builds a grounded prompt and generates an answer with Gemini
 */

import mongoose from "mongoose";
import { geminiClient } from "../config/ai.config.js";
import { TranscriptChunk } from "../models/transcriptChunk.models.js";
import { embedText } from "./embeddingService.js";

const GEMINI_CHAT_MODEL = "gemini-2.5-flash";
const TOP_K_CHUNKS = 4; // how many chunks to retrieve per question

// ─────────────────────────────────────────────
// Vector Search
// ─────────────────────────────────────────────

/**
 * Finds the TOP_K_CHUNKS most semantically similar chunks for a given question.
 * Uses MongoDB Atlas $vectorSearch aggregation stage.
 *
 * @param {string} questionEmbedding - 768-dim vector of the user's question
 * @param {string} videoId
 * @returns {Promise<string[]>} - Array of raw chunk text, ranked by relevance
 */
const retrieveRelevantChunks = async (questionEmbedding, videoId) => {
    const results = await TranscriptChunk.aggregate([
        {
            $vectorSearch: {
                index: "vector_index",
                path: "embedding",
                queryVector: questionEmbedding,
                numCandidates: TOP_K_CHUNKS * 10, // search wider, return narrower
                limit: TOP_K_CHUNKS,
                filter: {
                    videoId: { $eq: new mongoose.Types.ObjectId(videoId) },
                }, // scoped to this video only
            },
        },
        {
            $project: { text: 1, _id: 0 }, // only return the text
        },
    ]);

    return results.map((r) => r.text);
};

// ─────────────────────────────────────────────
// Prompt Builder
// ─────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a helpful video assistant. Your job is to answer questions about a specific video based ONLY on the transcript excerpts provided to you.

Rules:
- Answer concisely and directly. No filler phrases like "Based on the transcript..." or "Great question!".
- If the answer is not in the provided context, say: "I couldn't find that in this video."
- Never make up information that isn't in the context.
- Keep answers under 150 words unless the question genuinely requires more detail.`;

/**
 * Formats the retrieved chunks into a context block for the prompt.
 */
const buildContextBlock = (chunks) =>
    chunks.map((chunk, i) => `[Excerpt ${i + 1}]: ${chunk}`).join("\n\n");

// ─────────────────────────────────────────────
// Public: Answer a question
// ─────────────────────────────────────────────

/**
 * Full RAG pipeline: embed question → retrieve chunks → generate answer.
 *
 * @param {string}   question    - The user's raw question
 * @param {string}   videoId     - MongoDB ObjectId string of the video
 * @param {Array<{ role: "user"|"model", parts: [{ text: string }] }>} history
 *   - Prior conversation turns in Gemini's native format
 * @returns {Promise<string>}    - The generated answer
 */
export const answerQuestion = async (question, videoId, history = []) => {
    const context = `[ragService][answerQuestion][video:${videoId}]`;
    console.log(`${context} Question received.`, { question });

    // ── Step 1: Embed the question ──────────────────────────────────────────
    const questionEmbedding = await embedText(question, "RETRIEVAL_QUERY");

    // ── Step 2: Retrieve relevant chunks ───────────────────────────────────
    const chunks = await retrieveRelevantChunks(questionEmbedding, videoId);

    if (chunks.length === 0) {
        console.warn(
            `${context} No relevant chunks found. Video may not be embedded yet.`
        );
        return "This video hasn't been indexed yet. Please try again in a moment.";
    }

    console.log(`${context} Retrieved ${chunks.length} relevant chunks.`);

    // ── Step 3: Build grounded prompt + generate answer ────────────────────
    const contextBlock = buildContextBlock(chunks);

    // Inject the retrieved context as the first user turn so it's always present
    // regardless of how long the chat history is.
    const groundedHistory = [
        {
            role: "user",
            parts: [
                {
                    text: `Here are the relevant excerpts from the video transcript:\n\n${contextBlock}`,
                },
            ],
        },
        {
            role: "model",
            parts: [
                {
                    text: "Understood. I'll answer questions using only these excerpts.",
                },
            ],
        },
        ...history, // prior conversation turns
    ];

    const chat = geminiClient.chats.create({
        model: GEMINI_CHAT_MODEL,
        config: { systemInstruction: SYSTEM_PROMPT },
        history: groundedHistory,
    });

    const response = await chat.sendMessage({ message: question });
    const answer = response.text;

    console.log(`${context} Answer generated.`, {
        answerLength: answer.length,
    });
    return answer;
};
