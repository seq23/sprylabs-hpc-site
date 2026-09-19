import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const POLICY_PATH = 'data/report_fixes/bhpc_seo_execution_policy.json';
function clean(value=''){return String(value??'').replace(/\s+/g,' ').trim()}
function parseArray(value){
  if(Array.isArray(value)) return value;
  if(value===null||value===undefined||value==='') return [];
  if(typeof value==='string'){
    try{const parsed=JSON.parse(value);return Array.isArray(parsed)?parsed:[];}catch{return [value].filter(Boolean)}
  }
  return [];
}
function hash(value){return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}
export function loadBhpcSeoPolicy(){return JSON.parse(fs.readFileSync(path.join(ROOT,POLICY_PATH),'utf8'))}
function schemaAction(value=''){
  const text=clean(value).toLowerCase();
  if(!text) return 'none';
  if(['none','validate_existing','repair_existing','add_supported_type'].includes(text)) return text;
  if(/add|product|offer|faq|howto|article|schema/.test(text)) return 'add_supported_type';
  if(/repair|fix/.test(text)) return 'repair_existing';
  if(/validate|check/.test(text)) return 'validate_existing';
  return 'none';
}
export function normalizeBhpcSeoExecution(value, fallback={}){
  if(!value||typeof value!=='object'||Array.isArray(value)) return {status:'NOT_PROVIDED',seo_execution:null,errors:[],warnings:[]};
  const policy=loadBhpcSeoPolicy();
  const errors=[];
  const warnings=[];
  const pageDecision=clean(value.page_decision||fallback.page_decision||'repair_existing').toLowerCase();
  const rawPageType=clean(value.recommended_page_type||fallback.recommended_page_type||'framework_guide').toLowerCase();
  const pageType=policy.page_type_aliases?.[rawPageType]||rawPageType;
  if(!policy.allowed_page_decisions.includes(pageDecision)) errors.push(`unsupported_page_decision:${pageDecision}`);
  // The page-type allow-list governs what this repository can BUILD: on
  // build_new and consolidate the type selects the route family and the
  // template (scripts/lib/bhpc_page_family_router.mjs), so a type nobody can
  // render is a row nobody can execute and stays INVALID. On repair_existing
  // and no_action the page already exists with its own type and the router
  // returns intended_winner_repair before it ever reads the type; the
  // recommendation is executed from exact_edit, not from the label. The
  // Saturday artifact labelled the download page "disclosure_block" on
  // 2026-09-19 and every plumbing validator refused the whole run over a word
  // that governed nothing. The label is kept verbatim, marked unrecognized,
  // and reported - never silently accepted, never a reason to refuse an edit
  // to a page the site already serves.
  const pageTypeRecognized=policy.allowed_page_types.includes(rawPageType)||policy.allowed_page_types.includes(pageType);
  const pageTypeGovernsExecution=['build_new','consolidate'].includes(pageDecision);
  if(!pageTypeRecognized){
    if(pageTypeGovernsExecution) errors.push(`unsupported_page_type:${rawPageType}`);
    else warnings.push(`unrecognized_page_type_advisory_on_${pageDecision}:${rawPageType}`);
  }
  const normalized={
    search_intent:clean(value.search_intent||fallback.search_intent).toLowerCase(),
    buyer_stage:clean(value.buyer_stage||fallback.buyer_stage).toLowerCase(),
    page_decision:pageDecision,
    recommended_page_type:rawPageType,
    canonical_page_type:pageType,
    target_url:clean(value.target_url||fallback.target_url),
    target_filepath:clean(value.target_filepath||fallback.target_filepath),
    on_page_failures:parseArray(value.on_page_failures??value.on_page_failures_json).map(clean).filter(Boolean),
    competitor_url:clean(value.competitor_url),
    competitor_format_gap:clean(value.competitor_format_gap),
    internal_link_actions:parseArray(value.internal_link_actions??value.internal_link_actions_json).filter(item=>item&&typeof item==='object').map(item=>({
      from_url:clean(item.from_url),to_url:clean(item.to_url),anchor_text:clean(item.anchor_text)
    })),
    schema_action:schemaAction(value.schema_action),
    schema_action_raw:clean(value.schema_action),
    exact_edit:clean(value.exact_edit||fallback.exact_edit),
    acceptance_checks:parseArray(value.acceptance_checks??value.acceptance_checks_json).map(clean).filter(Boolean),
    status:clean(value.status||fallback.status||'pending').toLowerCase()
  };
  normalized.hash=hash(normalized);
  // Recorded after the hash on purpose: the hash is the identity of what the
  // artifact asked for, and it is pinned in every normalized run already on
  // disk. Whether this repository recognizes the label is a fact about the
  // repository, not about the request.
  normalized.page_type_recognized=pageTypeRecognized;
  return {status:errors.length?'INVALID':'VALID',seo_execution:normalized,errors,warnings};
}
export function isNoActionSeo(seo){return seo?.page_decision==='no_action'}
