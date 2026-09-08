export class FolderRepository {
  constructor(private bucket: R2Bucket) {}

  async folderExists(prefix: string) {
    const result = await this.bucket.list({ prefix, limit: 1 });
    return result.objects.length > 0;
  }

  createFolder(prefix: string) {
    return this.bucket.put(prefix, new Uint8Array(0), {
      onlyIf: { etagDoesNotMatch: '*' },
      customMetadata: { type: 'folder' },
    });
  }
}
