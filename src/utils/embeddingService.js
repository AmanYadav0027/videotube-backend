import { geminiClient } from "../config/ai.config.js";

const EMBEDDING_MODEL = "gemini-embedding-001";
const CHUNK_SIZE = 500; // characters per chunk
const CHUNK_OVERLAP = 50; // overlap between chunks to preserve context at boundaries

// ─────────────────────────────────────────────
// Chunking
// ─────────────────────────────────────────────

/**
 * Splits a transcript into overlapping chunks.
 * Overlap ensures a sentence split across a boundary isn't lost.
 *
 * @param {string} text
 * @returns {string[]}
 */
export const chunkTranscript = (text) => {
    const chunks = [];
    let start = 0;

    while (start < text.length) {
        const end = Math.min(start + CHUNK_SIZE, text.length);
        chunks.push(text.slice(start, end).trim());
        start += CHUNK_SIZE - CHUNK_OVERLAP;
    }

    return chunks.filter((c) => c.length > 20); // drop tiny tail chunks
};

// ─────────────────────────────────────────────
// Embedding
// ─────────────────────────────────────────────

export const embedText = async (text, taskType = "RETRIEVAL_DOCUMENT") => {
    const result = await geminiClient.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: text,
        config: { taskType },
    });

    return result.embeddings[0].values;
};

export const embedChunks = async (chunks, videoId) => {
    const context = `[embeddingService][embedChunks][video:${videoId}]`;
    const BATCH_SIZE = 5; // embed 5 chunks at a time to stay under rate limits
    const results = [];

    console.log(
        `${context} Embedding ${chunks.length} chunks in batches of ${BATCH_SIZE}.`
    );

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);

        const embedded = await Promise.all(
            batch.map(async (text, j) => ({
                chunkIndex: i + j,
                text,
                embedding: await embedText(text, "RETRIEVAL_DOCUMENT"),
            }))
        );

        results.push(...embedded);

        // Small delay between batches to be respectful of rate limits
        if (i + BATCH_SIZE < chunks.length) {
            await new Promise((r) => setTimeout(r, 200));
        }
    }

    console.log(
        `${context} All ${results.length} chunks embedded successfully.`
    );
    return results;
};
