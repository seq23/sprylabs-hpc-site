# Automation Map

## Validate Workflow

Path:

.github/workflows/validate.yml

Runs on:

- push to main
- pull request

Runs:

npm ci
npm run validate:all

## Execution Strict Workflow

Path:

.github/workflows/execution-strict.yml

Runs on:

- schedule
- workflow_dispatch

Runs:

npm ci
npm run execution:strict

## Reddit Daily / Reddit Evening

Purpose:

- collect Reddit signals
- normalize signals
- cluster questions
- score clusters
- publish or queue where allowed

## Required Concurrency

All committing workflows should use:

concurrency:
  group: main-automation
  cancel-in-progress: false

## Automation Ownership

Execution Strict owns:

- data/answer_surface/
- data/answer_surface_monitoring/
- data/backlog/
- reports/
- coverage/
- .build/

Reddit workflows own:

- data/reddit/

## Conflict Prevention

Reddit workflows should restore non-Reddit generated conflict files before committing:

git restore data/answer_surface data/answer_surface_monitoring data/backlog reports .build coverage || true
