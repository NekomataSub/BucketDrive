PRAGMA foreign_keys=off;

DROP TABLE IF EXISTS `bucket_repair`;
CREATE TABLE `bucket_repair` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `provider` text DEFAULT 'r2' NOT NULL,
  `region` text,
  `visibility` text DEFAULT 'private' NOT NULL,
  `created_at` text DEFAULT (current_timestamp) NOT NULL
);
INSERT INTO `bucket_repair` (`id`, `name`, `provider`, `region`, `visibility`, `created_at`)
SELECT `id`, `name`, `provider`, `region`, `visibility`, `created_at` FROM `bucket`;

DROP TABLE IF EXISTS `folder_repair`;
CREATE TABLE `folder_repair` (
  `id` text PRIMARY KEY NOT NULL,
  `parent_folder_id` text,
  `name` text NOT NULL,
  `path` text NOT NULL,
  `created_by` text NOT NULL,
  `is_deleted` integer DEFAULT false NOT NULL,
  `deleted_at` text,
  `created_at` text DEFAULT (current_timestamp) NOT NULL,
  `updated_at` text DEFAULT (current_timestamp) NOT NULL
);
INSERT INTO `folder_repair`
SELECT
  `id`,
  `parent_folder_id`,
  `name`,
  `path`,
  `created_by`,
  `is_deleted`,
  `deleted_at`,
  `created_at`,
  `updated_at`
FROM `folder`;

DROP TABLE IF EXISTS `file_object_repair`;
CREATE TABLE `file_object_repair` (
  `id` text PRIMARY KEY NOT NULL,
  `bucket_id` text NOT NULL,
  `folder_id` text,
  `owner_id` text NOT NULL,
  `storage_key` text NOT NULL,
  `original_name` text NOT NULL,
  `mime_type` text NOT NULL,
  `extension` text,
  `size_bytes` integer DEFAULT 0 NOT NULL,
  `checksum` text,
  `thumbnail_key` text,
  `metadata` text,
  `is_deleted` integer DEFAULT false NOT NULL,
  `deleted_at` text,
  `created_at` text DEFAULT (current_timestamp) NOT NULL,
  `updated_at` text DEFAULT (current_timestamp) NOT NULL
);
INSERT INTO `file_object_repair`
SELECT
  `id`,
  `bucket_id`,
  `folder_id`,
  `owner_id`,
  `storage_key`,
  `original_name`,
  `mime_type`,
  `extension`,
  `size_bytes`,
  `checksum`,
  `thumbnail_key`,
  `metadata`,
  `is_deleted`,
  `deleted_at`,
  `created_at`,
  `updated_at`
FROM `file_object`;

DROP TABLE IF EXISTS `file_tag_repair`;
CREATE TABLE `file_tag_repair` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `color` text DEFAULT '#6b7280' NOT NULL,
  `created_at` text DEFAULT (current_timestamp) NOT NULL
);
INSERT INTO `file_tag_repair` (`id`, `name`, `color`, `created_at`)
SELECT `id`, `name`, `color`, `created_at` FROM `file_tag`;

DROP TABLE IF EXISTS `share_link_repair`;
CREATE TABLE `share_link_repair` (
  `id` text PRIMARY KEY NOT NULL,
  `resource_type` text NOT NULL,
  `resource_id` text NOT NULL,
  `share_type` text NOT NULL,
  `created_by` text NOT NULL,
  `password_hash` text,
  `expires_at` text,
  `access_count` integer DEFAULT 0 NOT NULL,
  `download_count` integer DEFAULT 0 NOT NULL,
  `last_accessed_at` text,
  `is_active` integer DEFAULT true NOT NULL,
  `created_at` text DEFAULT (current_timestamp) NOT NULL,
  `updated_at` text DEFAULT (current_timestamp) NOT NULL
);
INSERT INTO `share_link_repair`
SELECT
  `id`,
  `resource_type`,
  `resource_id`,
  `share_type`,
  `created_by`,
  `password_hash`,
  `expires_at`,
  `access_count`,
  `download_count`,
  `last_accessed_at`,
  `is_active`,
  `created_at`,
  `updated_at`
FROM `share_link`;

DROP TABLE IF EXISTS `audit_log_repair`;
CREATE TABLE `audit_log_repair` (
  `id` text PRIMARY KEY NOT NULL,
  `actor_id` text NOT NULL,
  `action` text NOT NULL,
  `resource_type` text NOT NULL,
  `resource_id` text,
  `ip_address` text,
  `user_agent` text,
  `metadata` text,
  `created_at` text DEFAULT (current_timestamp) NOT NULL
);
INSERT INTO `audit_log_repair`
SELECT
  `id`,
  `actor_id`,
  `action`,
  `resource_type`,
  `resource_id`,
  `ip_address`,
  `user_agent`,
  `metadata`,
  `created_at`
FROM `audit_log`;

