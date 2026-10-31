-- 担当名（英語）の1文字目を大文字にするのは、日本語名が「統括」「部長」で終わる担当だけにする（0026 で大文字にしたほかの担当は戻す：Tra → tra）。
-- ZAI・PR・SYS のようにすべて大文字の名前はそのまま
CREATE TABLE `_team_case` (`bureau` text NOT NULL, `old` text NOT NULL, `new` text NOT NULL, PRIMARY KEY (`bureau`, `old`));
--> statement-breakpoint
INSERT INTO `_team_case` (`bureau`, `old`, `new`)
SELECT `bureau`, `team`, lower(substr(`team`, 1, 1)) || substr(`team`, 2)
FROM `budget_teams`
WHERE `team` GLOB '[A-Z]*' AND NOT `team` GLOB '[A-Z][A-Z]*'
GROUP BY `bureau`, `team`
HAVING sum(`name_ja` LIKE '%部長' OR `name_ja` LIKE '%統括') = 0;
--> statement-breakpoint
UPDATE `budget_teams` SET `team` = (SELECT `new` FROM `_team_case` c WHERE c.`bureau` = `budget_teams`.`bureau` AND c.`old` = `budget_teams`.`team`) WHERE EXISTS (SELECT 1 FROM `_team_case` c WHERE c.`bureau` = `budget_teams`.`bureau` AND c.`old` = `budget_teams`.`team`);
--> statement-breakpoint
UPDATE `main_budget_items` SET `team` = (SELECT `new` FROM `_team_case` c WHERE c.`bureau` = `main_budget_items`.`bureau` AND c.`old` = `main_budget_items`.`team`) WHERE EXISTS (SELECT 1 FROM `_team_case` c WHERE c.`bureau` = `main_budget_items`.`bureau` AND c.`old` = `main_budget_items`.`team`);
--> statement-breakpoint
UPDATE `revised_budget_items` SET `team` = (SELECT `new` FROM `_team_case` c WHERE c.`bureau` = `revised_budget_items`.`bureau` AND c.`old` = `revised_budget_items`.`team`) WHERE EXISTS (SELECT 1 FROM `_team_case` c WHERE c.`bureau` = `revised_budget_items`.`bureau` AND c.`old` = `revised_budget_items`.`team`);
--> statement-breakpoint
UPDATE `budget_lines` SET `team` = (SELECT `new` FROM `_team_case` c WHERE c.`bureau` = `budget_lines`.`bureau` AND c.`old` = `budget_lines`.`team`) WHERE EXISTS (SELECT 1 FROM `_team_case` c WHERE c.`bureau` = `budget_lines`.`bureau` AND c.`old` = `budget_lines`.`team`);
--> statement-breakpoint
UPDATE `budget_change_requests` SET `team` = (SELECT `new` FROM `_team_case` c WHERE c.`bureau` = `budget_change_requests`.`bureau` AND c.`old` = `budget_change_requests`.`team`) WHERE EXISTS (SELECT 1 FROM `_team_case` c WHERE c.`bureau` = `budget_change_requests`.`bureau` AND c.`old` = `budget_change_requests`.`team`);
--> statement-breakpoint
UPDATE `pre_execution_requests` SET `team` = (SELECT `new` FROM `_team_case` c WHERE c.`bureau` = `pre_execution_requests`.`bureau` AND c.`old` = `pre_execution_requests`.`team`) WHERE EXISTS (SELECT 1 FROM `_team_case` c WHERE c.`bureau` = `pre_execution_requests`.`bureau` AND c.`old` = `pre_execution_requests`.`team`);
--> statement-breakpoint
UPDATE `budget_references` SET `team` = (SELECT `new` FROM `_team_case` c WHERE c.`bureau` = `budget_references`.`bureau` AND c.`old` = `budget_references`.`team`) WHERE EXISTS (SELECT 1 FROM `_team_case` c WHERE c.`bureau` = `budget_references`.`bureau` AND c.`old` = `budget_references`.`team`);
--> statement-breakpoint
UPDATE `users` SET `budget_team` = (SELECT `new` FROM `_team_case` c WHERE c.`bureau` = `users`.`budget_bureau` AND c.`old` = `users`.`budget_team`) WHERE EXISTS (SELECT 1 FROM `_team_case` c WHERE c.`bureau` = `users`.`budget_bureau` AND c.`old` = `users`.`budget_team`);
--> statement-breakpoint
-- 執行依頼の担当名（自由に書く欄）：「統括」「部長」の担当の名前でなければ、0026 で大文字にした1文字目を戻す
UPDATE `entries` SET `in_charge` = lower(substr(`in_charge`, 1, 1)) || substr(`in_charge`, 2)
WHERE `in_charge` GLOB '[A-Z]*' AND NOT `in_charge` GLOB '[A-Z][A-Z]*'
  AND `in_charge` NOT IN (SELECT `team` FROM `budget_teams` WHERE `name_ja` LIKE '%部長' OR `name_ja` LIKE '%統括');
--> statement-breakpoint
DROP TABLE `_team_case`;
