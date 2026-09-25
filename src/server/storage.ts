import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface StoredObject {
  key: string;
  sizeBytes: number;
  checksum: string;
}

/** Object storage abstraction — swap LocalDiskStorage for S3/R2/GCS in production. */
export interface StorageDriver {
  put(key: string, content: Uint8Array): Promise<StoredObject>;
  get(key: string): Promise<Uint8Array>;
}

class LocalDiskStorage implements StorageDriver {
  constructor(private readonly root: string) {}

  private resolve(key: string) {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new Error(`Invalid storage key: ${key}`);
    return full;
  }

  async put(key: string, content: Uint8Array): Promise<StoredObject> {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content);
    return { key, sizeBytes: content.byteLength, checksum: createHash("sha256").update(content).digest("hex") };
  }

  async get(key: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(this.resolve(key)));
  }
}

let driver: StorageDriver | undefined;

export function storage(): StorageDriver {
  driver ??= new LocalDiskStorage(process.env.STORAGE_DIR ?? path.join(process.cwd(), "storage"));
  return driver;
}

export function documentKey(companyId: string, fileName: string): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
  return `companies/${companyId}/${Date.now().toString(36)}-${safe}`;
}
