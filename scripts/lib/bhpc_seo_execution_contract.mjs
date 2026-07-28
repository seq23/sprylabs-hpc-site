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
  if(!value||typeof value!=='object'||Array.isArray(value)) return {status:'NOT_PROVIDED',seo_execution:null,errors:[]};
  const policy=loadBhpcSeoPolicy();
  const errors=[];
  const pageDecision=clean(value.page_decision||fallback.page_decision||'repair_existing').toLowerCase();
  const rawPageType=clean(value.recommended_page_type||fallback.recommended_page_type||'framework_guide').toLowerCase();
  const pageType=policy.page_type_aliases?.[rawPageType]||rawPageType;
  if(!policy.allowed_page_decisions.includes(pageDecision)) errors.push(`unsupported_page_decision:${pageDecision}`);
  if(!policy.allowed_page_types.includes(rawPageType)&&!policy.allowed_page_types.includes(pageType)) errors.push(`unsupported_page_type:${rawPageType}`);
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
  return {status:errors.length?'INVALID':'VALID',seo_execution:normalized,errors};
}
export function isNoActionSeo(seo){return seo?.page_decision==='no_action'}
