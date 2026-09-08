export class ImageRepository {
  constructor(private bucket: R2Bucket) {}
  list(prefix: string, limit: number, cursor?: string) {
    // delimiter 将扁平 Key 分组为当前层对象和下一层目录前缀。
    return this.bucket.list({ prefix, delimiter: '/', limit, cursor, include: ['httpMetadata', 'customMetadata'] });
  }
  put(key: string, file: File) {
    return this.bucket.put(key, file.stream(), {
      // A conditional write prevents even an unlikely UUID collision from replacing an object.
      onlyIf: { etagDoesNotMatch: '*' },
      httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=31536000, immutable' },
      customMetadata: { originalName: file.name },
    });
  }
  delete(key: string) { return this.bucket.delete(key); }
}
