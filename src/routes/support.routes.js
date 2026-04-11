import { Router } from "express";
import { optionalVerifyJWT } from "../middlewares/auth.middleware.js";
import { submitContactForm } from "../controllers/support.controller.js";

const router = Router();

// optionalVerifyJWT: attaches req.user if token exists, calls next() either way
router.post("/contact", optionalVerifyJWT, submitContactForm);

export default router;
