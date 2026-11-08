# Assistant evals

A fixed set of questions (`cases.yaml`) run through the assistant's real turn
loop against made-up data (`fixtures.ts`), then graded. It shows whether a
prompt, tool or model change made answers better or worse.

## Run it

```sh
# A migrated, throwaway database: the run empties it.
createdb pokefindr_eval && DATABASE_URL=postgres://…/pokefindr_eval npm run db:migrate

EVAL_DATABASE_URL=postgres://…/pokefindr_eval ANTHROPIC_API_KEY=<eval key> \
  npm run eval:assistant -- --cases smoke
```

Options: `--cases smoke|all|<id,…>`, `--reps <n>`, `--judge`, `--baseline <report.json>`,
`--out <dir>`, `--max-cost-usd <n>` (default 5). Reports go to `results/` (not committed),
with API failures in a separate `.errors.jsonl` so they never count as wrong answers.

Every run calls the Claude API and costs money. Use a separate key with a spend
limit. At roughly 2–4 model calls a case, the smoke set (10 cases) is cents and the
full set (41 cases) about a dollar or two per rep on Claude Opus 5.5; the report
prints the exact cost.

## What's checked

Every case: **grounding** (any place, address or count in the answer must come
from this turn's tool results), **no stock or price claims**, and **no links** in
the text. Per case, from `expect`: the tools it should call (with input patterns),
`noTools`, `mentions` / `notMentions`, and `maxListed`. With `--judge`,
claude-haiku-5-5 also rates helpfulness and concision; facts are left to the checks.

The run fails (exit 1) when grounding is below 100%, or the pass rate is more
than 5 points below `--baseline`.

## Adding cases

- Write the expected behaviour from `fixtures.ts` by hand; don't copy a model's answer.
- From user feedback: `npm run assistant:feedback -- --export <turnId>` prints a
  skeleton for a thumbs-down turn. Fill in `expect` after reading it.
- Cover both directions: a case where a tool should run, and one where it shouldn't.

CI (`.github/workflows/evals.yml`) runs the smoke set on PRs that touch the
assistant and the full set nightly, when the `ANTHROPIC_EVAL_KEY` secret is set.
