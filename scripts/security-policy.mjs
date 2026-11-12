/** Exact CSP hashes for the reviewed static artifact and its fixed runtime score style. */
import {createHash} from 'node:crypto';
export const inlineHash=source=>'sha256-'+createHash('sha256').update(source,'utf8').digest('base64');
export function inlineBlocks(html){
 const scripts=[];
 for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)){
  const attributes=match[1];
  if(/\bsrc\s*=/.test(attributes))continue;
  const type=attributes.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase()||'';
  if(['','module','text/javascript','application/javascript'].includes(type))scripts.push(match[2]);
  else if(type!=='application/json')throw Error('Unreviewed inline script type: '+type);
 }
 const withoutScripts=html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,'');
 return {scripts,styles:[...withoutScripts.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)].map(m=>m[1])};
}
export function staticContentPolicy(html,runtimeStyles=[]){
 const blocks=inlineBlocks(html);
 if(blocks.scripts.length!==1||blocks.styles.length!==1)throw Error('Unexpected inline executable/style count in the self-contained app');
 const quote=s=>`'${inlineHash(s)}'`;
 const scriptSources=[...new Set(blocks.scripts.map(quote))];
 const styleSources=[...new Set([...blocks.styles,...runtimeStyles].map(quote))];
 return ["default-src 'self'",`script-src 'self' ${scriptSources.join(' ')}`,"script-src-attr 'none'",`style-src 'self' ${styleSources.join(' ')}`,"style-src-attr 'none'","img-src 'self' data:","font-src 'self'","connect-src 'self'","media-src 'self' blob:","object-src 'none'","base-uri 'none'","frame-ancestors 'none'","form-action 'none'"].join('; ');
}
