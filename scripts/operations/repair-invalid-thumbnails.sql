-- Clears corrupted thumbnail references so the app can regenerate them from file storage.
-- Run against D1 after backing up the database.

UPDATE file_object
SET
  thumbnail_key = NULL,
  updated_at = datetime('now')
WHERE
  thumbnail_key IS NOT NULL
  AND thumbnail_key != 'bucket/thumbnails/' || id || '.webp';
