# Native carousel review calibration — 12 September 2026

The September 11 native direction remains authoritative. This is a bounded
critic calibration and one copy revision, not a new aesthetic direction or a
claim that prompting fixes the complete marketing system.

## Actual image audit

Inspected all six hosted JPEGs for Cast draft
`ba810eaa-b602-45c0-b890-624d111e4ff0`, “5 questions worth asking on the way home”,
at full size and at the browser's 329×585 phone-sized display. Saved the exact
browser-bundled images and manifest in
`.local/creative-director/2026-09-12-cast-review/`.

The recorded critic demanded visual variety and edge-aligned text. It alleged
that captions obscured the person and that TikTok controls occupied the middle.
Those are not supported by these pixels: item copy is above the angler's head,
over sky/water. The thin rod crosses the text region, but the person remains
visible. There are no baked-in platform controls. Font, width, positions and
outline are consistent. The requested repeated item background is intentional.
This finding does not apply automatically to other photos or other drafts.

Real weaknesses remain: the hook does not explicitly name fishing, several
items are abstract, and the live renderer uses the item photo for the opener
as well. The saved September 11 master uses a distinct catch cover and the
consistent rod/water item background. Prefer that reviewed master; this patch
does not change photo selection or rerender the existing live draft.

The `trip-debrief` concept now names fishing and asks for bite location/depth,
bite time, bait/lure/rig/retrieve, timed changes, and one next experiment. Its ID
is unchanged so previously used concepts do not become duplicate fresh posts.
This changes future briefs; it is not a claim that the revised six JPEGs exist.

## Runtime correction and real-model test

Direction version: `cast-deadset-2026-09-12-native-v4`.

Previous AI findings are explicitly unverified hypotheses in both generation
and criticism. A finding must be checked against actual pixels and the owner's
format. The critic sees one slide per call, so it must not invent visual details
of unseen slides. An obstruction needs an identified feature and location;
sub-threshold scores need a concrete defect and revision.

Four calibration calls used the production Gemma model through Wrangler's
isolated Workers AI binding. No database, production review signature, approval
or publication was involved. Raw results are saved beside the image audit.

| Input | Hierarchy / legibility / craft / story | Result |
| --- | --- | --- |
| Exact Cast slide 4, deliberately supplied conflicting old findings | 9 / 10 / 9 / 10 | No invented obstruction/variety failure |
| Exact Cast slide 6, same conflicting findings | 9 / 10 / 9 / 10 | No invented central platform controls |
| Local genuine Deadset REST proof with short answer | 9 / 9 / 8 / 10 | Passed this isolated image test |
| Known bad Cast campaign/mockup image with bottom caption | 9 / 8 / 5 / 10 | Rejected; craft and safe zones failed |

Important limitation: the bad image's `truthful_proof` and `duplicate_copy`
booleans were still incorrectly favourable despite its overclaim and added
caption. The overall verdict failed. Do not treat these scores as reliable
product/provenance validation, performance evidence, or permission to post.
Source checks, copy checks, independent review, exact owner holds and manual
phone review remain necessary. No threshold was reduced and no failure was
converted into an approval. The version change requires a fresh signed review.

Validation: 175 Vitest + 13 Node tests; worker typecheck and diff whitespace
check. Tests cover all four sub-8 score failures, stale version rejection,
signature/media/copy/destination binding, malformed results and every slide.
The deployed dashboard bundle is reused unchanged for this backend release.
Deployed Worker: `ff8119fe-2d7a-47d6-b376-7032bb6451f3`, replacing the verified
September 11 release. Wrangler reported no updated asset files to upload and
retained both HQ KV bindings. Direct shell HTTP checks returned 403; they are
not recorded as successful health checks. Browser queue readback remains the
available live application check.

## Exact audited media

URL prefix: `https://automations.theojandhyala.workers.dev/media/outputs/ba810eaa-b602-45c0-b890-624d111e4ff0/`.
Files: `editorial-{1..6}-5f7d368b-ddf2-4d93-aed8-d9edb71f9143.jpg`.

| Slide | SHA-256 |
| --- | --- |
| 1 | `7fa07a843a27bff226356bd1c76673f9cee3a5b44cb1316402b5f261503a75b9` |
| 2 | `cadfa6cfa89edcc0b999f5b4bcb2567723cf0a18c22870f28c4bb6c91d65e962` |
| 3 | `800a2cf32edd548c11d23b6e4a37883cabf491f68c8e74dc9f2ccccf70ef8b8f` |
| 4 | `4f445ff2775b8b28b8f5c784b00749e6820f8aec75544feb48d4307afc0a51b7` |
| 5 | `09c1adbc332ba5ebb2ee6d03ca5811023e4ca3395b86fc68ffa389e2e9dbd81a` |
| 6 | `4ba06cc67abfa5fd3002ebe17224e1256ffa1658670a78804f52ab5b86b33709` |
