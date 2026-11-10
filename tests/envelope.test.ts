import { describe, expect, it } from 'vitest';
import { success, failure } from '../src/common/envelope.js';

describe('envelope', () => {
  it('wraps data with status true and default message', () => {
    const body = success({ id: 1 });
    expect(body).toEqual({ status: true, message: 'success', data: { id: 1 } });
  });

  it('includes meta and totalCount when provided', () => {
    const body = success([1, 2], { meta: { page: 1 }, totalCount: 42 });
    expect(body.meta).toEqual({ page: 1 });
    expect(body.totalCount).toBe(42);
    expect(body.status).toBe(true);
  });

  it('omits meta and totalCount when not provided', () => {
    const body = success(null);
    expect(body).toEqual({ status: true, message: 'success', data: null });
    expect('meta' in body).toBe(false);
    expect('totalCount' in body).toBe(false);
  });

  it('failure shape matches legacy error contract', () => {
    const body = failure('invalid_credentials', 'auth_failed');
    expect(body).toEqual({
      status: false,
      message: 'invalid_credentials',
      error: { message: 'invalid_credentials', code: 'auth_failed' }
    });
  });
});
