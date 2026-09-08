import { HTTPException } from 'hono/http-exception';
import type { FolderItem } from '../../shared/folder';
import { IMAGE_PREFIX } from '../../shared/image';
import { FolderRepository } from '../repositories/folder.repository';
import { validPrefix } from '../utils/key';
import { badRequest } from '../utils/response';

export function normalizeFolderName(input: unknown) {
  if (typeof input !== 'string') badRequest('文件夹名称不能为空');

  const name = input.trim().normalize('NFC');
  if (
    !name || name === '.' || name === '..'
    || name.includes('/') || name.includes('\\')
    || /[\u0000-\u001f\u007f]/.test(name)
  ) badRequest('文件夹名称无效，只能创建单级文件夹');

  return name;
}

export class FolderService {
  private repository: FolderRepository;

  constructor(env: Env) {
    this.repository = new FolderRepository(env.IMAGE_BUCKET);
  }

  async create(parentPrefix: string, rawName: unknown): Promise<FolderItem> {
    if (!validPrefix(parentPrefix)) {
      badRequest(`父目录必须是 ${IMAGE_PREFIX} 下以 / 结尾的安全目录路径`);
    }

    const name = normalizeFolderName(rawName);
    const prefix = `${parentPrefix}${name}/`;
    if (!validPrefix(prefix)) badRequest('文件夹路径无效或过长');

    if (parentPrefix !== IMAGE_PREFIX && !(await this.repository.folderExists(parentPrefix))) {
      throw new HTTPException(404, { message: '父目录不存在' });
    }
    if (await this.repository.folderExists(prefix)) {
      throw new HTTPException(409, { message: '同名文件夹已存在' });
    }

    const created = await this.repository.createFolder(prefix);
    if (!created) throw new HTTPException(409, { message: '同名文件夹已存在' });
    return { name, prefix };
  }
}