DROP TABLE IF EXISTS `upload_session_repair`;
CREATE TABLE `upload_session_repair` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `bucket_id` text NOT NULL,
  `status` text DEFAULT 'initiated' NOT NULL,
  `upload_type` text DEFAULT 'single' NOT NULL,
  `total_size` integer NOT NULL,
  `uploaded_size` integer DEFAULT 0 NOT NULL,
  `storage_key` text,
  `parts_completed` integer DEFAULT 0 NOT NULL,
  `total_parts` integer DEFAULT 1 NOT NULL,
  `created_at` text DEFAULT (current_timestamp) NOT NULL,
  `updated_at` text DEFAULT (current_timestamp) NOT NULL
);
INSERT INTO `upload_session_repair`
SELECT
  `id`,
  `user_id`,
  `bucket_id`,
  `status`,
  `upload_type`,
  `total_size`,
  `uploaded_size`,
  `storage_key`,
  `parts_completed`,
  `total_parts`,
  `created_at`,
  `updated_at`
FROM `upload_session`;

DROP TABLE IF EXISTS `notification_repair`;
CREATE TABLE `notification_repair` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `type` text NOT NULL,
  `title` text NOT NULL,
  `message` text NOT NULL,
  `data` text,
  `is_read` integer DEFAULT false NOT NULL,
  `created_at` text DEFAULT (current_timestamp) NOT NULL
);
INSERT INTO `notification_repair`
SELECT
  `id`,
  `user_id`,
  `type`,
  `title`,
  `message`,
  `data`,
  `is_read`,
  `created_at`
FROM `notification`;

DROP TRIGGER IF EXISTS `file_search_ai`;
DROP TRIGGER IF EXISTS `file_search_au`;
DROP TRIGGER IF EXISTS `file_search_ad`;
DROP TABLE IF EXISTS `file_search_idx`;

DROP INDEX IF EXISTS `file_object_storage_key_unique`;
DROP INDEX IF EXISTS `idx_file_object_workspace_deleted`;
DROP INDEX IF EXISTS `idx_file_object_deleted`;
DROP INDEX IF EXISTS `idx_file_object_mime_type`;

DROP TABLE `file_object`;
ALTER TABLE `file_object_repair` RENAME TO `file_object`;
CREATE UNIQUE INDEX `file_object_storage_key_unique` ON `file_object` (`storage_key`);
CREATE INDEX IF NOT EXISTS `idx_file_object_deleted` ON `file_object` (`is_deleted`);
CREATE INDEX IF NOT EXISTS `idx_file_object_mime_type` ON `file_object` (`mime_type`);

DROP TABLE `folder`;
ALTER TABLE `folder_repair` RENAME TO `folder`;

DROP TABLE `file_tag`;
ALTER TABLE `file_tag_repair` RENAME TO `file_tag`;

DROP TABLE `share_link`;
ALTER TABLE `share_link_repair` RENAME TO `share_link`;

DROP TABLE `audit_log`;
ALTER TABLE `audit_log_repair` RENAME TO `audit_log`;

DROP TABLE `upload_session`;
ALTER TABLE `upload_session_repair` RENAME TO `upload_session`;

DROP TABLE `notification`;
ALTER TABLE `notification_repair` RENAME TO `notification`;

DROP TABLE `bucket`;
ALTER TABLE `bucket_repair` RENAME TO `bucket`;

CREATE VIRTUAL TABLE `file_search_idx` USING fts5(
  `file_id` UNINDEXED,
  `original_name`,
  `extension`,
  `mime_type`
);
INSERT INTO `file_search_idx` (`file_id`, `original_name`, `extension`, `mime_type`)
SELECT `id`, `original_name`, COALESCE(`extension`, ''), `mime_type`
FROM `file_object`;
CREATE TRIGGER `file_search_ai`
AFTER INSERT ON `file_object`
BEGIN
  INSERT INTO `file_search_idx` (`file_id`, `original_name`, `extension`, `mime_type`)
  VALUES (NEW.`id`, NEW.`original_name`, COALESCE(NEW.`extension`, ''), NEW.`mime_type`);
END;
CREATE TRIGGER `file_search_au`
AFTER UPDATE ON `file_object`
BEGIN
  DELETE FROM `file_search_idx` WHERE `file_id` = OLD.`id`;
  INSERT INTO `file_search_idx` (`file_id`, `original_name`, `extension`, `mime_type`)
  VALUES (NEW.`id`, NEW.`original_name`, COALESCE(NEW.`extension`, ''), NEW.`mime_type`);
END;
CREATE TRIGGER `file_search_ad`
AFTER DELETE ON `file_object`
BEGIN
  DELETE FROM `file_search_idx` WHERE `file_id` = OLD.`id`;
END;

CREATE UNIQUE INDEX IF NOT EXISTS `idx_favorite_user_file` ON `favorite` (`user_id`, `file_object_id`);
CREATE INDEX IF NOT EXISTS `idx_favorite_user_active` ON `favorite` (`user_id`, `is_active`);
CREATE INDEX IF NOT EXISTS `idx_file_object_tag_file` ON `file_object_tag` (`file_object_id`);
CREATE INDEX IF NOT EXISTS `idx_file_object_tag_tag` ON `file_object_tag` (`tag_id`);

PRAGMA foreign_keys=on;
