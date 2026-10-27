import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, stat, unlink } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3';
import type { Config } from '../config';

export interface StoredObject {
  stream: Readable;
  size?: number;
}

export interface Storage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
  init(): Promise<void>;
}

/** Keys are generated server-side only; still guard against traversal. */
function safeKey(key: string) {
  if (!/^[a-zA-Z0-9/_\-.]+$/.test(key) || key.includes('..')) throw new Error('invalid storage key');
  return key;
}

class LocalStorage implements Storage {
  private base: string;
  constructor(dir: string) {
    this.base = resolve(dir);
  }
  private path(key: string) {
    const p = resolve(this.base, safeKey(key));
    if (!p.startsWith(this.base + sep)) throw new Error('invalid storage key');
    return p;
  }
  async init() {
    await mkdir(this.base, { recursive: true });
  }
  async put(key: string, body: Buffer) {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await pipeline(Readable.from(body), createWriteStream(p));
  }
  async get(key: string) {
    const p = this.path(key);
    try {
      const s = await stat(p);
      return { stream: createReadStream(p), size: s.size };
    } catch {
      return null;
    }
  }
  async delete(key: string) {
    await unlink(this.path(key)).catch(() => {});
  }
}

class S3Storage implements Storage {
  private client: S3Client;
  constructor(private cfg: Config) {
    this.client = new S3Client({
      endpoint: cfg.S3_ENDPOINT,
      region: cfg.S3_REGION,
      forcePathStyle: true,
      credentials: { accessKeyId: cfg.S3_ACCESS_KEY ?? '', secretAccessKey: cfg.S3_SECRET_KEY ?? '' },
    });
  }
  async init() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.cfg.S3_BUCKET }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.cfg.S3_BUCKET }));
    }
  }
  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.cfg.S3_BUCKET, Key: safeKey(key), Body: body, ContentType: contentType }));
  }
  async get(key: string) {
    try {
      const r = await this.client.send(new GetObjectCommand({ Bucket: this.cfg.S3_BUCKET, Key: safeKey(key) }));
      return { stream: r.Body as Readable, size: r.ContentLength };
    } catch {
      return null;
    }
  }
  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.cfg.S3_BUCKET, Key: safeKey(key) })).catch(() => {});
  }
}

export function createStorage(cfg: Config): Storage {
  return cfg.STORAGE_DRIVER === 's3' ? new S3Storage(cfg) : new LocalStorage(cfg.STORAGE_LOCAL_DIR);
}
