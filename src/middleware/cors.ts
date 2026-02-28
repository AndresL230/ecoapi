import { NextFunction, Request, Response } from "express";

export const corsMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,X-Request-Id");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
};

