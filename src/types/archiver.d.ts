declare module "archiver" {
  import { Readable } from "node:stream";
  export class ZipArchive extends Readable {
    constructor(opts?: { zlib?: { level?: number } });
    append(source: Buffer | string, data: { name: string }): this;
    finalize(): Promise<void>;
    abort(): this;
  }
}
