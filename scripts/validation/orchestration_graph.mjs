import fs from 'node:fs';

export function readJsonFile(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function npmTargets(body='') {
  const out=[];
  const re=/(?:^|&&|;|\|\|)\s*npm\s+run\s+([A-Za-z0-9:_-]+)/g;
  let m;
  while ((m=re.exec(body))) out.push(m[1]);
  return out;
}

function profileTarget(body='') {
  const m=body.match(/npm\s+run\s+validate:profile\s+--\s+([A-Za-z0-9:_-]+)/);
  return m?.[1] || null;
}

export function buildExecutionGraph({pkg,matrix}) {
  const scripts=pkg.scripts || {};
  const profiles=matrix.profiles || {};
  const nodes=new Map();
  const edges=[];
  const errors=[];

  for (const [name,body] of Object.entries(scripts)) nodes.set(`script:${name}`,{type:'script',name,body});
  for (const [name,profile] of Object.entries(profiles)) nodes.set(`profile:${name}`,{type:'profile',name,profile});

  for (const [name,body] of Object.entries(scripts)) {
    const from=`script:${name}`;
    const p=profileTarget(body);
    if (p) {
      const to=`profile:${p}`;
      edges.push({from,to,kind:'profile-alias'});
      if (!nodes.has(to)) errors.push(`script ${name}: unknown profile ${p}`);
    }
    for (const target of npmTargets(body)) {
      if (target==='validate:profile') continue;
      const to=`script:${target}`;
      edges.push({from,to,kind:'npm-run'});
      if (!nodes.has(to)) errors.push(`script ${name}: unknown npm target ${target}`);
    }
  }

  for (const [name,profile] of Object.entries(profiles)) {
    const from=`profile:${name}`;
    for (const base of profile.extends || []) {
      const to=`profile:${base}`;
      edges.push({from,to,kind:'profile-extends'});
      if (!nodes.has(to)) errors.push(`profile ${name}: unknown base profile ${base}`);
    }
    for (const step of profile.steps || []) {
      const targets=npmTargets(step.command || '');
      if (!targets.length && /^npm\s+run\s+/.test(step.command || '')) errors.push(`profile ${name}: unresolvable npm step ${step.command}`);
      for (const target of targets) {
        const to=`script:${target}`;
        edges.push({from,to,kind:'profile-step',step_id:step.id || null});
        if (!nodes.has(to)) errors.push(`profile ${name}: unknown step target ${target}`);
      }
    }
  }

  const adjacency=new Map([...nodes.keys()].map(k=>[k,[]]));
  for (const edge of edges) if (adjacency.has(edge.from)) adjacency.get(edge.from).push(edge.to);

  const cycles=[];
  const state=new Map();
  const stack=[];
  function visit(node) {
    const s=state.get(node)||0;
    if (s===1) {
      const i=stack.indexOf(node);
      cycles.push([...stack.slice(i),node]);
      return;
    }
    if (s===2) return;
    state.set(node,1); stack.push(node);
    for (const next of adjacency.get(node)||[]) visit(next);
    stack.pop(); state.set(node,2);
  }
  for (const node of nodes.keys()) visit(node);

  function reachable(start) {
    const root=start.startsWith('script:')||start.startsWith('profile:')?start:`script:${start}`;
    const seen=new Set(); const q=[root];
    while(q.length){const n=q.shift(); if(seen.has(n)||!nodes.has(n)) continue; seen.add(n); for(const x of adjacency.get(n)||[]) q.push(x)}
    return seen;
  }

  return {nodes,edges,errors,cycles,reachable};
}

export function assertReachable(graph, startScript, targetScript) {
  return graph.reachable(`script:${startScript}`).has(`script:${targetScript}`);
}
