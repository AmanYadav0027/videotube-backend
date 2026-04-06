import { AssemblyAI } from "assemblyai";
import { GoogleGenAI } from "@google/genai";

// Validate required env vars at startup — fail fast, not at runtime
const requiredEnvVars = [
    "ASSEMBLYAI_API_KEY",
    "GEMINI_API_KEY",
    "SERVER_BASE_URL",
];

for (const key of requiredEnvVars) {
    if (!process.env[key]) {
        throw new Error(
            `[ai.config] Missing required environment variable: ${key}. Server cannot start.`
        );
    }
}

export const assemblyClient = new AssemblyAI({
    apiKey: process.env.ASSEMBLYAI_API_KEY,
});

export const geminiClient = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
});
