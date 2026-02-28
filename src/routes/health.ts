import { Router } from "express";

const router = Router();
const VERSION = "1.0.0";

router.get("/health", (_req, res) => {
  res.json({
    data: {
      status: "ok",
      version: VERSION,
      timestamp: new Date().toISOString()
    }
  });
});

export default router;

