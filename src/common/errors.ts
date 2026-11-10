export class AppError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode = 400, code = 'bad_request') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }

  static badRequest(message = 'bad_request', code = 'bad_request') {
    return new AppError(message, 400, code);
  }

  static unauthorized(message = 'unauthorized', code = 'unauthorized') {
    return new AppError(message, 401, code);
  }

  static forbidden(message = 'forbidden', code = 'forbidden') {
    return new AppError(message, 403, code);
  }

  static notFound(message = 'not_found', code = 'not_found') {
    return new AppError(message, 404, code);
  }

  static conflict(message = 'conflict', code = 'conflict') {
    return new AppError(message, 409, code);
  }
}
