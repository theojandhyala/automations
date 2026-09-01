-- Polish existing owner-review drafts to the same natural App Store CTA now
-- enforced by the creative brain. Published history is intentionally untouched.

update public.artifacts a
   set caption = regexp_replace(
     regexp_replace(
       regexp_replace(trim(a.caption), 'deadset[[:space:]]+on[[:space:]]+appstore[.!?]*$', 'Deadset on the App Store.', 'i'),
       '^[[:space:]''"“”‘’]+',
       ''
     ),
     '[[:space:]]+$',
     ''
   )
  from public.apps p
 where a.app_id = p.id
   and p.slug = 'deadset'
   and a.status = 'draft'
   and a.caption is not null;

update public.artifacts a
   set caption = regexp_replace(
     regexp_replace(
       regexp_replace(trim(a.caption), 'cast[[:space:]]+on[[:space:]]+appstore[.!?]*$', 'Cast on the App Store.', 'i'),
       '^[[:space:]''"“”‘’]+',
       ''
     ),
     '[[:space:]]+$',
     ''
   )
  from public.apps p
 where a.app_id = p.id
   and p.slug = 'cast'
   and a.status = 'draft'
   and a.caption is not null;
