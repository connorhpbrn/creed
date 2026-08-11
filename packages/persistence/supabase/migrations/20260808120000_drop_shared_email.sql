-- Drop the unused Shared contact email column. Application code no longer
-- reads or writes shared_email; identity lives on the Creed name + avatar.
alter table public.creeds
  drop column if exists shared_email;
