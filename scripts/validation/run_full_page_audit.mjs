#!/usr/bin/env node
import {runPageAudit} from './page_audit_runner.mjs';

process.exit(runPageAudit({
  mode: 'full',
  label: 'validate:full-page-audit',
  evidenceFile: 'artifacts/validation/full-page-audit.json',
}));
