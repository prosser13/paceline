-- Multi-distance predictions (wave 7A): store the blended fitness VDOT alongside the
-- marathon prediction, so any distance (5k / 10k / HM / marathon) derives on read.
-- Old rows keep vdot null; readers derive it from predicted_seconds (VDOT round-trips
-- from the marathon time via Daniels' formula, which isn't available in SQL).
alter table public.benchmark_snapshots add column if not exists vdot numeric;
