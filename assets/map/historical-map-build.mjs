/** GPL-3.0: projected derivative of A. Ourednik / contributors' historical-basemaps.
 * Source and full licence accompany europe-1700.svg. Schematic, not an authority on borders.
 * Reproduce: npm install d3-geo@3; gunzip -c historical-source.json.gz > source.json
 * node historical-map-build.mjs source.json > europe-1700.svg
 */
import {historicalName} from './historical-labels.mjs';
import {geoMercator,geoPath,geoArea,geoGraticule10} from 'd3-geo';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const palette={France:'#e4c5bd',Spain:'#ead6a7',Portugal:'#b9d0ba','Holy Roman Empire':'#d9d2bd','Habsburg lands':'#d6c2d5',Prussia:'#bdcdd9','Dutch Republic':'#efcda7','England and Ireland':'#c6bcd7',Scotland:'#c6bcd7','Denmark-Norway':'#c3d6d7',Sweden:'#eadfae','Polish–Lithuanian Commonwealth':'#dcbac4','Ottoman Empire':'#bed2b8','Tsardom of Muscovy':'#c1c8b6',Venice:'#b9d6cb','Papal States':'#e8c9c2',Tuscany:'#d1cfb3',Genoa:'#c5c5d9'};
export function colour(name){name=historicalName(name);return palette[name]||['#d7ddc7','#e0cbb9','#c9d8dc','#d6c6d3'][[...String(name)].reduce((n,c)=>n+c.charCodeAt(0),0)%4];}
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
export function historicalSVG(data){
 const p=geoMercator().center([12,50]).scale(650).translate([400,245]).clipExtent([[0,0],[800,530]]),path=geoPath(p).digits(1);
 // The upstream snapshot mixes a few adjacent dates. Island and border simplifications
 // remain visible in the provenance; colours describe regions, not exact sovereignty.
 const features=[...data.features].sort((a,b)=>geoArea(b)-geoArea(a));
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 530"><title>European territories around 1700, schematic</title><desc>Approximate historical regions. Borders and dates are simplified; colours are not national musical styles. An anachronistic upstream label is displayed as Habsburg lands; source geometry is retained. Historical-basemaps, GPL-3.0.</desc><rect width="800" height="530" fill="#e3eceb"/><path d="${path(geoGraticule10())}" fill="none" stroke="#aac0c3" stroke-width=".4"/>${features.map(f=>`<path d="${path(f)||''}" fill="${colour(f.properties.NAME)}" stroke="#829390" stroke-width=".65"><title>${esc(historicalName(f.properties.NAME))}</title></path>`).join('')}<text x="24" y="505" fill="#3b5557" font-family="Arial" font-size="11">Territories c. 1700 · schematic · borders and dates simplified</text></svg>`;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)process.stdout.write(historicalSVG(JSON.parse(await readFile(process.argv[2],'utf8'))));
