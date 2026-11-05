export const templates = {
  '折线': [[0,0],[1,0],[1,1]],
  '闪电': [[0,0],[1,0],[0,1],[1,1]],
  '圆环': Array.from({length: 65}, (_, i) => [
    Math.sin(i * Math.PI / 32), -Math.cos(i * Math.PI / 32),
  ]),
};

const distance = (a, b) => Math.hypot(a[0]-b[0], a[1]-b[1]);
const samples = 32;
const threshold = 0.16;
const margin = 0.045;

export function normalize(points) {
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push(cumulative[i-1] + distance(points[i-1], points[i]));
  }
  const total = cumulative.at(-1);
  if (!(total > 0)) return null;
  let edge = 1;
  const path = Array.from({length: samples}, (_, i) => {
    const target = total * i / (samples-1);
    while (edge < points.length-1 && cumulative[edge] <= target) edge++;
    const length = cumulative[edge] - cumulative[edge-1];
    const fraction = length ? (target-cumulative[edge-1])/length : 1;
    return points[edge-1].map((value, axis) =>
      value + fraction * (points[edge][axis]-value));
  });
  const xs = path.map(p => p[0]);
  const ys = path.map(p => p[1]);
  const span = Math.max(Math.max(...xs)-Math.min(...xs), Math.max(...ys)-Math.min(...ys));
  const center = [xs,ys].map(values => values.reduce((sum,v)=>sum+v,0)/samples);
  return path.map(point => point.map((value, axis)=>(value-center[axis])/span));
}

const models = Object.entries(templates).map(([name,path]) => [name,normalize(path)]);

export function recognize(points) {
  const path = normalize(points);
  if (!path) return {name:null, reason:'轨迹太短'};
  const scores = models.map(([name, model]) => ({
    name, score: model.reduce((sum,p,i)=>sum+distance(p,path[i]),0)/samples,
  })).sort((a,b)=>a.score-b.score);
  const [best, second] = scores;
  const accepted = best.score <= threshold && second.score-best.score >= margin;
  return {...best, name:accepted ? best.name : null, reason:accepted ? '已施法' : '形状不匹配或相近', scores};
}

export function locateMarker({data,width,height}) {
  // Find the largest 4-connected green component in the downsampled image.
  const mask = new Uint8Array(width*height);
  for (let i=0; i<mask.length; i++) {
    const offset=4*i, r=data[offset], g=data[offset+1], b=data[offset+2];
    mask[i]=+(g>=95 && g-r>=42 && g-b>=35);
  }
  const queue = new Int32Array(mask.length);
  let best=null, second=0;
  for (let start=0; start<mask.length; start++) {
    if (!mask[start]) continue;
    let head=0, tail=0, sx=0, sy=0;
    const visit = index => {
      if (mask[index]) {mask[index]=0; queue[tail++]=index;}
    };
    visit(start);
    while (head<tail) {
      const index=queue[head++], x=index%width, y=Math.floor(index/width);
      sx+=x; sy+=y;
      if (x>0) visit(index-1);
      if (x+1<width) visit(index+1);
      if (y>0) visit(index-width);
      if (y+1<height) visit(index+width);
    }
    if (!best || tail>best.area) {
      second=best?.area ?? 0;
      best={x:sx/tail,y:sy/tail,area:tail};
    } else second=Math.max(second,tail);
  }
  return best && best.area>=12 && best.area<=mask.length*0.08 &&
    second<best.area*0.65 ? best : null;
}
