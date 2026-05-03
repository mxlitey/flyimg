CREATE TABLE IF NOT EXISTS images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  size INTEGER NOT NULL,
  user_tag TEXT NOT NULL DEFAULT 'default',
  renew_count INTEGER DEFAULT 0,
  expire_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_images_user_tag ON images(user_tag);
CREATE INDEX IF NOT EXISTS idx_images_expire_at ON images(expire_at);
CREATE INDEX IF NOT EXISTS idx_images_filename ON images(filename);
