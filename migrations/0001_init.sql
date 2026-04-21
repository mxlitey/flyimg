CREATE TABLE IF NOT EXISTS images (
  filename TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  size INTEGER NOT NULL,
  user_tag TEXT NOT NULL DEFAULT 'anonymous',
  expire_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_images_user_tag ON images(user_tag);
CREATE INDEX IF NOT EXISTS idx_images_expire_at ON images(expire_at);
