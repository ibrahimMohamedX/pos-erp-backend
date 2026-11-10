import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  let company = await prisma.company.findFirst({ where: { name: 'Sharqiya Restaurant' } });
  if (!company) {
    company = await prisma.company.create({
      data: { name: 'Sharqiya Restaurant', taxRate: 14, currency: 'EGP' }
    });
  } else {
    company = await prisma.company.update({
      where: { id: company.id },
      data: { taxRate: 14, currency: 'EGP' }
    });
  }

  let branch = await prisma.branch.findFirst({
    where: { companyId: company.id, name: 'الفرع الرئيسي' }
  });
  if (!branch) {
    branch = await prisma.branch.create({
      data: { companyId: company.id, name: 'الفرع الرئيسي', isActive: true }
    });
  } else {
    branch = await prisma.branch.update({
      where: { id: branch.id },
      data: { name: 'الفرع الرئيسي', isActive: true }
    });
  }

  const admin = await prisma.user.upsert({
    where: { email: 'admin@demo.local' },
    update: {
      name: 'مدير النظام',
      passwordHash: await bcrypt.hash('Admin123!', 10),
      lang: 'ar'
    },
    create: {
      name: 'مدير النظام',
      email: 'admin@demo.local',
      passwordHash: await bcrypt.hash('Admin123!', 10),
      lang: 'ar',
      companies: { create: { companyId: company.id, role: Role.owner, isDefault: true } }
    }
  });

  const cashier = await prisma.user.upsert({
    where: { email: 'cashier@demo.local' },
    update: {
      name: 'كاشير تجريبي',
      passwordHash: await bcrypt.hash('Cashier123!', 10),
      lang: 'ar'
    },
    create: {
      name: 'كاشير تجريبي',
      email: 'cashier@demo.local',
      passwordHash: await bcrypt.hash('Cashier123!', 10),
      lang: 'ar',
      companies: { create: { companyId: company.id, role: Role.cashier } }
    }
  });

  let cat = await prisma.category.findFirst({
    where: { companyId: company.id, name: 'المشويات' }
  });
  if (!cat) {
    cat = await prisma.category.create({
      data: {
        companyId: company.id,
        name: 'المشويات',
        nameAr: 'المشويات',
        sortOrder: 1,
        isActive: true
      }
    });
  } else {
    cat = await prisma.category.update({
      where: { id: cat.id },
      data: { name: 'المشويات', nameAr: 'المشويات', sortOrder: 1, isActive: true }
    });
  }

  let prod = await prisma.product.findFirst({
    where: { companyId: company.id, name: 'كباب مشوي' }
  });
  if (!prod) {
    prod = await prisma.product.create({
      data: {
        companyId: company.id,
        categoryId: cat.id,
        name: 'كباب مشوي',
        nameAr: 'كباب مشوي',
        salePrice: 120,
        stockQuantity: 100,
        isStock: true,
        isActive: true
      }
    });
  } else {
    prod = await prisma.product.update({
      where: { id: prod.id },
      data: {
        name: 'كباب مشوي',
        nameAr: 'كباب مشوي',
        salePrice: 120,
        stockQuantity: 100,
        isStock: true,
        isActive: true
      }
    });
  }

  const existingSession = await prisma.posSession.findFirst({
    where: { companyId: company.id, status: 'open' }
  });
  if (!existingSession) {
    await prisma.posSession.create({
      data: {
        companyId: company.id,
        cashierId: admin.id,
        branchId: branch.id,
        openingCash: 1000,
        status: 'open'
      }
    });
  }

  console.log('Seed done. Company:', company.name, '| Admin:', admin.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
