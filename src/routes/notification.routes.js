import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import {
    getNotifications,
    markAllRead,
    markOneRead,
    deleteNotification,
} from "../controllers/notification.controller.js";

const router = Router();
router.use(verifyJWT);

router.get("/", getNotifications);
router.patch("/read-all", markAllRead);
router.patch("/:notificationId/read", markOneRead);
router.delete("/:notificationId", deleteNotification);

export default router;
