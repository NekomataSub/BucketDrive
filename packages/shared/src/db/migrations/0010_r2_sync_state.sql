ALTER TABLE `workspace_settings` ADD `r2_last_sync_at` text;
ALTER TABLE `workspace_settings` ADD `r2_sync_status` text DEFAULT 'idle' NOT NULL;
ALTER TABLE `workspace_settings` ADD `r2_sync_error` text;
