export interface MediaStore {
  exists(key: string): Promise<boolean>
  put(key: string, body: Uint8Array, contentType: string): Promise<void>
  publicUrl(key: string): string
}
