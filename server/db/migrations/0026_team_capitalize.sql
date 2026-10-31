-- 担当名（英語）の1文字目を大文字にする（eco → Eco）。明細の行（①⑦）・予算明細・割り当てた人・予算の変更・予算前執行・取り込んだ参考・執行依頼の担当名もそろえる
UPDATE `budget_teams` SET `team` = upper(substr(`team`, 1, 1)) || substr(`team`, 2) WHERE `team` GLOB '[a-z]*';
--> statement-breakpoint
UPDATE `main_budget_items` SET `team` = upper(substr(`team`, 1, 1)) || substr(`team`, 2) WHERE `team` GLOB '[a-z]*';
--> statement-breakpoint
UPDATE `revised_budget_items` SET `team` = upper(substr(`team`, 1, 1)) || substr(`team`, 2) WHERE `team` GLOB '[a-z]*';
--> statement-breakpoint
UPDATE `budget_lines` SET `team` = upper(substr(`team`, 1, 1)) || substr(`team`, 2) WHERE `team` GLOB '[a-z]*';
--> statement-breakpoint
UPDATE `users` SET `budget_team` = upper(substr(`budget_team`, 1, 1)) || substr(`budget_team`, 2) WHERE `budget_team` GLOB '[a-z]*';
--> statement-breakpoint
UPDATE `budget_change_requests` SET `team` = upper(substr(`team`, 1, 1)) || substr(`team`, 2) WHERE `team` GLOB '[a-z]*';
--> statement-breakpoint
UPDATE `pre_execution_requests` SET `team` = upper(substr(`team`, 1, 1)) || substr(`team`, 2) WHERE `team` GLOB '[a-z]*';
--> statement-breakpoint
UPDATE `budget_references` SET `team` = upper(substr(`team`, 1, 1)) || substr(`team`, 2) WHERE `team` GLOB '[a-z]*';
--> statement-breakpoint
UPDATE `entries` SET `in_charge` = upper(substr(`in_charge`, 1, 1)) || substr(`in_charge`, 2) WHERE `in_charge` GLOB '[a-z]*';
