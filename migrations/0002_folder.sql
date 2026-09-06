-- 文件夹上传：folders 作为整体条目，folder_files 记录成员相对路径（支持递归子目录）
CREATE TABLE IF NOT EXISTS folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  folder_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  user_tag TEXT NOT NULL DEFAULT 'default',
  size INTEGER NOT NULL DEFAULT 0,
  file_count INTEGER NOT NULL DEFAULT 0,
  index_path TEXT,
  renew_count INTEGER DEFAULT 0,
  expire_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'uploading'
);

CREATE TABLE IF NOT EXISTS folder_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  folder_key TEXT NOT NULL,
  rel_path TEXT NOT NULL,
  size INTEGER NOT NULL,
  UNIQUE(folder_key, rel_path)
);

CREATE INDEX IF NOT EXISTS idx_folders_user_tag ON folders(user_tag);
CREATE INDEX IF NOT EXISTS idx_folders_expire_at ON folders(expire_at);
CREATE INDEX IF NOT EXISTS idx_folders_status ON folders(status);
CREATE INDEX IF NOT EXISTS idx_folder_files_folder_key ON folder_files(folder_key);
