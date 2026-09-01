-- Repair punctuation around the canonical store CTA in owner-review drafts.
-- Future drafts are protected by normalizeCaption in the generation pipeline.

update public.artifacts a
   set caption = regexp_replace(
     regexp_replace(a.caption, '([?!])\.[[:space:]]+(Deadset|Cast) on the App Store\.', '\1 \2 on the App Store.', 'i'),
     '([[:alnum:]”’\)])([[:space:]]+)(Deadset|Cast) on the App Store\.',
     '\1. \3 on the App Store.',
     'i'
   )
  from public.apps p
 where a.app_id = p.id
   and p.slug in ('deadset', 'cast')
   and a.status = 'draft'
   and a.caption is not null;
