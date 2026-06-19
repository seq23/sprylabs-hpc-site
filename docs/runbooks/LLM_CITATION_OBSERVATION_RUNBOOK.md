# LLM Citation Observation Runbook

Structural readiness is not citation proof. Missing observations are recorded as `NOT_OBSERVED`, not as failure and not as success.

## Monthly observation

For each priority query, record:

- platform and model surface;
- exact query;
- observation date;
- answer text summary;
- whether BHPC or Spry was mentioned;
- whether a page was cited;
- cited URL;
- evidence screenshot or exported answer path.

Copy `data/answer_surface_monitoring/observations.manual.json.example` to the ignored manual observations file and add only real observations. Never seed synthetic mentions or citations.

## States

- `NOT_OBSERVED`: no real answer evidence collected.
- `MENTIONED_NOT_CITED`: domain or product mentioned without a linked source.
- `CITED`: a specific page was cited.
- `REGRESSED`: a previously observed citation disappeared in a comparable test.
