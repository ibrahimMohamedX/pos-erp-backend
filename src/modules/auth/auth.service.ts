import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '../../common/prisma.js';
import { AppError } from '../../common/errors.js';
import type { JwtPayload } from '../../plugins/auth.js';
import type { LoginInput, CheckPinInput, AddPinInput } from './auth.schema.js';

const REFRESH_TTL_DAYS = 60;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
    include: {
      companies: {
        where: { user: { isActive: true } },
        orderBy: [{ isDefault: 'desc' }, { companyId: 'asc' }],
        include: { company: true }
      }
    }
  });

  if (!user || !user.isActive) {
    throw AppError.unauthorized('invalid_credentials', 'auth_failed');
  }

  const passwordOk = await bcrypt.compare(input.password, user.passwordHash);
  if (!passwordOk) {
    throw AppError.unauthorized('invalid_credentials', 'auth_failed');
  }

  const userCompany = user.companies[0];
  if (!userCompany) {
    throw AppError.forbidden('user_has_no_company', 'no_company');
  }

  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    companyId: userCompany.companyId,
    role: userCompany.role
  };

  const refreshToken = randomBytes(48).toString('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.authSession.create({
    data: { userId: user.id, tokenHash: hashToken(refreshToken), expiresAt }
  });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      lang: user.lang,
      type: userCompany.role,
      company_id: userCompany.companyId,
      company_name: userCompany.company.name
    },
    payload,
    refreshToken
  };
}

export async function logout(payload: JwtPayload, refreshToken?: string) {
  const where = refreshToken
    ? { userId: payload.sub, tokenHash: hashToken(refreshToken) }
    : { userId: payload.sub };
  await prisma.authSession.updateMany({
    where: { ...where, revokedAt: null },
    data: { revokedAt: new Date() }
  });
  return { logged_out: true };
}

export async function checkCompanyPin(payload: JwtPayload, input: CheckPinInput) {
  const company = await prisma.company.findFirst({
    where: { id: payload.companyId },
    select: { pinCode: true }
  });
  if (!company || !company.pinCode) {
    throw AppError.notFound('company_pin_not_set', 'pin_not_set');
  }
  if (company.pinCode !== input.pin_code) {
    throw AppError.unauthorized('invalid_pin', 'invalid_pin');
  }
  return { verified: true };
}

export async function addCompanyPin(payload: JwtPayload, input: AddPinInput) {
  const company = await prisma.company.findFirst({
    where: { id: payload.companyId },
    select: { id: true }
  });
  if (!company) {
    throw AppError.notFound('company_not_found', 'company_not_found');
  }
  await prisma.company.update({
    where: { id: company.id },
    data: { pinCode: input.pin_code }
  });
  return { pin_set: true };
}
