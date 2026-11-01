ALTER TABLE `entries` ADD `evidence_checked_at` integer;--> statement-breakpoint
ALTER TABLE `entries` ADD `evidence_checked_by` text;--> statement-breakpoint
ALTER TABLE `entries` ADD `evidence_return_comment` text DEFAULT '' NOT NULL;--> statement-breakpoint
-- 確認待ちの段階を入れる前に完了していた申請（対応済みで証憑もある）は、確認済みとして扱う
UPDATE `entries` SET `evidence_checked_at` = CAST(strftime('%s', 'now') AS integer) * 1000
WHERE `status` = 'done' AND (
  (`kind` = 'execution' AND EXISTS (SELECT 1 FROM `evidence_files` f WHERE f.`entry_id` = `entries`.`id`))
  OR (`kind` = 'evidence' AND `attachment_id` IS NOT NULL)
);
