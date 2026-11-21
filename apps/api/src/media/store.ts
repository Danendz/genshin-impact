export interface MediaStore {
  exists(key: string): Promise<boolean>
  put(key: string, body: Uint8Array, contentType: string): Promise<void>
  publicUrl(key: string): string
  /** every key under `prefix` */
  list(prefix: string): Promise<string[]>
  delete(key: string): Promise<void>
}
