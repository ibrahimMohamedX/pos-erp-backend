export interface EnvelopeOptions {
  message?: string;
  meta?: unknown;
  totalCount?: number;
}

export function success<T>(data: T, opts: EnvelopeOptions = {}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    status: true,
    message: opts.message ?? 'success',
    data
  };
  if (opts.meta !== undefined) body.meta = opts.meta;
  if (opts.totalCount !== undefined) body.totalCount = opts.totalCount;
  return body;
}

export function failure(message: string, code: string): Record<string, unknown> {
  return {
    status: false,
    message,
    error: { message, code }
  };
}
