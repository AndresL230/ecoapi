import { NextFunction, Request, Response } from "express";
import { ApiErrorBody } from "../models/types";
import { AppError } from "../utils/app-error";

export const notFoundRoute = (_req: Request, _res: Response, next: NextFunction): void => {
  next(new AppError("ROUTE_NOT_FOUND", "Route not found", 404));
};

export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const appError =
    err instanceof AppError
      ? err
      : new AppError("INTERNAL_SERVER_ERROR", "An unexpected error occurred", 500);

  const body: ApiErrorBody = {
    error: {
      code: appError.code,
      message: appError.message,
      status: appError.status,
      ...(appError.details !== undefined ? { details: appError.details } : {})
    }
  };

  res.status(appError.status).json(body);
};

