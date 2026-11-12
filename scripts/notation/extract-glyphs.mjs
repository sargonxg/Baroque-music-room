/** Regenerate the small notation outline set from an installed VexFlow 4.2.5. */
import {createRequire} from 'node:module';
import {writeFile,readFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
const require=createRequire(import.meta.url);
let VF;
try{VF=require(process.argv[2]?resolve(process.argv[2]):'vexflow');}
catch{throw Error('Install VexFlow 4.2.5 separately, then pass its build/cjs/vexflow.js path. Normal builds do not require this package.');}
const names=['gClef','fClef','noteheadBlack','noteheadHalf','noteheadWhole','flag8thUp','flag8thDown','flag16thUp','flag16thDown','flag32ndUp','flag32ndDown','flag64thUp','flag64thDown','accidentalSharp','accidentalFlat','accidentalNatural','restWhole','restHalf','restQuarter','rest8th','rest16th','rest32nd','rest64th'];
const glyphs={};
for(const name of names){
 let path='';const coordinate=n=>Number(n.toFixed(4));
 const context={beginPath(){},moveTo(x,y){path+=`M${coordinate(x)},${coordinate(y)}`;},lineTo(x,y){path+=`L${coordinate(x)},${coordinate(y)}`;},quadraticCurveTo(x1,y1,x,y){path+=`Q${coordinate(x1)},${coordinate(y1)} ${coordinate(x)},${coordinate(y)}`;},bezierCurveTo(x1,y1,x2,y2,x,y){path+=`C${coordinate(x1)},${coordinate(y1)} ${coordinate(x2)},${coordinate(y2)} ${coordinate(x)},${coordinate(y)}`;},fill(){path+='Z';},save(){},restore(){},setFillStyle(){},setStrokeStyle(){}};
 const glyph=new VF.Glyph(name,38);glyph.render(context,0,0);glyphs[name]={path,width:glyph.getMetrics().width,source:'VexFlow 4.2.5 / Bravura'};
}
await writeFile('src/glyphs.mjs','/** Music outlines rendered with VexFlow 4.2.5 from Bravura. See assets/notation/ rights. */\nexport const MUSIC_GLYPHS='+JSON.stringify(glyphs)+';\n');
console.log('Regenerated 23 notation outlines. Keep the accompanying VexFlow MIT and Bravura OFL notices.');
