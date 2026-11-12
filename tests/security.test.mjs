import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inlineBlocks,inlineHash,staticContentPolicy} from '../scripts/security-policy.mjs';
import {PLAYBACK_SCORE_STYLE,renderPlaybackScore} from '../src/notation.mjs';
const html=await readFile('dist/index.html','utf8'),headers=await readFile('dist/_headers','utf8');
const policy=headers.match(/Content-Security-Policy: ([^\n]+)/)[1];
const sources=name=>new Set(policy.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+' ')).split(/\s+/).slice(1));
const allowed=(kind,content)=>sources(kind+'-src').has(`'${inlineHash(content)}'`);
test('the static artifact allows exactly its executable script and its two reviewed style sources',()=>{
 const blocks=inlineBlocks(html);assert.equal(blocks.scripts.length,1);assert.equal(blocks.styles.length,1);
 assert(allowed('script',blocks.scripts[0]));assert(allowed('style',blocks.styles[0]));assert(allowed('style',PLAYBACK_SCORE_STYLE));
 assert.equal(sources('script-src').size,2);assert.equal(sources('style-src').size,3);assert(!policy.includes('unsafe-inline'));assert(!policy.includes('unsafe-eval'));
 assert.equal(staticContentPolicy(html,[PLAYBACK_SCORE_STYLE]),policy);
});
test('unreviewed inline code or CSS does not match an allowed hash',()=>{
 const blocks=inlineBlocks(html);
 for(const code of ['alert(1)',blocks.scripts[0]+';window.unreviewed=true'])assert.equal(allowed('script',code),false);
 for(const style of ['body{display:none}',blocks.styles[0]+'body{color:red}',PLAYBACK_SCORE_STYLE+'*{display:none}'])assert.equal(allowed('style',style),false);
 assert.throws(()=>staticContentPolicy(html.replace('</body>','<script>alert(1)</script></body>'),[PLAYBACK_SCORE_STYLE]),/Unexpected inline/);
 assert.throws(()=>staticContentPolicy(html.replace('</head>','<style>body{color:red}</style></head>'),[PLAYBACK_SCORE_STYLE]),/Unexpected inline/);
});
test('every generated score uses the exact runtime style covered by the policy',()=>{
 const score=renderPlaybackScore({duration:3,tracks:[{label:'<style>unreviewed</style>',notes:[[60,0,1],[64,1,1]]}]});
 const blocks=inlineBlocks(score.svg);assert.equal(blocks.styles.length,1);assert.equal(blocks.styles[0],PLAYBACK_SCORE_STYLE);assert(allowed('style',blocks.styles[0]));assert(!score.svg.includes('style='));
});
test('inline event handlers and style attributes are explicitly disabled without changing voice colors',async()=>{
 assert.deepEqual([...sources('script-src-attr')],["'none'"]);assert.deepEqual([...sources('style-src-attr')],["'none'"]);
 const app=await readFile('src/app.mjs','utf8');assert(!app.includes('style="--voice:'));assert(app.includes('voice-${i%VOICE_COLORS.length}'));
 const css=await readFile('src/style.css','utf8');assert(css.includes('.voice-0{--voice:#b74131}')&&css.includes('.voice-1{--voice:#246a74}')&&css.includes('.voice-2{--voice:#966311}'));
 const markup=html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi,'');assert(!/\son\w+\s*=/i.test(markup));assert(!/\sstyle\s*=/i.test(markup));
});
test('inert JSON and markup-like strings inside code are not mistaken for style elements',()=>{
 const example='<style>body{color:black}</style><script type="application/json">{"title":"Reading"}</script><script type="module">const generated = `<style>.score{color:red}</style>`;</script>';
 const blocks=inlineBlocks(example);assert.equal(blocks.styles.length,1);assert.equal(blocks.scripts.length,1);assert.equal(blocks.styles[0],'body{color:black}');
});
