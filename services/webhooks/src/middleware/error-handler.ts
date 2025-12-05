import { Request, Response, NextFunction } from 'express';

export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.error('Webhook error:', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString(),
  });

  // Don't expose internal errors to webhook providers
  res.status(200).json({
    success: false,
    error: 'Internal server error',
    timestamp: new Date().toISOString(),
  });
}
