import 'dotenv/config';

process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5433/pos_erp?schema=public';
process.env.JWT_SECRET ??= 'test-secret';
process.env.NODE_ENV ??= 'test';
