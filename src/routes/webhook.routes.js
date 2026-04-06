import { Router } from "express";
import { handleAssemblyAIWebhook } from "../controllers/webhook.controller.js";

const router = Router();

// No auth middleware — AssemblyAI calls this from outside your system
router.post("/assemblyai", handleAssemblyAIWebhook);

export default router;
