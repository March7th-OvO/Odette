export interface FolderItem {
  name: string;
  prefix: string;
}

export interface CreateFolderRequest {
  parentPrefix: string;
  name: string;
}

