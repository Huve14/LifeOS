-- Automation trigger helpers execute only through their owning table triggers.
-- Keeping them out of the API surface prevents direct invocation by clients.

revoke all on function public.lifeos_seed_arrival_automation() from public, anon, authenticated;
revoke all on function public.lifeos_touch_automation_row() from public, anon, authenticated;

grant execute on function public.lifeos_seed_arrival_automation() to service_role;
grant execute on function public.lifeos_touch_automation_row() to service_role;
