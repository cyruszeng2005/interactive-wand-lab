import {templates, recognize, locateMarker} from './core.mjs';
const select = id => document.getElementById(id);
const stage = select('stage'), ctx = stage.getContext('2d');
const status = select('status'), record = select('record');
const video = document.querySelector('video');
const sample = document.createElement('canvas');
sample.width=160; sample.height=120;
const pixels=sample.getContext('2d',{willReadFrequently:true});
let stream=null, mode='mouse', cameraRequest=0, path=[], recording=false;
let marker=null, lostAt=null, pointer=null, start=0, effect=null;
const announce = text => {status.textContent=text;};
const distance = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1]);

function drawPath(context, points, color, width) {
  if (!points.length) return;
  context.strokeStyle=color;
  context.lineWidth=width;
  context.lineJoin=context.lineCap='round';
  context.beginPath();
  context.moveTo(...points[0]);
  for (const point of points.slice(1)) context.lineTo(...point);
  context.stroke();
}
for (const [name, shape] of Object.entries(templates)) {
  const fig=document.createElement('figure'), c=document.createElement('canvas');
  c.width=80; c.height=65;
  const ring=name==='圆环';
  const points=shape.map(([x,y])=>ring ? [40+x*22,32+y*22] : [16+x*47,11+y*43]);
  const brush=c.getContext('2d');
  drawPath(brush,points,'#93e8d0',3);
  brush.fillStyle='#f2c47d'; brush.beginPath(); brush.arc(...points[0],4,0,Math.PI*2); brush.fill();
  const caption=document.createElement('figcaption');
  caption.textContent=name;
  fig.append(c,caption); select('cards').append(fig);
}
function begin() {
  start=performance.now(); path=[]; effect=null; lostAt=null; recording=true;
  record.textContent='结束采集（空格）'; announce('采集中。画完后结束采集。');
}
function add(point) {
  if (!path.length || distance(point,path.at(-1))>=2) path.push(point);
}
function finish(cancelReason) {
  if (!recording) return;
  recording=false; pointer=null;
  record.textContent='开始采集（空格）';
  if (cancelReason) {path=[]; announce(cancelReason); return;}
  const length=path.slice(1).reduce((sum,p,i)=>sum+distance(path[i],p),0);
  if (path.length<6 || length<45) {announce('轨迹太短，请画得更大一些。');return;}
  const result=recognize(path);
  if (result.name) effect={name:result.name, until:performance.now()+1500};
  announce(result.name ? `已施法 · ${result.name}（距离 ${result.score.toFixed(3)}）` :
    `未识别（距离 ${result.score.toFixed(3)}）。从金色起点沿图示重试。`);
}
function position(e) {
  const box=stage.getBoundingClientRect();
  return [(e.clientX-box.left)*640/box.width,(e.clientY-box.top)*480/box.height];
}
stage.addEventListener('pointerdown', e => {
  if (mode!=='mouse' || recording || e.button!==0) return;
  stage.setPointerCapture(e.pointerId); pointer=e.pointerId; begin(); add(position(e));
});
stage.addEventListener('pointermove', e => {
  if (e.pointerId===pointer && recording) add(position(e));
});
stage.addEventListener('pointerup', e => {
  if (e.pointerId===pointer && recording) {add(position(e));finish();}
});
for (const type of ['pointercancel','lostpointercapture']) stage.addEventListener(type,e=>{
  if (e.pointerId===pointer) finish('采集取消，请重试。');
});
function stopCamera() {
  cameraRequest++;
  stream?.getTracks().forEach(track=>track.stop());
  stream=null; video.srcObject=null; marker=null; mode='mouse'; record.disabled=true;
  select('camera').disabled=false;
}
select('mouse').onclick=()=>{
  finish('采集取消。'); stopCamera(); path=[];
  announce('鼠标模式已就绪。按住并绘制，松开识别。');
};
select('camera').onclick=async ()=>{
  finish('采集取消。'); stopCamera(); path=[];
  const request=cameraRequest;
  select('camera').disabled=true;
  try {
    if (!navigator.mediaDevices) throw Error('摄像头需要 localhost 或 HTTPS');
    const candidate=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},aspectRatio:{ideal:4/3}},audio:false});
    if (request!==cameraRequest) {candidate.getTracks().forEach(track=>track.stop());return;}
    stream=candidate; video.srcObject=stream; await video.play();
    if (request!==cameraRequest) return;
    mode='camera'; record.disabled=false;
    announce('摄像头已启用，请让绿色标记进入画面。');
  } catch(error) {
    if (request!==cameraRequest) return;
    stopCamera(); announce(`摄像头无法启动（${error.name}），请检查权限或继续使用鼠标。`);
  }
};
record.onclick=()=>{
  if (mode!=='camera') return;
  if (recording) {finish(marker ? undefined : '结束时未看到标记，请重试。');return;}
  if (!marker) {announce('尚未找到绿色标记。请调整背景、距离和光照。');return;}
  begin(); add(marker);
};
window.addEventListener('keydown',e=>{
  if (e.code==='Space' && !e.repeat && mode==='camera' && !e.target.closest('button')) {
    e.preventDefault(); record.click();
  }
});
window.addEventListener('pagehide',stopCamera);
function drawEffect(now) {
  if (!effect || now>effect.until) return;
  const colors={'折线':'#f5c67b','闪电':'#a9c3ff','圆环':'#8df1c1'};
  const elapsed=1-(effect.until-now)/1500;
  ctx.save();
  ctx.globalAlpha=1-elapsed;
  ctx.fillStyle=colors[effect.name];
  for (let i=0;i<24;i++) {
    const angle=i*Math.PI/12, radius=22+elapsed*(65+i*2);
    ctx.beginPath(); ctx.arc(320+Math.cos(angle)*radius,240+Math.sin(angle)*radius,4,0,Math.PI*2);ctx.fill();
  }
  ctx.restore();
}
function frame(now) {
  ctx.fillStyle='#101a29';ctx.fillRect(0,0,640,480);
  if (mode==='camera' && video.readyState>=2) {
    // Center-crop to 4:3 and mirror before both display and segmentation.
    const w=Math.min(video.videoWidth,video.videoHeight*4/3), h=w*3/4;
    pixels.save(); pixels.translate(160,0);pixels.scale(-1,1);
    pixels.drawImage(video,(video.videoWidth-w)/2,(video.videoHeight-h)/2,w,h,0,0,160,120);
    pixels.restore();
    ctx.drawImage(sample,0,0,640,480);
    const hit=locateMarker(pixels.getImageData(0,0,160,120));
    if (hit) {
      const next=[hit.x*4+2,hit.y*4+2];
      marker=marker ? next.map((value,i)=>marker[i]*0.35+value*0.65) : next;
      lostAt=null;
      if (recording) add(marker);
      ctx.strokeStyle='#d7ff7e';ctx.lineWidth=3;ctx.beginPath();ctx.arc(...marker,12,0,Math.PI*2);ctx.stroke();
    } else {
      marker=null; lostAt??=now;
      if (recording && now-lostAt>220) finish('标记丢失，本次采集已取消。');
    }
  } else if (mode==='camera') {
    marker=null;
    if (recording) finish('摄像头画面中断，请重试。');
  } else {
    ctx.strokeStyle='#25394e';ctx.lineWidth=1;ctx.beginPath();
    for(let x=32;x<640;x+=32){ctx.moveTo(x,0);ctx.lineTo(x,480);}
    for(let y=32;y<480;y+=32){ctx.moveTo(0,y);ctx.lineTo(640,y);}
    ctx.stroke();
  }
  if (recording && now-start>6000) finish('采集超时，请在 6 秒内完成。');
  drawPath(ctx,path,'#8cebd3',4); drawEffect(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
