INSERT INTO `entries` (`seq`, `kind`, `type`, `status`, `created_at`, `applicant_email`, `applicant_name`, `department`, `in_charge`, `item_number`, `item_name`, `amount`, `deadline`, `remark`, `details`, `payment_method`, `executed_at`, `executed_by`)
SELECT `seq`, 'income', '収入', `status`, `created_at`, `applicant_email`, `applicant_name`, `department`, `in_charge`, `item_number`, `item_name`, `amount`, `received_on`, `remark`, json_set(`details`, '$.payer', `payer`, '$.account', `account`), `method`, `confirmed_at`, `confirmed_by`
FROM `income_records` ORDER BY `id`;
--> statement-breakpoint
INSERT INTO `entry_items` (`entry_id`, `line_key`, `item_number`, `item_id`, `label`, `budget_amount`, `actual_amount`)
SELECT e.`id`, r.`line_key`, r.`item_number`, r.`item_id`, r.`item_name`, COALESCE(r.`budget_amount`, 0), r.`amount`
FROM `income_records` r JOIN `entries` e ON e.`seq` = r.`seq`
WHERE r.`line_key` IS NOT NULL;
--> statement-breakpoint
INSERT INTO `evidence_files` (`entry_id`, `attachment_id`, `kind`, `uploaded_by`, `created_at`)
SELECT e.`id`, f.`attachment_id`, f.`kind`, f.`uploaded_by`, f.`created_at`
FROM `income_files` f JOIN `income_records` r ON r.`id` = f.`income_id` JOIN `entries` e ON e.`seq` = r.`seq`;
--> statement-breakpoint
DROP TABLE `income_files`;
--> statement-breakpoint
DROP TABLE `income_records`;
