import { listIyzicoSftpSettlements, parseIyzicoSettlementCsv } from './iyzico-sftp-settlement';

describe('iyzico SFTP settlement import', () => {
  const header = [
    'transactionDate',
    'transactionType',
    'paymentTxId',
    'paymentId',
    'transactionCurrency',
    'settlementCurrency',
    'merchantPayoutAmount',
    'settlementReferenceCode',
    'settlementResolveDate',
    'chargeType',
    'disputeReferenceCode',
  ].join(',');

  it('deduplicates item-level auth rows into payment-level POS transactions', () => {
    const csv = [
      header,
      '2026-09-09 10:00:00,auth,101,5001,TRY,TRY,48.00,SET-42,2026-09-10 17:00:00,,',
      '2026-09-09 10:00:00,auth,102,5001,TRY,TRY,24.00,SET-42,2026-09-10 17:00:00,,',
      '2026-09-09 11:00:00,postauth,103,5002,TRY,TRY,12.00,SET-42,2026-09-10 17:00:00,,',
    ].join('\n');

    expect(parseIyzicoSettlementCsv(csv, 'settlement-123-20260910113007-TRY.csv')).toEqual([
      {
        providerSettlementId: 'SET-42',
        settledAt: new Date('2026-09-10T14:00:00.000Z'),
        currency: 'TRY',
        providerTransactionIds: ['5001', '5002'],
        requiresReview: false,
        reviewReason: '',
      },
    ]);
  });

  it('requires manual review when refund, cancel, charge or dispute records affect the payout', () => {
    const csv = [
      header,
      '2026-09-09 10:00:00,auth,101,5001,TRY,TRY,48.00,SET-43,2026-09-10 17:00:00,,',
      '2026-09-09 12:00:00,refund,104,5001,TRY,TRY,-10.00,SET-43,2026-09-10 17:00:00,,DSP-9',
    ].join('\n');

    const [batch] = parseIyzicoSettlementCsv(csv, 'settlement-123-20260910113007-TRY.csv');
    expect(batch.providerTransactionIds).toEqual(['5001']);
    expect(batch.requiresReview).toBe(true);
    expect(batch.reviewReason).toContain('REFUND');
    expect(batch.reviewReason).toContain('DISPUTE_OR_CHARGE');
  });

  it('connects only to official iyzico SFTP and downloads matching merchant/date settlement files', async () => {
    const connect = jest.fn().mockResolvedValue(undefined);
    const list = jest.fn().mockResolvedValue([
      { name: 'settlement-123-20260910113007-TRY.csv' },
      { name: 'settlement-123-20260909113007-TRY.csv' },
      { name: 'settlement-999-20260910113007-TRY.csv' },
    ]);
    const get = jest.fn().mockResolvedValue(Buffer.from([
      header,
      '2026-09-09 10:00:00,auth,101,5001,TRY,TRY,48.00,SET-44,2026-09-10 17:00:00,,',
    ].join('\n')));
    const end = jest.fn().mockResolvedValue(undefined);

    const result = await listIyzicoSftpSettlements(
      {
        merchantId: '123',
        sftpHost: 'sandbox-report.iyzipay.com',
        sftpUsername: 'merchant-user',
        sftpPassword: 'credential-value',
      },
      new Date('2026-09-10T12:00:00.000Z'),
      () => ({ connect, list, get, end }),
    );

    expect(connect).toHaveBeenCalledWith({
      host: 'sandbox-report.iyzipay.com',
      port: 22,
      username: 'merchant-user',
      password: 'credential-value',
      readyTimeout: 10_000,
    });
    expect(list).toHaveBeenCalledWith('/settlement');
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('/settlement/settlement-123-20260910113007-TRY.csv');
    expect(end).toHaveBeenCalled();
    expect(result[0]).toMatchObject({ providerSettlementId: 'SET-44', providerTransactionIds: ['5001'] });
  });

  it('rejects non-official SFTP hosts before opening a connection', async () => {
    const factory = jest.fn();
    await expect(listIyzicoSftpSettlements(
      {
        merchantId: '123',
        sftpHost: 'example.invalid',
        sftpUsername: 'merchant-user',
        sftpPassword: 'credential-value',
      },
      new Date('2026-09-10T12:00:00.000Z'),
      factory as never,
    )).rejects.toThrow('not an allowed official endpoint');
    expect(factory).not.toHaveBeenCalled();
  });
});
