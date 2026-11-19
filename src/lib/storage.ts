// Storage adapter. "local" stores files on disk (development and tests);
// "supabase" uses a private Supabase Storage bucket (production).
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { signToken } from "./tokens";

export type UploadTarget = { url: string; method: "PUT"; headers: Record<string, string> };

export interface Storage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  remove(key: string): Promise<void>;
  /** Where the browser should PUT the original file (bypasses server body limits). */
  createUploadTarget(key: string, contentType: string): Promise<UploadTarget>;
}

function safeKey(key: string) {
  if (key.includes("..") || key.startsWith("/")) throw new Error("invalid storage key");
  return key;
}

class LocalStorage implements Storage {
  constructor(private root: string) {}
  private file(key: string) {
    return path.join(/*turbopackIgnore: true*/ this.root, safeKey(key));
  }
  async put(key: string, body: Buffer) {
    const f = this.file(key);
    await mkdir(path.dirname(f), { recursive: true });
    await writeFile(f, body);
  }
  async get(key: string) {
    return readFile(this.file(key));
  }
  async exists(key: string) {
    try {
      await stat(this.file(key));
      return true;
    } catch {
      return false;
    }
  }
  async remove(key: string) {
    await rm(this.file(key), { force: true });
  }
  async createUploadTarget(key: string, contentType: string): Promise<UploadTarget> {
    const token = await signToken({ k: safeKey(key), t: "upload" }, "2h");
    return {
      url: `/api/uploads/local?token=${encodeURIComponent(token)}`,
      method: "PUT",
      headers: { "content-type": contentType },
    };
  }
}

class SupabaseStorage implements Storage {
  private client: SupabaseClient;
  constructor(
    url: string,
    serviceKey: string,
    private bucket: string,
  ) {
    this.client = createClient(url, serviceKey, { auth: { persistSession: false } });
  }
  private get b() {
    return this.client.storage.from(this.bucket);
  }
  async put(key: string, body: Buffer, contentType: string) {
    const { error } = await this.b.upload(safeKey(key), body, { contentType, upsert: true });
    if (error) throw new Error(`storage put failed: ${error.message}`);
  }
  async get(key: string) {
    const { data, error } = await this.b.download(safeKey(key));
    if (error || !data) throw new Error(`storage get failed for ${key}: ${error?.message}`);
    return Buffer.from(await data.arrayBuffer());
  }
  async exists(key: string) {
    const { data } = await this.b.exists(safeKey(key));
    return Boolean(data);
  }
  async remove(key: string) {
    await this.b.remove([safeKey(key)]);
  }
  async createUploadTarget(key: string, contentType: string): Promise<UploadTarget> {
    const { data, error } = await this.b.createSignedUploadUrl(safeKey(key));
    if (error || !data) throw new Error(`could not create upload URL: ${error?.message}`);
    return { url: data.signedUrl, method: "PUT", headers: { "content-type": contentType, "x-upsert": "false" } };
  }
}

let instance: Storage | undefined;

export function storage(): Storage {
  if (instance) return instance;
  const driver = process.env.STORAGE_DRIVER ?? "local";
  if (driver === "supabase") {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
    // Accept a pasted URL with a path (e.g. .../rest/v1/); only the origin is valid.
    const origin = new URL(url.trim()).origin;
    instance = new SupabaseStorage(origin, key.trim(), (process.env.SUPABASE_BUCKET ?? "look-gooder").trim());
  } else {
    instance = new LocalStorage(path.resolve(/*turbopackIgnore: true*/ process.env.STORAGE_DIR ?? ".data/storage"));
  }
  return instance;
}

/** For tests: swap in a specific storage root. */
export function useLocalStorageRoot(root: string) {
  instance = new LocalStorage(root);
}
