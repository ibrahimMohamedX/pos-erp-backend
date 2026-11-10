import fastifyPlugin from 'fastify-plugin';
import jwtPlugin, { type FastifyJwtSignOptions } from '@fastify/jwt';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { env } from '../config/env.js';
import { AppError } from '../common/errors.js';

export interface JwtPayload {
  sub: number;
  email: string;
  name: string;
  companyId: number;
  role: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: JwtPayload;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

export const authPlugin = fastifyPlugin(async (fastify) => {
  const signOptions: FastifyJwtSignOptions = { sign: { expiresIn: env.jwtExpiresIn } };
  await fastify.register(jwtPlugin, { secret: env.jwtSecret, ...signOptions });

  fastify.decorate('authenticate', async function (this: FastifyInstance, request: FastifyRequest) {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw AppError.unauthorized();
    }
    try {
      request.user = this.jwt.verify<JwtPayload>(header.slice(7));
    } catch {
      throw AppError.unauthorized();
    }
  });
});

export function requireRole(...roles: string[]) {
  return async (request: FastifyRequest) => {
    await request.server.authenticate(request);
    if (!roles.includes(request.user.role)) {
      throw AppError.forbidden();
    }
  };
}
