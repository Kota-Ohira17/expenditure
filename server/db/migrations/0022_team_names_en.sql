-- 担当名を英語の略称にする。今の日本語名は name_ja に残す（日本語の予算のシート・CSV と合わせるため）。
-- 明細の行（①⑦）・予算明細・割り当てた人・予算の変更・予算前執行の担当名も付け替える
UPDATE `budget_teams` SET `name_ja` = `team` WHERE `name_ja` = '';
--> statement-breakpoint
CREATE TABLE `_team_map` (`ja` text PRIMARY KEY NOT NULL, `en` text NOT NULL);
--> statement-breakpoint
INSERT INTO `_team_map` (`ja`, `en`) VALUES
  ('環境計画部長', 'eco'), ('交通整理担当', 'tra'), ('資材計画部長', 'szi'),
  ('財務局長', 'ZAI'), ('財務局運営員＠事務用品', 'zai'), ('渉外部長', 'nt'), ('広告協賛担当', 'ad'), ('個人賛助担当', 'pri'), ('福利厚生部長', 'welf'), ('保険担当', 'hoken'),
  ('総務部長', 'Adm'), ('ステージ企画部長', 'Stg'), ('レンタル担当', 'rent'), ('販売担当', 'sale'), ('食品衛生担当', 'food'), ('酒類取扱担当', 'sake'), ('屋外電力担当', 'gene'),
  ('企画局長補佐', 'evs'), ('オープニング企画担当', 'op'), ('フィナーレ企画担当', 'fin'), ('キャンパスツアー企画担当', 'tour'), ('キャンパスラリー企画担当', 'rally'), ('講演会企画担当', 'semi'), ('学内喚起企画担当', 'evoke'), ('めい企画担当', 'sheep'),
  ('広報局長', 'PR'), ('案内担当', 'info'), ('印刷物担当', 'dtp'), ('映像担当', 'mov'), ('グッズ担当', 'goods'), ('広報戦略担当', 'spi'), ('撮影担当', 'his'), ('装飾担当', 'deco'),
  ('システム局長', 'SYS');
--> statement-breakpoint
UPDATE `budget_teams` SET `team` = (SELECT `en` FROM `_team_map` WHERE `ja` = `budget_teams`.`team`) WHERE `team` IN (SELECT `ja` FROM `_team_map`);
--> statement-breakpoint
UPDATE `main_budget_items` SET `team` = (SELECT `en` FROM `_team_map` WHERE `ja` = `main_budget_items`.`team`) WHERE `team` IN (SELECT `ja` FROM `_team_map`);
--> statement-breakpoint
UPDATE `revised_budget_items` SET `team` = (SELECT `en` FROM `_team_map` WHERE `ja` = `revised_budget_items`.`team`) WHERE `team` IN (SELECT `ja` FROM `_team_map`);
--> statement-breakpoint
UPDATE `budget_lines` SET `team` = (SELECT `en` FROM `_team_map` WHERE `ja` = `budget_lines`.`team`) WHERE `team` IN (SELECT `ja` FROM `_team_map`);
--> statement-breakpoint
UPDATE `users` SET `budget_team` = (SELECT `en` FROM `_team_map` WHERE `ja` = `users`.`budget_team`) WHERE `budget_team` IN (SELECT `ja` FROM `_team_map`);
--> statement-breakpoint
UPDATE `budget_change_requests` SET `team` = (SELECT `en` FROM `_team_map` WHERE `ja` = `budget_change_requests`.`team`) WHERE `team` IN (SELECT `ja` FROM `_team_map`);
--> statement-breakpoint
UPDATE `pre_execution_requests` SET `team` = (SELECT `en` FROM `_team_map` WHERE `ja` = `pre_execution_requests`.`team`) WHERE `team` IN (SELECT `ja` FROM `_team_map`);
--> statement-breakpoint
DROP TABLE `_team_map`;
--> statement-breakpoint
-- システム局に cyber・web・pcs の担当を足す（システム局のある集約ごとに、まだなければ）
INSERT INTO `budget_teams` (`round_id`, `bureau_id`, `bureau_no`, `bureau`, `team`, `name_ja`, `person`, `sort_order`)
SELECT b.`round_id`, b.`id`, b.`bureau_no`, b.`name`, n.`team`, '', '',
  (SELECT coalesce(max(t.`sort_order`), 0) FROM `budget_teams` t WHERE t.`bureau_id` = b.`id`) + n.`i`
FROM `budget_bureaus` b
JOIN (SELECT 'cyber' AS `team`, 1 AS `i` UNION ALL SELECT 'web', 2 UNION ALL SELECT 'pcs', 3) n
WHERE b.`name` = 'システム局'
  AND NOT EXISTS (SELECT 1 FROM `budget_teams` t WHERE t.`bureau_id` = b.`id` AND t.`team` = n.`team`);
