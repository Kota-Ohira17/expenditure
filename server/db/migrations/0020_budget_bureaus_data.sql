-- 集約ごとに、担当の局の名前から局（budget_bureaus）を作り、担当をその局に属させる。局の番号は、その局のいちばん前の担当のもの
INSERT INTO `budget_bureaus` (`round_id`, `bureau_no`, `name`, `sort_order`)
SELECT t.`round_id`,
  (SELECT t2.`bureau_no` FROM `budget_teams` t2 WHERE t2.`round_id` = t.`round_id` AND t2.`bureau` = t.`bureau` ORDER BY t2.`sort_order` LIMIT 1),
  t.`bureau`, min(t.`sort_order`)
FROM `budget_teams` t
GROUP BY t.`round_id`, t.`bureau`;
--> statement-breakpoint
UPDATE `budget_teams` SET
  `bureau_id` = (SELECT b.`id` FROM `budget_bureaus` b WHERE b.`round_id` = `budget_teams`.`round_id` AND b.`name` = `budget_teams`.`bureau`),
  `bureau_no` = (SELECT b.`bureau_no` FROM `budget_bureaus` b WHERE b.`round_id` = `budget_teams`.`round_id` AND b.`name` = `budget_teams`.`bureau`);
