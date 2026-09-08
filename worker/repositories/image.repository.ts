export class ImageRepository {
  constructor(private bucket: R2Bucket) {}
  list(prefix: string, limit: number, cursor?: string) {
    return this.bucket.list({ prefix, limit, cursor, include: ['httpMetadata', 'customMetadata'] });
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
