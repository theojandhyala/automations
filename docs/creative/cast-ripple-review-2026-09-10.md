# Cast editorial direction — 10 September 2026

Owner: use r1pple8 as the reference for Cast, make fewer purely promotional posts, no AI media. The first three Latest entries were opened and every slide was visually inspected in TikTok and its displayed image URLs. They are six-image photo carousels, not moving-video edits. The source images are 3:4; Cast's exports use a 1080×1920 canvas with a conservative text safe area.

| Latest order | Reference | Visible views | Likes / comments / saves / shares | Posted label |
|---|---|---|---|---|
| 1 | https://www.tiktok.com/@r1pple8/photo/7683784451708456199 | 3,744 | 50 / 4 / 9 / 4 | 13h ago |
| 2 | https://www.tiktok.com/@r1pple8/photo/7683655444849511698 | 29.3K | 759 / 21 / 294 / 58 | 21h ago |
| 3 | https://www.tiktok.com/@r1pple8/photo/7683475654402460935 | 62.9K | 1,771 / 47 / 617 / 217 | 1d ago |

Metrics are public snapshots captured over several minutes, not simultaneous or age-normalised. No install attribution, completion or revenue data is available. These are reference hypotheses, not proven Cast winners.

## Actual visual sequence

All three open with a real-looking catch photo and a short fishing-app ranking promise in central white text with a black outline. Each then switches to a single rod-and-water photograph reused behind five items. Item slides have a coloured score badge near the top, the app name and logo centrally, and a short opinion underneath. The last slide promotes Ripple using a denser feature list. No camera cuts or spoken performance are present in the images. TikTok lists creator-uploaded sounds; music rights and the absence of AI in source assets cannot be verified from appearance alone.

The newest opens with a bass by a pond, then uses a rocky waterfront photo. The middle opens with a trout in a landing net, then a rod aimed across a lake. The third opens with a bass by water, then uses a rod over a sunset lake. Item selection and copy vary slightly, but the basic ranking structure repeats. The second carousel uses Fishing Points where the other two use Fishbrain. Each includes an adult-site joke as the lowest entry and rates its own product highest. Competitor criticisms and first-person testing claims are unverified; they are not inherited by Cast.

## Cast implementation

- Six slides: hook, then five concise items. Real independently licensed fishing photography, consistent background within a post, outlined readable text and small CAST identifier.
- Four useful posts per occasional Cast story across generated batches. No store suffix or download command on editorial posts.
- Curated original topics and copy; the Cast generation handler bypasses Workers AI entirely. No image generation, voice synthesis or rebuilt app UI.
- Subjective editorial countdowns compare note-taking or preparation choices, not untested competitor apps. No copied source photography, logos, jokes or claims of personal testing.
- First batch: catch notes ranked by specificity; checks before buying another lure; location privacy in catch photos.
- Finite ten-topic bank. Exhaustion returns a clear stop reason; it does not recycle old hooks or silently ask an AI model for filler.
- Drafts require review of all six final images and photo suitability before first release. Existing owner review receipt binds the exact media and caption. No posting consent is inferred from the reference request.
- Future comparison posts need documented app testing and verified current product claims. Start with useful fishing content instead.

## Background sources

The equipment-check post uses general preparation advice, not species-specific promises or a prescribed fishing technique. Source references: https://www.takemefishing.org/how-to-fish/fishing-gear-and-tackle/ and https://www.takemefishing.org/how-to-fish/how-tie-fishing-knots/best-fishing-knots/ . Cast product descriptions come from the repository's verified feature playbook. Location and note-taking sequences are editorial checklists. Photograph provenance is attached per produced artifact, with the Pexels source, photographer and licence URL.

## Review and measurement

Inspect each export on a phone-size preview. Check header and body readability, subject crop, absence of covered content and consistency between headline and final item. Record saves and shares per view alongside comments and any available attributable installs. Compare equivalent observation windows. Test one variable per follow-up (hook or first photo); do not call a concept a winner from raw views alone.

## Production verification

Deployed to the JARVIS `automations` Worker, version `84093a46-be2a-4c6f-9833-4d8d1744d1cd`. The Cast mission created at 20:55:55 UK time reports **3/3 rendered, ready for your review**. All eighteen final 1080×1920 JPEGs were visually inspected, including the revised teal number badges. Text remained readable and inside the configured safe area. No post was published in this task.

| Draft | Artifact ID | Final output nonce |
|---|---|---|
| Fishing notes, ranked from vague to useful | 5d682cf3-82a1-4624-a33c-eb065552fc12 | 8696aab9-8ef2-4501-bfa8-c52428817b6b |
| 5 things to check before buying another lure | 1b1038f4-d97a-412a-bdac-e7313602c062 | 05ae2f59-552d-453c-8007-f7dec009edc9 |
| 5 ways a catch photo gives away your spot | 87d89d43-22a3-451b-907b-ac633158b692 | 8b2b069d-16bb-47e3-b314-ac22d5d88f91 |

Outputs follow `/media/outputs/{artifact}/editorial-{1..6}-{nonce}.jpg`. Validation passed: worker typecheck, 131 Vitest tests, 13 Node tests and the production web build. An unauthenticated private artifacts request returned 401. Explicit owner missions now render even when the routine ready buffer is full; the new editorial drafts remain behind exact review.
