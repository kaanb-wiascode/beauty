import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ObjectStorageService } from './object-storage.service';

function service(overrides: Record<string, string> = {}) {
  const values = {
    OBJECT_STORAGE_BUCKET: 'private-files',
    OBJECT_STORAGE_REGION: 'eu-central-1',
    OBJECT_STORAGE_ENDPOINT: 'https://objects.example.test',
    OBJECT_STORAGE_FORCE_PATH_STYLE: 'true',
    OBJECT_STORAGE_ACCESS_KEY_ID: 'TESTACCESSKEY',
    OBJECT_STORAGE_SECRET_ACCESS_KEY: 'super-secret-signing-key',
    OBJECT_STORAGE_PRESIGN_TTL_SECONDS: '300',
    OBJECT_STORAGE_MAX_BYTES: '26214400',
    ...overrides,
  };
  return new ObjectStorageService(new ConfigService(values));
}

describe('ObjectStorageService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates a scoped SigV4 PUT URL without exposing the secret', async () => {
    const storage = service();
    const result = await storage.presignPut(
      'tenants/t1/companies/c1/branches/b1/evidence/file.pdf',
      'Application/PDF',
    );
    const url = new URL(result.url);

    expect(url.pathname).toBe(
      '/private-files/tenants/t1/companies/c1/branches/b1/evidence/file.pdf',
    );
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(url.searchParams.get('X-Amz-Credential')).toContain('TESTACCESSKEY/');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('content-type;host');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/);
    expect(result.requiredHeaders).toEqual({ 'content-type': 'application/pdf' });
    expect(result.url).not.toContain('super-secret-signing-key');
  });

  it('rejects browser-active and executable upload types', async () => {
    const storage = service();

    await expect(storage.presignPut('unsafe/page.html', 'text/html')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(storage.presignPut('unsafe/vector.svg', 'image/svg+xml')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(storage.presignPut('unsafe/script.js', 'application/javascript')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('encodes a download filename exactly once', async () => {
    const storage = service();
    const result = await storage.presignGet(
      'training/t1/course/v1/document.pdf',
      'eğitim raporu.pdf',
    );
    const url = new URL(result.url);

    expect(url.searchParams.get('response-content-disposition')).toBe(
      "attachment; filename*=UTF-8''eğitim raporu.pdf",
    );
    expect(result.url).not.toContain('%2525');
  });

  it('reads verified object metadata through a signed HEAD request', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(null, {
        status: 200,
        headers: {
          'content-length': '1234',
          'content-type': 'application/pdf',
          etag: '"abc123"',
          'last-modified': 'Fri, 11 Sep 2026 10:00:00 GMT',
        },
      }),
    );

    const result = await service().head('evidence/t1/file.pdf');

    expect(result).toEqual({
      byteSize: 1234,
      mimeType: 'application/pdf',
      etag: 'abc123',
      lastModified: new Date('Fri, 11 Sep 2026 10:00:00 GMT'),
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0];
    expect(init?.method).toBe('HEAD');
    expect(init?.headers).toEqual(
      expect.objectContaining({
        authorization: expect.stringContaining('AWS4-HMAC-SHA256 Credential=TESTACCESSKEY/'),
        'x-amz-date': expect.any(String),
      }),
    );
    expect((init?.headers as Record<string, string>).host).toBeUndefined();
  });

  it('rejects a stored object whose verified content type is unsafe', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(null, {
        status: 200,
        headers: {
          'content-length': '12',
          'content-type': 'text/html',
        },
      }),
    );

    await expect(service().head('evidence/t1/unsafe.html')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects non-success storage responses', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 404 }));

    await expect(service().head('missing/file.pdf')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('fails closed when storage credentials are incomplete', async () => {
    const storage = new ObjectStorageService(
      new ConfigService({ OBJECT_STORAGE_BUCKET: 'private-files' }),
    );

    await expect(storage.presignGet('some/file.pdf')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
