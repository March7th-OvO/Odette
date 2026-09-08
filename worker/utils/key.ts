export const validKey = (key: string) => /^images\/\d{4}\/(0[1-9]|1[0-2])\/[a-f0-9-]{36}\.(jpg|png|webp|avif|gif)$/.test(key);
export function createKey(ext: string) {
  const now = new Date();
  // UTC keeps object paths consistent across clients and Worker locations.
  return `images/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}.${ext}`;
}
