import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd(); const port=Number(process.env.PORT||4173);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.xml':'application/xml; charset=utf-8','.txt':'text/plain; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.webp':'image/webp','.pdf':'application/pdf','.ico':'image/x-icon'};
const server=http.createServer((req,res)=>{
  const raw=decodeURIComponent((req.url||'/').split('?')[0]);
  let rel=raw.replace(/^\/+/, '');
  if(!rel) rel='index.html';
  let file=path.join(root,rel);
  if(raw.endsWith('/')) file=path.join(root,rel,'index.html');
  if(!path.extname(file) && !fs.existsSync(file)) file += '.html';
  const normalized=path.normalize(file);
  if(!normalized.startsWith(path.normalize(root))){res.writeHead(403);return res.end('Forbidden');}
  fs.stat(normalized,(err,st)=>{
    if(err||!st.isFile()){res.writeHead(404,{'content-type':'text/plain'});return res.end('Not found');}
    res.writeHead(200,{'content-type':types[path.extname(normalized).toLowerCase()]||'application/octet-stream','cache-control':'no-store'});
    fs.createReadStream(normalized).pipe(res);
  });
});
server.listen(port,'127.0.0.1',()=>console.log(`[static-server] http://127.0.0.1:${port}`));
