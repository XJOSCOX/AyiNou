alter table public.profiles
  drop constraint profiles_preferred_locale,
  add constraint profiles_preferred_locale check (preferred_locale in ('ht', 'fr', 'en', 'es'));
