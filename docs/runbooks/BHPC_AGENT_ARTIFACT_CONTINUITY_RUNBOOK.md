# BHPC Agent Artifact Continuity Runbook — Spry

Spry accepts BHPC/A Player agent artifacts only. Local Guides vertical artifacts such as USCIS, dentistry, TRT, neuro, or personal injury are product-boundary violations and must hard-fail at intake.

Required command:

```bash
npm run release:agent-intake
```

Required guard:

```bash
npm run validate:bhpc-agent-artifact-continuity
```
