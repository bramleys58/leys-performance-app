-- Keep weights exactly as entered. Two decimals in kg lost a little on every lbs entry
-- (100.1 lbs came back as 100.09), so weights are stored with four decimals now.
-- Widening a numeric column keeps every existing value. Safe to run more than once.
alter table public.set_logs alter column weight type numeric(9, 4);
alter table public.set_logs alter column planned_weight type numeric(9, 4);
alter table public.maxes alter column value type numeric(9, 4);
alter table public.bodyweights alter column kg type numeric(8, 4);
alter table public.check_ins alter column bodyweight type numeric(8, 4);
alter table public.session_exercises alter column target_value type numeric(9, 4);

notify pgrst, 'reload schema';
