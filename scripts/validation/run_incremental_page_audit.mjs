#!/usr/bin/env node
import {runPageAudit} from './page_audit_runner.mjs';

process.exit(runPageAudit({
  mode: 'incremental',
  label: 'validate:incremental-page-audit',
  evidenceFile: 'artifacts/validation/incremental-page-audit.json',
}));
