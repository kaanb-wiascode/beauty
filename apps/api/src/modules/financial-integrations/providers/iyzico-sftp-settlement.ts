import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import type { ProviderPosSettlementBatch } from '../provider-adapter';

const ALLOWED_SFTP_HOSTS = new Set(['report.iyzipay.com', 'sandbox-report.iyzipay.com']);

interface SftpEntry { name: string; type?: string }
interface SftpClientLike {
  connect(config: { host: string; port: number; username: string; password: string; readyTimeout?: number }): Promise<unknown>;
  list(path: string): Promise<SftpEntry[]>;
  get(path: string): Promise<Buffer | string>;
  end(): Promise<unknown>;
}
export type IyzicoSftpFactory = () => SftpClientLike;

function defaultFactory(): SftpClientLike {
  // Runtime dependency is loaded lazily so API startup does not open network connections.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const SftpClient = require('ssh2-sftp-client') as new () => SftpClientLike;
  return new SftpClient();
}

function dateToken(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function parseCsvLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (ch === delimiter && !quoted) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function normalizeHeader(value: string) {
  return value.replace(/^\uFEFF/, '').trim();
}

function parseSettlementDate(raw: string) {
  const normalized = raw.trim();
  if (!normalized) return null;
  const isoLike = normalized.includes('T') ? normalized : normalized.replace(' ', 'T');
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(isoLike);
  const parsed = new Date(hasZone ? isoLike : `${isoLike}+03:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parseIyzicoSettlementCsv(csv: string, filename: string): ProviderPosSettlementBatch[] {
  const lines = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((line) => line.trim());
  if (!lines.length) return [];
  const delimiter = lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';
  const headers = parseCsvLine(lines[0], delimiter).map(normalizeHeader);
  const headerSet = new Set(headers);
  if (!headerSet.has('transactionType') || !headerSet.has('paymentId')) {
    throw new ServiceUnavailableException('iyzico settlement CSV does not contain the documented transaction columns.');
  }

  const groups = new Map<string, {
    providerSettlementId: string;
    currency: string;
    settledAt: Date | null;
    providerTransactionIds: Set<string>;
    requiresReview: boolean;
    reasons: Set<string>;
  }>();

  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseCsvLine(lines[i], delimiter);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => { row[header] = cells[index]?.trim() ?? ''; });
    const transactionType = String(row.transactionType ?? '').trim().toLowerCase();
    const paymentId = String(row.paymentId ?? '').trim();
    const currency = String(row.settlementCurrency || row.transactionCurrency || '').trim().toUpperCase();
    const settlementReferenceCode = String(row.settlementReferenceCode ?? '').trim();
    const settlementDate = parseSettlementDate(String(row.settlementResolveDate ?? row.settlementDate ?? ''));

    // Ignore summary/footer rows that do not identify a transaction.
    if (!transactionType && !paymentId) continue;
    if (!currency) throw new ServiceUnavailableException('iyzico settlement CSV currency is missing.');
    const providerSettlementId = settlementReferenceCode || `IYZICO:${filename}:${currency}`;
    const key = `${providerSettlementId}:${currency}`;
    const group = groups.get(key) ?? {
      providerSettlementId,
      currency,
      settledAt: settlementDate,
      providerTransactionIds: new Set<string>(),
      requiresReview: false,
      reasons: new Set<string>(),
    };

    if (settlementDate) {
      if (group.settledAt && Math.abs(group.settledAt.getTime() - settlementDate.getTime()) > 1000) {
        group.requiresReview = true;
        group.reasons.add('INCONSISTENT_SETTLEMENT_DATE');
      } else {
        group.settledAt = settlementDate;
      }
    }

    const disputeReference = String(row.disputeReferenceCode ?? '').trim();
    const chargeType = String(row.chargeType ?? '').trim();
    if (disputeReference || chargeType) {
      group.requiresReview = true;
      group.reasons.add('DISPUTE_OR_CHARGE');
    }

    if (transactionType === 'auth' || transactionType === 'postauth' || transactionType === 'payment') {
      if (!paymentId) {
        group.requiresReview = true;
        group.reasons.add('PAYMENT_ID_MISSING');
      } else {
        group.providerTransactionIds.add(paymentId);
      }
    } else if (transactionType === 'refund' || transactionType === 'cancel') {
      group.requiresReview = true;
      group.reasons.add(transactionType.toUpperCase());
    } else {
      group.requiresReview = true;
      group.reasons.add('UNKNOWN_TRANSACTION_TYPE');
    }
    groups.set(key, group);
  }

  return Array.from(groups.values()).map((group) => {
    if (!group.settledAt) {
      group.requiresReview = true;
      group.reasons.add('SETTLEMENT_DATE_MISSING');
    }
    return {
      providerSettlementId: group.providerSettlementId,
      currency: group.currency,
      settledAt: group.settledAt ?? new Date(0),
      providerTransactionIds: Array.from(group.providerTransactionIds),
      requiresReview: group.requiresReview,
      reviewReason: Array.from(group.reasons).sort().join(','),
    };
  });
}

export async function listIyzicoSftpSettlements(
  credentials: Record<string, string>,
  date: Date,
  factory: IyzicoSftpFactory = defaultFactory,
): Promise<ProviderPosSettlementBatch[]> {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new BadRequestException('iyzico settlement date is invalid.');
  }
  const merchantId = credentials.merchantId?.trim();
  const username = credentials.sftpUsername?.trim();
  const password = credentials.sftpPassword;
  const host = credentials.sftpHost?.trim() || 'report.iyzipay.com';
  const port = Number(credentials.sftpPort || 22);
  if (!merchantId || !username || !password) {
    throw new ServiceUnavailableException('iyzico SFTP credentials are not configured.');
  }
  if (!ALLOWED_SFTP_HOSTS.has(host)) {
    throw new BadRequestException('iyzico SFTP host is not an allowed official endpoint.');
  }
  if (!Number.isInteger(port) || port !== 22) {
    throw new BadRequestException('iyzico SFTP port must be the official port 22.');
  }

  const client = factory();
  const root = '/settlement';
  try {
    await client.connect({ host, port, username, password, readyTimeout: 10_000 });
    const entries = await client.list(root);
    const token = dateToken(date);
    const prefix = `settlement-${merchantId}-${token}`;
    const matching = entries.filter((entry) =>
      entry.name.startsWith(prefix) && entry.name.toLowerCase().endsWith('.csv'),
    );
    const batches: ProviderPosSettlementBatch[] = [];
    for (const entry of matching) {
      const raw = await client.get(`${root}/${entry.name}`);
      const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
      batches.push(...parseIyzicoSettlementCsv(text, entry.name));
    }
    return batches;
  } catch (error) {
    if (error instanceof BadRequestException || error instanceof ServiceUnavailableException) throw error;
    throw new ServiceUnavailableException('iyzico SFTP settlement import failed.');
  } finally {
    try { await client.end(); } catch { /* do not mask settlement result */ }
  }
}
