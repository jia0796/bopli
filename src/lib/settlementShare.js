import { graphemes } from './inputRules.js';
export const SHARE_SIZE={width:1500,height:2100};
export function ellipsisText(text, maxWidth, measure) {
  if(measure(text)<=maxWidth)return text;
  let result='';for(const part of graphemes(text)){if(measure(result+part+'…')>maxWidth)break;result+=part;}return result+'…';
}
export function localTimestamp(date=new Date()) {
  const pad=n=>String(n).padStart(2,'0');return `${date.getFullYear()}.${pad(date.getMonth()+1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export function personalSections(uid, finance, repayments, nameFor) {
  const transfers=finance.transfers;
  const unpaid=transfers.filter(t=>t.fromUid===uid||t.toUid===uid);
  const pending=repayments.filter(s=>s.status==='pending'&&(s.fromUid===uid||s.toUid===uid));
  const disputed=repayments.filter(s=>s.status==='disputed'&&(s.fromUid===uid||s.toUid===uid));
  const total=unpaid.reduce((sum,t)=>sum+t.amount,0), waiting=pending.reduce((sum,t)=>sum+t.amount,0);
  const title=`${nameFor(uid)} 的結算`;
  const summary=finance.status==='notStarted'?'尚未開始記帳':total?`${(finance.projectedBalances[uid]||0)<0?'還要付':'還要收'} NT$${total.toLocaleString('zh-TW')}`:waiting?`等待確認 NT$${waiting.toLocaleString('zh-TW')}`:disputed.length?'還款需要處理':'目前已結清';
  const section=(label,rows)=>{const grouped=new Map();for(const t of rows){const id=t.fromUid===uid?t.toUid:t.fromUid;grouped.set(id,(grouped.get(id)||0)+t.amount);}return {title,summary,label,rows:[...grouped].map(([id,amount])=>({name:nameFor(id),amount}))};};
  return [section('已付款・待確認',pending.filter(s=>s.fromUid===uid)),section('待我確認',pending.filter(s=>s.toUid===uid)),section('還款需要處理',disputed),section((finance.projectedBalances[uid]||0)<0?'尚需支付':'尚待付款',unpaid)].filter(s=>s.rows.length).concat(!unpaid.length&&!pending.length&&!disputed.length?[{title,summary,label:'',rows:[]}]:[]);
}
export const SHARE_LAYOUT={safeHeight:1450,header:300,row:120,gap:24};
export function sharePages(sections) {
  const pages=[];let page={blocks:[],rowCount:0,height:0};
  const flush=()=>{if(page.blocks.length)pages.push(page);page={blocks:[],rowCount:0,height:0};};
  for(const section of sections) {
    let offset=0;
    do {
      if(page.height+SHARE_LAYOUT.header+SHARE_LAYOUT.gap+(section.rows.length?SHARE_LAYOUT.row:0)>SHARE_LAYOUT.safeHeight||page.rowCount===8)flush();
      const capacity=Math.min(8-page.rowCount,Math.floor((SHARE_LAYOUT.safeHeight-page.height-SHARE_LAYOUT.header-SHARE_LAYOUT.gap)/SHARE_LAYOUT.row));
      const rows=section.rows.slice(offset,offset+capacity);
      page.blocks.push({...section,rows});page.height+=SHARE_LAYOUT.header+rows.length*SHARE_LAYOUT.row+SHARE_LAYOUT.gap;page.rowCount+=rows.length;offset+=rows.length;
      if(offset<section.rows.length)flush();
    }while(offset<section.rows.length);
  }
  flush();return pages;
}
export async function renderSharePng(page,{groupName,activityName,date,pageNumber,pageCount}) {
  await document.fonts?.ready;
  const canvas=document.createElement('canvas');canvas.width=SHARE_SIZE.width;canvas.height=SHARE_SIZE.height;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('瀏覽器無法產生圖片');
  ctx.fillStyle='#FFF9F5';ctx.fillRect(0,0,canvas.width,canvas.height);
  const text=(value,x,y,size,width,weight=400,color='#24334F',align='left')=>{
    ctx.font=`${weight} ${size}px sans-serif`;ctx.fillStyle=color;ctx.textAlign=align;
    ctx.fillText(width?ellipsisText(value,width,t=>ctx.measureText(t).width):value,x,y);
  };
  text(groupName,96,110,36,1000,400,'#657083');text(activityName,96,205,64,1000,700);text('Bopli',1404,170,60,null,700,'#24334F','right');
  let y=320;
  for(const block of page.blocks) {
    const cardHeight=SHARE_LAYOUT.header+block.rows.length*SHARE_LAYOUT.row;
    ctx.fillStyle=block.label.includes('確認')?'#FFEAE2':'#FFFFFF';ctx.beginPath();ctx.roundRect(72,y,1356,cardHeight,28);ctx.fill();
    text(block.title,112,y+64,44,1260,600);
    const summary=block.summary.match(/^(.*?) NT\$(.*)$/);
    text(summary?summary[1]:block.summary,112,y+130,40,1260,600);
    if(summary)text(`NT$${summary[2]}`,112,y+230,86,1260,700);
    text(block.label,112,y+282,32,1260,500,'#657083');
    let rowY=y+SHARE_LAYOUT.header;
    for(const row of block.rows) {
      ctx.strokeStyle='#E9DFD8';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(112,rowY);ctx.lineTo(1388,rowY);ctx.stroke();
      text(row.name,112,rowY+78,44,850,500);text('NT$'+row.amount.toLocaleString('zh-TW'),1388,rowY+78,44,null,600,'#24334F','right');rowY+=SHARE_LAYOUT.row;
    }
    y+=cardHeight+SHARE_LAYOUT.gap;
  }
  text(localTimestamp(date),96,2010,32,null,400,'#657083');text(`${pageNumber} / ${pageCount}`,750,2010,30,null,400,'#657083','center');
  ctx.save();ctx.translate(1250,1900);ctx.scale(1.6,1.6);
  ctx.fillStyle='#F6A08B';ctx.beginPath();ctx.ellipse(40,50,34,38,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#FFE0D5';ctx.beginPath();ctx.ellipse(74,57,34,31,0,0,Math.PI*2);ctx.fill();
  for(const [x,y,color] of [[34,44,'#fff'],[46,44,'#fff'],[66,53,'#24334F'],[82,53,'#24334F']]){ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,3.4,0,Math.PI*2);ctx.fill();}
  for(const [x,y,color] of [[40,53,'#fff'],[74,62,'#D96A55']]){ctx.strokeStyle=color;ctx.lineWidth=3.4;ctx.beginPath();ctx.arc(x,y,8,0,Math.PI);ctx.stroke();}
  ctx.restore();
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG 產生失敗')),'image/png'));
}
export async function outputShareFiles(files,{navigator:nav=globalThis.navigator,download}={}) {
  if(!files.length)return 'empty';
  if(nav?.canShare?.({files})&&nav.share) {
    try {await nav.share({files});return 'shared';}
    catch(error){if(error.name==='AbortError')return 'cancelled';if(!['TypeError','NotSupportedError'].includes(error.name))throw error;}
  }
  for(const file of files)download(file);return 'downloaded';
}
