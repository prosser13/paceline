-- Multi-plan fix: plan_weeks.week_number was the global primary key (a leftover
-- from the single-plan era), so two plans could not both number their weeks
-- 1..N. Make the PK composite on (plan_id, week_number) — the rest of the app
-- already scopes week queries by plan_id and shows week_number plan-relative.

ALTER TABLE plan_weeks DROP CONSTRAINT plan_weeks_pkey;
ALTER TABLE plan_weeks ADD CONSTRAINT plan_weeks_pkey PRIMARY KEY (plan_id, week_number);
