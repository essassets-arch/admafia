import fs from 'fs';
import path from 'path';
import { createHash, createHmac } from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_UPLOADS_ROOT = path.join(__dirname, '..', 'uploads');

/**
 * Cloud-Ready Media Storage Adapter (`STORAGE_PROVIDER=local | s3`).
 * - Now (VPS / Local Docker): Writes verified binary buffers to `backend/uploads/<folder>/<file>`
 *   and returns `/uploads/<folder>/<file>`.
 * - Future Cloud Cutover (2-3 Months): Flip `STORAGE_PROVIDER=s3` + Cloudflare R2 / AWS S3 credentials
 *   to upload directly via AWS SigV4 PUT without rewriting any Graphics/Marketing upload routes!
 */

function sha256Hex(data) {
  return createHash('sha256').update(data).digest('hex');
}

function hmacSha256(key, data) {
  return createHmac('sha256', key).update(data).digest();
}

async function putS3Object({ endpoint, bucket, region = 'auto', accessKeyId, secretAccessKey, objectKey, buffer, contentType }) {
  const cleanEndpoint = endpoint.replace(/\/$/, '');
  const url = new URL(`${cleanEndpoint}/${bucket}/${objectKey}`);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(buffer);

  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${url.host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [
    'PUT',
    url.pathname,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, 's3');
  const kSigning = hmacSha256(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const resp = await fetch(url.toString(), {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      Authorization: authorization,
    },
    body: buffer,
    signal: AbortSignal.timeout(20_000),
  });

  if (!resp.ok) {
    const errBody = await resp.text().catch(() => '');
    throw new Error(`Cloud R2/S3 upload failed (${resp.status}): ${errBody}`);
  }
}

export async function storeMediaAsset({ folder = 'marketing', fileName, buffer, contentType = 'application/octet-stream' }) {
  const safeFolder = String(folder || 'marketing').replace(/[^a-zA-Z0-9_-]/g, '');
  const safeFileName = path.basename(String(fileName || `asset_${Date.now()}.bin`)).replace(/[^a-zA-Z0-9._-]/g, '_');
  const provider = (process.env.STORAGE_PROVIDER || 'local').trim().toLowerCase();

  if (provider === 's3' || provider === 'r2') {
    const endpoint = (process.env.S3_ENDPOINT || '').trim();
    const bucket = (process.env.S3_BUCKET || '').trim();
    const accessKeyId = (process.env.S3_ACCESS_KEY_ID || '').trim();
    const secretAccessKey = (process.env.S3_SECRET_ACCESS_KEY || '').trim();
    const publicCdn = (process.env.PUBLIC_CDN_URL || '').trim().replace(/\/$/, '');

    if (endpoint && bucket && accessKeyId && secretAccessKey) {
      const objectKey = `${safeFolder}/${safeFileName}`;
      await putS3Object({
        endpoint,
        bucket,
        region: (process.env.S3_REGION || 'auto').trim(),
        accessKeyId,
        secretAccessKey,
        objectKey,
        buffer,
        contentType,
      });
      const publicUrl = publicCdn ? `${publicCdn}/${objectKey}` : `${endpoint.replace(/\/$/, '')}/${bucket}/${objectKey}`;
      return {
        provider: 's3',
        url: publicUrl,
        sizeBytes: buffer.length,
      };
    }
  }

  // Local Docker / VPS Volume Storage
  const targetDir = path.join(DEFAULT_UPLOADS_ROOT, safeFolder);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  const fullPath = path.join(targetDir, safeFileName);
  await fs.promises.writeFile(fullPath, buffer);
  return {
    provider: 'local',
    url: `/uploads/${safeFolder}/${safeFileName}`,
    sizeBytes: buffer.length,
  };
}

