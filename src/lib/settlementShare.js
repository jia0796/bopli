import { graphemes } from './inputRules.js';
export const SHARE_SIZE={width:1080,height:1350};
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
export function sharePages(sections) {
  const pages=[];let page={blocks:[],rowCount:0,height:0};
  const flush=()=>{if(page.blocks.length)pages.push(page);page={blocks:[],rowCount:0,height:0};};
  for(const section of sections) {
    let offset=0;
    do {
      if(page.height+188+(section.rows.length?76:0)>820||page.rowCount===8)flush();
      const capacity=Math.min(8-page.rowCount,Math.floor((820-page.height-188)/76));
      const rows=section.rows.slice(offset,offset+capacity);
      page.blocks.push({...section,rows});page.height+=188+rows.length*76;page.rowCount+=rows.length;offset+=rows.length;
      if(offset<section.rows.length)flush();
    }while(offset<section.rows.length);
  }
  flush();return pages;
}
export async function renderSharePng(page,{groupName,activityName,date,pageNumber,pageCount}) {
  await document.fonts?.ready;
  const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('瀏覽器無法產生圖片');
  ctx.fillStyle='#FFF9F5';ctx.fillRect(0,0,1080,1350);ctx.fillStyle='#24334F';
  const text=(value,x,y,size,width)=>{ctx.font=`${size}px sans-serif`;ctx.fillText(width?ellipsisText(value,width,t=>ctx.measureText(t).width):value,x,y);};
  text(groupName,64,70,28,650);text(activityName,64,138,48,650);text('Bopli',830,110,48);
  let y=240;
  for(const block of page.blocks) {
    text(block.title,64,y,40,900);text(block.summary,64,y+58,36,900);text(block.label,64,y+112,28,900);y+=188;
    for(const row of block.rows){text(row.name,80,y,36,610);text('NT$'+row.amount.toLocaleString('zh-TW'),740,y,36);y+=76;}
  }
  text(localTimestamp(date),64,1270,28);text(`${pageNumber} / ${pageCount}`,500,1270,24);
  // Fixed mascot, matching BrandMark, independent of the amount of content.
  ctx.fillStyle='#F6A08B';ctx.beginPath();ctx.ellipse(893,1230,43,48,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#FFE0D5';ctx.beginPath();ctx.ellipse(936,1240,43,39,0,0,Math.PI*2);ctx.fill();
  for(const [x,y,color] of [[882,1223,'#fff'],[900,1223,'#fff'],[925,1233,'#24334F'],[944,1233,'#24334F']]){ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill();}
  for(const [x,y,color] of [[891,1233,'#fff'],[934,1242,'#D96A55']]){ctx.strokeStyle=color;ctx.lineWidth=4;ctx.beginPath();ctx.arc(x,y,10,0,Math.PI);ctx.stroke();}
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
