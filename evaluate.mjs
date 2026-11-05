import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {templates, recognize, locateMarker} from './core.mjs';

const labels = [...Object.keys(templates),'拒识'];
const matrix = Object.fromEntries(labels.map(label=>[label,Object.fromEntries(labels.map(p=>[p,0]))]));
let seed = 20261105;
function random() {
  seed = (Math.imul(seed,1664525)+1013904223)>>>0;
  return seed / 2**32;
}
function perturb(shape, amplitude) {
  const scale = 70+100*random(), tx=150*random(), ty=150*random();
  const angle = (random()*2-1)*Math.PI/18, c=Math.cos(angle), s=Math.sin(angle);
  const points = [shape[0]];
  for (let i=1;i<shape.length;i++) {
    const [ax,ay]=shape[i-1], [bx,by]=shape[i];
    const count=shape.length>10 ? 1 : 5+Math.floor(random()*10);
    for(let j=1;j<=count;j++) points.push([ax+(bx-ax)*j/count,ay+(by-ay)*j/count]);
  }
  return points.map(([x,y])=>[
    tx+scale*(c*x-s*y+amplitude*(2*random()-1)),
    ty+scale*(s*x+c*y+amplitude*(2*random()-1)),
  ]);
}
for (const [label, shape] of Object.entries(templates)) {
  assert.equal(recognize(shape).name,label);
  for(let i=0;i<50;i++) matrix[label][recognize(perturb(shape,.09)).name ?? '拒识']++;
}
const otherPaths = [
  [[0,0],[1,0]], [[0,0],[0,1]], [[0,0],[1,1]],
  [[0,0],[0,1],[1,1]], [[0,0],[.5,1],[1,0]],
];
for(const shape of otherPaths) {
  for(let i=0;i<10;i++) matrix['拒识'][recognize(perturb(shape,.09)).name ?? '拒识']++;
}

function image(rectangles) {
  const width=40,height=30,data=new Uint8ClampedArray(width*height*4);
  for (const [x,y,w,h] of rectangles) {
    for(let row=y;row<y+h;row++) for(let col=x;col<x+w;col++) {
      data.set([25,185,35,255],4*(row*width+col));
    }
  }
  return {width,height,data};
}
assert.equal(recognize([[1,1],[1,1]]).name,null);
assert.deepEqual(locateMarker(image([[10,8,5,4],[2,2,1,1]])),{x:12,y:9.5,area:20});
assert.equal(locateMarker(image([])),null);
assert.equal(locateMarker(image([[2,2,4,4],[15,15,4,4]])),null);
assert.equal(locateMarker(image([[2,2,2,2]])),null);
assert.equal(locateMarker(image([[2,2,10,10]])),null);
console.table(matrix);
console.log('9 项断言通过，200 条合成轨迹已评分。');
if (process.argv[2]) writeFileSync(process.argv[2],JSON.stringify(matrix,null,2)+'\n');
