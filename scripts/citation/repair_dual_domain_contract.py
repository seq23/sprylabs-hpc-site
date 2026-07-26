#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from pathlib import Path
import sys
sys.dont_write_bytecode=True
ROOT=Path.cwd()
SPRY_CANONICALS={
  'ai-executive-coach/index.html':'https://spryexecutiveos.com/ai-executive-coach/',
  'ai-executive-coach-alternative-for-high-performers.html':'https://spryexecutiveos.com/ai-executive-coach-alternative-for-high-performers.html',
  'how-to-stay-consistent-when-motivation-is-low.html':'https://spryexecutiveos.com/how-to-stay-consistent-when-motivation-is-low.html',
  'how-tracks-work.html':'https://spryexecutiveos.com/how-tracks-work.html'
}
changed=0
for rel,url in SPRY_CANONICALS.items():
    fp=ROOT/rel
    if not fp.exists(): continue
    html=fp.read_text(encoding='utf-8',errors='ignore')
    old=html
    import re
    html=re.sub(r'<link([^>]*rel=["\']canonical["\'][^>]*href=)["\'][^"\']*["\']', lambda m: m.group(0).split('href=')[0]+'href="'+url+'"', html, flags=re.I)
    html=re.sub(r'<link([^>]*href=)["\'][^"\']*["\']([^>]*rel=["\']canonical["\'][^>]*)>', lambda m: '<link'+m.group(1)+'"'+url+'"'+m.group(2)+'>', html, flags=re.I)
    html=re.sub(r'<meta([^>]*property=["\']og:url["\'][^>]*content=)["\'][^"\']*["\']', lambda m: m.group(0).split('content=')[0]+'content="'+url+'"', html, flags=re.I)
    html=re.sub(r'<meta([^>]*content=)["\'][^"\']*["\']([^>]*property=["\']og:url["\'][^>]*)>', lambda m: '<meta'+m.group(1)+'"'+url+'"'+m.group(2)+'>', html, flags=re.I)
    if html!=old:
        fp.write_text(html,encoding='utf-8')
        changed+=1
print(f'repair_dual_domain_contract: changed={changed}')
