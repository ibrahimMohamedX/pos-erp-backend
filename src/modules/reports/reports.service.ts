import { prisma } from '../../common/prisma.js';
import { num } from '../../common/serialize.js';

function todayStart() {
  const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d;
}

function paymentTotals(orders: any[], method: string) {
  return Number(orders.reduce((s, o) => {
    const p = (o as any).payment?.method ?? [];
    return s + p.filter((m: any) => m.method === method).reduce((a: number, m: any) => a + Number(m.amount ?? 0), 0);
  }, 0).toFixed(2));
}

export async function getPosDashboard(companyId: number) {
  const from = todayStart();
  const orders = await prisma.order.findMany({ where: { companyId, posDate: { gte: from } } });
  return {
    total_sales: num(Number(orders.reduce((s, o) => s + Number(o.total ?? 0), 0).toFixed(2))),
    total_orders: orders.length,
    cash_sales: num(paymentTotals(orders, 'cash')),
    card_sales: num(paymentTotals(orders, 'card')),
    date: from.toISOString().slice(0, 10)
  };
}

export async function getSalesReport(companyId: number, filters: Record<string, unknown>) {
  const where: Record<string, unknown> = { companyId };
  if (filters.date_from) where.posDate = { ...(where.posDate as any), gte: new Date(String(filters.date_from)) };
  if (filters.date_to) where.posDate = { ...(where.posDate as any), lte: new Date(String(filters.date_to)) };
  if (filters.cashier_id) where.createdBy = Number(filters.cashier_id);
  const orders = await prisma.order.findMany({ where, orderBy: [{ posDate: 'desc' }, { createdAt: 'desc' }] });
  return {
    total_sales: num(Number(orders.reduce((s, o) => s + Number(o.total ?? 0), 0).toFixed(2))),
    total_orders: orders.length,
    total_tax: num(Number(orders.reduce((s, o) => s + Number(o.totalTax ?? 0), 0).toFixed(2))),
    total_discount: num(Number(orders.reduce((s, o) => s + Number(o.totalDiscount ?? 0), 0).toFixed(2))),
    orders
  };
}

export function makePdf(text: string): Buffer {
  const content = `BT /F1 12 Tf 50 700 Td (${escapePdf(text)}) Tj ET`;
  const contentLen = Buffer.byteLength(content);
  const obj4 = `<< /Length ${contentLen} >>\nstream\n${content}\nendstream\n`;
  const obj4Len = Buffer.byteLength(obj4);
  const parts: string[] = [
    '%PDF-1.4\n',
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 obj >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 obj] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 obj /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /MediaBox [0 0 612 792] /Contents 4 0 obj >>\nendobj\n',
    `4 0 obj\n<< /Length ${obj4Len} >>\nstream\n${obj4}endstream\nendobj\n`,
    'xref\n0 5\n0000000000 65535 f \n',
    '0000000009 00000 n \n',
    '0000000056 00000 n \n',
    '0000000115 00000 n \n',
    `0000000${String(obj4.length + 116).padStart(10, '0')} 00000 n \n`,
    'trailer\n<< /Size 5 /Root 1 0 obj >>\nstartxref\n',
    String(116 + obj4.length),
    '\n%%EOF\n'
  ];
  const offsets: number[] = [0];
  for (let i = 0; i < parts.length - 1; i++) offsets.push(offsets[offsets.length - 1] + Buffer.byteLength(parts[i]));
  const xrefLine1 = `0000000009 00000 n \n`;
  const xrefLine2 = `0000000056 00000 n \n`;
  const xrefLine3 = `0000000${String(offsets[3]).padStart(10, '0')} 00000 n \n`;
  const xrefLine4 = `0000000${String(offsets[4]).padStart(10, '0')} 00000 n \n`;
  const xrefPart = `xref\n0 5\n0000000000 65535 f \n${xrefLine1}${xrefLine2}${xrefLine3}${xrefLine4}trailer\n<< /Size 5 /Root 1 0 obj >>\nstartxref\n${offsets[offsets.length - 1]}\n%%EOF\n`;
  const head = parts.slice(0, 4).join('');
  return Buffer.concat([Buffer.from(head), Buffer.from(xrefPart)]);
}

function escapePdf(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}
