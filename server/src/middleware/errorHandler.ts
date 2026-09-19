import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import multer from 'multer';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ message: err.issues.map((i) => i.message).join(', ') });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ message: err.message });
  }
  // Multer raises its own error type for limits it enforces itself (file
  // too large, too many files, unexpected field) -- these are client
  // mistakes, not server failures, so they get the same 400 treatment as a
  // Zod validation error rather than falling through to a 500.
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ message: err.message });
  }
  console.error(err);
  return res.status(500).json({ message: 'Internal server error' });
}

export function asyncHandler<T extends (...args: any[]) => Promise<any>>(fn: T) {
  return (req: any, res: any, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
