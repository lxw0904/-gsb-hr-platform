export class AppError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function assertOrThrow(condition, status, code, message, details) {
  if (!condition) throw new AppError(status, code, message, details);
}

export function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

export function sendSuccess(res, data = null, meta = undefined, status = 200) {
  const payload = { success: true, data };
  if (meta !== undefined) payload.meta = meta;
  return res.status(status).json(payload);
}

export function sendError(res, status, code, message, details) {
  return res.status(status).json({ success: false, error: { code, message, ...(details ? { details } : {}) } });
}
