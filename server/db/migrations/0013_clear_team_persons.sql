-- 担当者の氏名を持たないようにする。集約の局・担当の担当者と、取り込んだ「支出」シートの「担当者」の列（D 列）を空にする
UPDATE `budget_teams` SET `person` = '';
--> statement-breakpoint
UPDATE `budget_sheet_rows` SET `cells` = json_set(`cells`, '$[3]', '')
WHERE `role` = 'row' AND json_array_length(`cells`) > 3
  AND (SELECT json_extract(`cells`, '$[3]') FROM `budget_sheet_rows` WHERE `role` = 'header' LIMIT 1) = '担当者';
