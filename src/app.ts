import express, { NextFunction, Request, Response } from "express";
import healthRoutes from "./routes/health";
import projectRoutes from "./routes/projects";
import providerRoutes from "./routes/providers";
import { corsMiddleware } from "./middleware/cors";
import { requestIdMiddleware } from "./middleware/request-id";
import { requestLoggingMiddleware } from "./middleware/logging";
import { requireJsonContentType } from "./middleware/content-type";
import { errorHandler, notFoundRoute } from "./middleware/error-handler";
import { AppError } from "./utils/app-error";

export const app = express();

app.use(requestIdMiddleware);
app.use(corsMiddleware);
app.use(requestLoggingMiddleware);
app.use(requireJsonContentType);
app.use(express.json());

app.use((err: unknown, _req: Request, _res: Response, next: NextFunction) => {
  if (err instanceof SyntaxError) {
    next(new AppError("MALFORMED_JSON", "Malformed JSON request body", 400));
    return;
  }
  next(err);
});

app.get("/", (_req, res) => {
  res.json({
    data: {
      name: "[YOUR_PROJECT_NAME] API",
      message: "API is running. See available resources below.",
      resources: [
        "/health",
        "/projects",
        "/providers"
      ]
    }
  });
});

app.use(healthRoutes);
app.use(projectRoutes);
app.use(providerRoutes);

app.use(notFoundRoute);
app.use(errorHandler);
