import { HTTPException } from 'hono/http-exception';
export function badRequest(message: string): never { throw new HTTPException(400, { message }); }
export function success<T>(data: T) { return { code: 200, data }; }
