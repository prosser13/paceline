-- Fold the cycling rides into the Dragon 50 plan as cross-training rather than
-- keeping them in a separate plan. The rides stay tagged activity_type='cycling'
-- (so they render as rides, not runs) but now live inside Dragon 50's weeks and
-- show alongside its running/strength sessions.

-- Re-home each ride onto the Dragon 50 week whose date range contains it.
UPDATE plan_sessions s
SET plan_id     = d.id,
    week_number = w.week_number
FROM plans d
JOIN plan_weeks w ON w.plan_id = d.id
WHERE d.slug = 'dragon-50'
  AND s.activity_type = 'cycling'
  AND s.plan_id = (SELECT id FROM plans WHERE slug = 'cycling')
  AND s.scheduled_date BETWEEN w.date_from AND w.date_to;

-- Drop the now-empty standalone cycling plan.
DELETE FROM plan_weeks WHERE plan_id = (SELECT id FROM plans WHERE slug = 'cycling');
DELETE FROM plans WHERE slug = 'cycling';
