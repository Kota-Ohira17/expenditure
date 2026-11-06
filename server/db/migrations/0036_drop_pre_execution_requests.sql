UPDATE `entries` SET `details` = json_set(`details`, '$.preExecutionItemId', (SELECT p.`item_id` FROM `pre_execution_requests` p WHERE p.`entry_id` = `entries`.`id` AND p.`status` = 'approved'))
WHERE json_extract(`details`, '$.preExecution') = 1 AND EXISTS (SELECT 1 FROM `pre_execution_requests` p WHERE p.`entry_id` = `entries`.`id` AND p.`status` = 'approved' AND p.`item_id` <> '');
--> statement-breakpoint
UPDATE `entries` SET `details` = json_set(`details`, '$.preExecutionSettled', json('true'))
WHERE json_extract(`details`, '$.preExecution') = 1 AND NOT EXISTS (SELECT 1 FROM `pre_execution_requests` p WHERE p.`entry_id` = `entries`.`id` AND p.`status` = 'approved');
--> statement-breakpoint
DROP TABLE `pre_execution_requests`;
