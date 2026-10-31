-- 予算まわりを ①予算項目DB・②予算変更申請DB・⑤査定DB・⑦補正予算項目DB の形に移す。期は第100期で固定。
-- ① 最新の確定した集約の明細（削除の印のないもの）を、承認済みの行として入れる
INSERT INTO `main_budget_items` (`id`, `term`, `round_id`, `item_number`, `bureau`, `team`, `kan`, `kou`, `moku`, `setsu`, `amount`, `quantity`, `unit_price`, `spec`, `vendor`, `remark`, `link`, `planned_timing`, `is_new`, `pre_execution`, `deleted`, `status`, `sort_order`, `created_at`, `created_by`)
SELECT lower(hex(randomblob(16))), '第100期', i.`round_id`, i.`item_number`, t.`bureau`, t.`team`, i.`kan`, i.`kou`, i.`moku`, i.`setsu`, i.`amount`, i.`quantity`, i.`unit_price`, i.`spec`, i.`vendor`, i.`remark`, i.`link`, i.`planned_timing`, i.`is_new`, i.`pre_execution`, 0, 'approved', i.`sort_order`, coalesce(r.`confirmed_at`, i.`updated_at`), i.`updated_by`
FROM `budget_items` i
JOIN `budget_teams` t ON t.`id` = i.`team_id`
JOIN `budget_rounds` r ON r.`id` = i.`round_id`
WHERE r.`id` = (SELECT `id` FROM `budget_rounds` WHERE `status` = 'confirmed' ORDER BY `confirmed_at` DESC, `id` DESC LIMIT 1)
  AND i.`deleted` = 0 AND i.`item_number` != '';
--> statement-breakpoint
-- 元のシートで同じ項目番号が別々の明細に付いていたら（項目番号で項目を見分けるので）、2つ目からはその款の空いている番号に付け直す。
-- 執行依頼の明細（entry_items）・予算明細（budget_lines）・「支出」シートの行の番号と key も一緒に付け替える
CREATE TABLE `_renumber` AS
WITH r AS (
  SELECT `id`, `item_number`, `sort_order`, substr(`item_number`, 1, length(`item_number`) - 3) AS parent,
    row_number() OVER (PARTITION BY `item_number` ORDER BY `sort_order`) AS rn
  FROM `main_budget_items`
), d AS (
  SELECT r.*, row_number() OVER (PARTITION BY parent ORDER BY `sort_order`) AS dr FROM r WHERE rn > 1
)
SELECT d.`id`, d.`item_number` AS old_no,
  d.parent || '-' || printf('%02d', (SELECT max(CAST(substr(m.`item_number`, -2) AS INTEGER)) FROM `main_budget_items` m WHERE substr(m.`item_number`, 1, length(m.`item_number`) - 3) = d.parent) + d.dr) AS new_no
FROM d;
--> statement-breakpoint
CREATE TABLE `_renumber_keys` AS
SELECT bl.`key` AS old_key, rn.new_no || substr(bl.`key`, length(rn.old_no) + 1) AS new_key, rn.new_no
FROM `_renumber` rn
JOIN `main_budget_items` m ON m.`id` = rn.`id`
JOIN `budget_lines` bl ON bl.`item_number` = rn.old_no AND bl.`kou` = m.`kou` AND bl.`moku` = m.`moku` AND bl.`setsu` = m.`setsu` AND bl.`budget_amount` = m.`amount`;
--> statement-breakpoint
UPDATE `entry_items` SET
  `item_number` = (SELECT new_no FROM `_renumber_keys` k WHERE k.old_key = `entry_items`.`line_key`),
  `line_key` = (SELECT new_key FROM `_renumber_keys` k WHERE k.old_key = `entry_items`.`line_key`)
WHERE `line_key` IN (SELECT old_key FROM `_renumber_keys`);
--> statement-breakpoint
UPDATE `budget_sheet_rows` SET
  `cells` = json_set(`cells`, '$[0]', (SELECT new_no FROM `_renumber_keys` k WHERE k.old_key = `budget_sheet_rows`.`line_key`)),
  `line_key` = (SELECT new_key FROM `_renumber_keys` k WHERE k.old_key = `budget_sheet_rows`.`line_key`)
WHERE `line_key` IN (SELECT old_key FROM `_renumber_keys`);
--> statement-breakpoint
UPDATE `budget_lines` SET
  `item_number` = (SELECT new_no FROM `_renumber_keys` k WHERE k.old_key = `budget_lines`.`key`),
  `key` = (SELECT new_key FROM `_renumber_keys` k WHERE k.old_key = `budget_lines`.`key`)
