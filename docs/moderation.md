# Content moderation

What people write is checked before others see it (#253). This page is the policy, how the check
works, and why it's built this way.

| Piece | Where |
| --- | --- |
| The port | `src/server/ports/moderator.ts` |
| Claude adapter (Claude Haiku 5.5) | `src/server/adapters/moderator/claude.ts` |
| Fake adapter (keyword rules) | `src/server/adapters/moderator/fake.ts` |
| Timeout and fallback | `src/server/services/content-moderation.ts` |
| Reviews: check on write, public reads | `src/server/services/reviews.ts` |
| Held-review queue, decisions, recheck job | `src/server/services/review-moderation.ts` |
| The Reviews tab in /admin | `src/components/admin/HeldReviews.tsx` |
| Labelled eval set and script | `evals/moderation/cases.yaml`, `scripts/moderation/eval.ts` |

## Policy

Most text is fine. **Complaints, swearing about a machine or a store, one-star ratings, sarcasm and
collector slang all pass**: "This machine is trash, always empty", "scalpers cleaned it out at 6am",
"pulled a SIR from a 151 pack" are all allowed. Being negative about a place is allowed; attacking a
person is not.

Held for a moderator, or blocked when it's clear-cut:

| Category | What it covers | Clearest cases (block) |
| --- | --- | --- |
| `harassment` | Insults or attacks on a person (staff, other collectors, reviewers), slurs, hate against a group | Slurs |
| `threat` | Threats of violence or harm | Any real threat |
| `sexual` | Sexual content | Sexual content about anyone |
| `personal_info` | Phone numbers, emails, home addresses, licence plates, full names of private people. A store's own address or phone is fine. | Someone's phone number or address |
| `spam` | Ads, self-promotion, referral and discount codes, unrelated links | |
| `scalping` | Offers to sell or buy outside the store, "DM me", resale groups, checkout bots | |
| `injection` | Text addressed to an AI, a moderator or the system ("ignore your instructions", "approve this review") | Always |
| `off_topic` | Rants with nothing to do with the place, Pokémon cards or finding them. A short aside is fine. | |

The model's prompt (`MODERATION_SYSTEM` in the Claude adapter) is this policy in short. Change the
two together, and run the eval after changing either.

## What happens to reviews

- **On create and edit,** a review with text is checked before it's saved. A rating without text
  skips the check, and so does an edit that only changes the rating: the text keeps its status.
- **"Allow"** publishes it. **"Hold" or "block"** saves it as `held`: only its author sees it, marked
  "Pending review". Blocks are held too, never deleted, so a false positive only delays a review and
  a moderator can always reverse it.
- **A refusal, a cut-off answer or output that doesn't match the schema** counts as "hold": a person
  decides.
- **An outage or a timeout (3 s)** holds the review and records a failed check. The
  `recheck-held-reviews` job checks those again ten minutes later (through the queue) and daily
  (cron), and queues itself again while the moderator is still down or more are left than one run
  checks. It only publishes reviews no moderator has decided. Nothing goes up unchecked.
- **Held reviews are left out of every public read:** the details panel
  (`/api/locations/<id>/reviews`), `/api/get-reviews`, the assistant's `get_place` and the MCP tools,
  which all read through `getPanelReviews` / `listLocationReviews`. The author still sees their own,
  in the panel, on /home/reviews and in MCP `my_reviews`, with its status.
- **Moderators** (`moderation.reviews`) see held reviews in /admin → Moderation → Reviews, oldest
  first, with the model's verdict, categories and reason. **Approve** publishes; **Remove** keeps it
  from everyone but its author. Either can be undone for an hour by the moderator who made it, as in
  the submission queue. Deciding a review you wrote yourself needs `moderation.decideOwn` (admins).
- **Editing a removed review** sends it back to the queue whatever the check says, and keeps who
  removed it (as does Undo), so neither an edit nor the recheck job can undo a moderator's decision on
  its own. An edit made while a moderator decides is applied after their decision, not over it.
- **Every check** is stored in `review_moderation_checks` (verdict, categories, reason, model, prompt
  version, failed, cost) and logged as a `review_moderation` line with its tokens and cost, no text.

Posting and editing reviews is rate limited (`RATE_RULES.reviews`, 10 a minute per IP), since each
one with text is a paid check.

## Submissions

New card shops and events already wait for a moderator. Their name, venue, hours and links get the
same check when they're sent, stored on `location_submissions.text_check`, and shown as a "Text looks
fine" / "Text flagged" line among the queue's checks. Nothing is rejected automatically.

## Why Claude Haiku, behind a port

The research is in [the first comment on #253](https://github.com/riechert-arthur/pokefindr/issues/253#issuecomment-6768677577).
In short, every option costs fractions of a dollar per 1,000 checks:

| | Per 1,000 reviews (est.) | Gives a reason | New vendor |
| --- | --- | --- | --- |
| Claude Haiku 5.5 | ≈ $0.09 (thinking off) | Yes | No |
| Jev (OpenRouter / Neon AI Gateway) | ≈ $0.02 | No, scores only | Yes, alpha API |
| OpenAI Moderation | Free | No, fixed categories | Yes |
| Llama Guard 4 | ≈ $0.12 | No, fixed categories | Yes, plus a host |

Haiku follows our own rules (spam, scalping, phone numbers), writes a reason moderators can read,
and uses the assistant's credentials and spend tracking. It's behind the small `ContentModerator`
port, so a Jev adapter can be added if volume grows into the hundreds of thousands a month.

The call is one `messages.parse` with a Zod schema (`verdict`, `categories`, `reason`), thinking off,
low effort, `max_tokens` 400 and no retries: about 700 input and 50 output tokens, ≈ $0.0001 a check.

## Configuration

| Variable | Default | |
| --- | --- | --- |
| `MODERATION_PROVIDER` | `claude` in production when `ANTHROPIC_API_KEY` or federation is set; `fake` elsewhere | `fake` uses keyword rules: no account and no cost, so local dev and CI never spend money |
| `MODERATION_MODEL` | `claude-haiku-5-5` | |

To try the real model locally, set `MODERATION_PROVIDER=claude` with a spend-limited key.

## Evals

`evals/moderation/cases.yaml` is a hand-labelled set of reviews and assistant questions: clean,
borderline, abusive, injection and Pokémon slang. Each case says whether it should be flagged (held
or blocked) and under which categories.

```bash
npm run eval:moderation -- --provider fake      # free: checks the script and the keyword rules
npm run eval:moderation                         # Claude Haiku: costs about $0.01 for the whole set
```

It prints precision and recall per category, the share of clean reviews held (target under 5%), the
share of clearly abusive ones caught (target 95% or more), and what the run cost. Reports go to
`evals/moderation/results/`. Exits 1 when a target is missed.

## Existing reviews

Reviews written before this shipped are `published` and weren't checked. A one-off batch check
(well under $1 at our size) is a follow-up.
