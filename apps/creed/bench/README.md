# Creed Bench

Creed Bench measures whether a model can use Creed's MCP tools safely and
effectively. Each trial runs against a fresh synthetic Creed. Grading checks
the resulting state, policy compliance, restraint, recovery, and final answer.
No real user profile is used.

## Commands

```bash
# See the 24 versioned tasks
npm run bench -- --list

# Development run: every task, medium effort, one trial
npm run bench -- openai/model-id

# Fast iteration on one task
npm run bench -- openai/model-id --task append-durable-preference

# Preview an official run without spending
npm run bench -- openai/model-id --official

# Official publishable run: low/medium/high, three trials each
# Requires a clean git worktree so runnerCommit matches the code.
npm run bench -- openai/model-id --official --yes

# Matching checkpoints resume automatically after a crash.
# --resume is an explicit alias; --fresh discards a checkpoint.
npm run bench -- openai/model-id --official --yes --fresh

# Batch official run
npm run bench -- openai/model-id,anthropic/model-id --official --yes

# Rebuild the public chart from retained complete results
npm run bench:generate

# Diagnostic regrade against the current grader (does not publish)
npm run bench:regrade

# Compress retained traces and enforce the local retention policy
npm run bench:prune
```

The runner reads `OPENROUTER_API_KEY` from the environment or the gitignored
`.env.local` file. Official runs are the only artifacts published to the
chart. Development runs remain `provisional`. Transient OpenRouter 429/5xx
errors retry with backoff before a trial is marked failed.

## What is retained

Every immutable result includes the exact task version, runner commit, model
route, effort, token use, cost, complete tool trace, before/after synthetic
state, verifier checks, and final answer. `npm run bench:generate` rebuilds the
public chart from local complete artifacts for the active benchmark version.
If no local results exist, the committed chart file is left alone so clones
still render.

Trace artifacts are local and gitignored. Cleanup runs after benchmark
executions: `bench/results/` retains the latest compressed complete run for each
model and benchmark version, while `bench/runs/` retains compressed provisional
or failed runs for seven days. Interrupted runs write a configuration-bound
checkpoint under `bench/runs/`; the final artifact is written before that
checkpoint is cleared. `npm run bench:prune` applies the retention policy on
demand. `npm run bench:regrade` is diagnostic only and never updates the public
chart.

The headline metric is `pass@1`. `pass^3` reports consistency across three
repeated trials. The graph plots average cost per task attempt. Diagnostic
dimensions explain failures but do not hide them behind one opaque composite.