WHERE `key` IN (SELECT old_key FROM `_renumber_keys`);
--> statement-breakpoint
UPDATE `main_budget_items` SET `item_number` = (SELECT new_no FROM `_renumber` r WHERE r.`id` = `main_budget_items`.`id`)
WHERE `id` IN (SELECT `id` FROM `_renumber`);
--> statement-breakpoint
DROP TABLE `_renumber`;
--> statement-breakpoint
DROP TABLE `_renumber_keys`;
--> statement-breakpoint
-- 集約中の本予算の明細は ① の案の行に、補正予算の明細は ⑦ の行に入れる。
-- 番号のない明細は、確定のときと同じ決まり（局ごとに款を 01 から、款の中を 01 から）で付ける。補正予算で番号のない明細は、その局の 99 番の款に仮に入れる
INSERT INTO `main_budget_items` (`id`, `term`, `round_id`, `item_number`, `bureau`, `team`, `kan`, `kou`, `moku`, `setsu`, `amount`, `quantity`, `unit_price`, `spec`, `vendor`, `remark`, `link`, `planned_timing`, `is_new`, `pre_execution`, `deleted`, `status`, `sort_order`, `created_at`, `created_by`)
WITH x AS (
  SELECT i.*, t.`bureau_no` AS bno, t.`bureau` AS tb, t.`team` AS tt, t.`sort_order` AS tso,
    min(i.`sort_order`) OVER (PARTITION BY i.`team_id`, i.`kan`) AS kan_first
  FROM `budget_items` i JOIN `budget_teams` t ON t.`id` = i.`team_id` JOIN `budget_rounds` r ON r.`id` = i.`round_id`
  WHERE r.`status` != 'confirmed' AND r.`kind` = '本予算'
), y AS (
  SELECT x.*, dense_rank() OVER (PARTITION BY bno ORDER BY tso, `team_id`, kan_first, `kan`) AS kk,
    row_number() OVER (PARTITION BY `team_id`, `kan` ORDER BY `sort_order`, `id`) AS nn
  FROM x
)
SELECT 'mig-' || `id`, '第100期', `round_id`, bno || '-' || printf('%02d', kk) || '-' || printf('%02d', nn), tb, tt, `kan`, `kou`, `moku`, `setsu`, `amount`, `quantity`, `unit_price`, `spec`, `vendor`, `remark`, `link`, `planned_timing`, `is_new`, `pre_execution`, `deleted`, 'draft', `sort_order`, `updated_at`, `updated_by`
FROM y;
--> statement-breakpoint
INSERT INTO `revised_budget_items` (`id`, `term`, `round_id`, `item_number`, `bureau`, `team`, `kan`, `kou`, `moku`, `setsu`, `amount`, `quantity`, `unit_price`, `spec`, `vendor`, `remark`, `link`, `planned_timing`, `is_new`, `pre_execution`, `deleted`, `status`, `sort_order`, `created_at`, `created_by`)
WITH x AS (
  SELECT i.*, t.`bureau_no` AS bno, t.`bureau` AS tb, t.`team` AS tt,
    row_number() OVER (PARTITION BY t.`bureau_no`, (i.`item_number` = '') ORDER BY i.`sort_order`, i.`id`) AS nn
  FROM `budget_items` i JOIN `budget_teams` t ON t.`id` = i.`team_id` JOIN `budget_rounds` r ON r.`id` = i.`round_id`
  WHERE r.`status` != 'confirmed' AND r.`kind` = '補正予算'
)
SELECT 'mig-' || `id`, '第100期', `round_id`, CASE WHEN `item_number` != '' THEN `item_number` ELSE bno || '-99-' || printf('%02d', nn) END, tb, tt, `kan`, `kou`, `moku`, `setsu`, `amount`, `quantity`, `unit_price`, `spec`, `vendor`, `remark`, `link`, `planned_timing`, `is_new`, `pre_execution`, `deleted`, 'draft', `sort_order`, `updated_at`, `updated_by`
FROM x;
--> statement-breakpoint
-- ⑤ 集約中の明細の、今の査定の状態（と要修正の理由）
INSERT INTO `budget_reviews` (`id`, `round_id`, `item_number`, `action`, `status`, `comment`, `row_id`, `bulk`, `created_at`, `created_by`)
SELECT lower(hex(randomblob(16))), m.`round_id`, m.`item_number`,
  CASE i.`status` WHEN 'submitted' THEN 'submit' WHEN 'approved' THEN 'approve' WHEN 'returned' THEN 'return' ELSE 'create' END,
  i.`status`, i.`review_comment`, m.`id`, NULL, i.`updated_at`, i.`updated_by`
FROM `budget_items` i
JOIN (SELECT `id`, `round_id`, `item_number` FROM `main_budget_items` WHERE `id` LIKE 'mig-%'
      UNION ALL SELECT `id`, `round_id`, `item_number` FROM `revised_budget_items` WHERE `id` LIKE 'mig-%') m ON m.`id` = 'mig-' || i.`id`;
--> statement-breakpoint
-- ② 予算の変更の申請と履歴
INSERT INTO `budget_change_requests` (`id`, `term`, `item_number`, `bureau`, `team`, `kind`, `after`, `before`, `reason`, `created_at`, `created_by`, `sort_order`, `status`, `direct`, `review_comment`, `reviewed_at`, `reviewed_by`)
SELECT lower(hex(randomblob(16))), '第100期', c.`item_number`, coalesce(t.`bureau`, ''), coalesce(t.`team`, ''), c.`kind`, c.`after`, c.`before`, c.`reason`, c.`created_at`, c.`created_by`, 0, c.`status`, c.`direct`, c.`review_comment`, c.`reviewed_at`, c.`reviewed_by`
FROM `budget_changes` c LEFT JOIN `budget_teams` t ON t.`id` = c.`team_id`;
