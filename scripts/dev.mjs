import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {spawnSync} from 'node:child_process';
if(spawnSync(process.execPath,['scripts/build.mjs'],{stdio:'inherit'}).status!==0)process.exit(1);
const root=resolve('dist'),port=Number(process.env.PORT||8000);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('PORT must be an integer from 1024 to 65535');
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript','.mjs':'application/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.mid':'audio/midi','.webp':'image/webp','.md':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8','.gz':'application/gzip'};
const server=createServer(async(req,res)=>{
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return;}
 try{const url=new URL(req.url,'http://localhost'),pathname=decodeURIComponent(url.pathname);if(pathname.includes('\\')||pathname.includes('\0'))throw Error('path');const file=resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));if(!file.startsWith(root+sep))throw Error('path');const info=await stat(file);if(!info.isFile())throw Error('missing');const body=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Content-Length':body.length,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:body);}
 catch{res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Baroque atlas: http://127.0.0.1:${port} (Ctrl+C to stop)`));
process.on('SIGINT',()=>server.close(()=>process.exit(0)));
