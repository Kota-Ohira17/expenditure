-- 屋外設置物担当の英語名は sign（日本語名は残す）。その担当がなければ何も変わらない
UPDATE `budget_teams` SET `name_ja` = '屋外設置物担当' WHERE `team` = '屋外設置物担当' AND `name_ja` IN ('', '屋外設置物担当');
--> statement-breakpoint
UPDATE `budget_teams` SET `team` = 'sign' WHERE `team` = '屋外設置物担当';
--> statement-breakpoint
UPDATE `main_budget_items` SET `team` = 'sign' WHERE `team` = '屋外設置物担当';
--> statement-breakpoint
UPDATE `revised_budget_items` SET `team` = 'sign' WHERE `team` = '屋外設置物担当';
--> statement-breakpoint
UPDATE `budget_lines` SET `team` = 'sign' WHERE `team` = '屋外設置物担当';
--> statement-breakpoint
UPDATE `users` SET `budget_team` = 'sign' WHERE `budget_team` = '屋外設置物担当';
--> statement-breakpoint
UPDATE `budget_change_requests` SET `team` = 'sign' WHERE `team` = '屋外設置物担当';
--> statement-breakpoint
UPDATE `pre_execution_requests` SET `team` = 'sign' WHERE `team` = '屋外設置物担当';
