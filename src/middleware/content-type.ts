import { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/app-error";

const METHODS_REQUIRING_JSON = new Set(["POST", "PATCH"]);

export const requireJsonContentType = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  if (!METHODS_REQUIRING_JSON.has(req.method)) {
    next();
    return;
  }

  const contentType = req.headers["content-type"] ?? "";
  if (typeof contentType !== "string" || !contentType.includes("application/json")) {
    next(
      new AppError(
        "MISSING_OR_INVALID_CONTENT_TYPE",
        "Content-Type must be application/json",
        400
      )
    );
    return;
  }

  next();
};

