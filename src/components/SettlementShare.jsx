import React,{useEffect,useState} from 'react';
import {X} from 'lucide-react';
import {personalSections,sharePages,renderSharePng,outputShareFiles} from '../lib/settlementShare.js';
export default function SettlementShare({group,activity,actorId,finance,settlements,nameFor,onClose}) {
  const [mode,setMode]=useState(''),[member,setMember]=useState(''),[images,setImages]=useState([]),[selected,setSelected]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  useEffect(()=>()=>{images.forEach(image=>URL.revokeObjectURL(image.url));},[images]);
  async function generate(kind,uid=actorId) {
    setBusy(true);setError('');
    try {
      let sections;
      if(kind==='all') {
        const receivers=[...new Set([...finance.transfers.map(t=>t.toUid),...settlements.filter(s=>['pending','disputed'].includes(s.status)).map(s=>s.toUid)])];
        sections=receivers.flatMap(id=>personalSections(id,finance,settlements,nameFor));
        if(!sections.length)sections=[{title:'全部結算',summary:finance.status==='notStarted'?'尚未開始記帳':'目前已結清',label:'',rows:[]}];
      }else sections=personalSections(uid,finance,settlements,nameFor);
      const pages=sharePages(sections), date=new Date();
      const blobs=[];
      for(let i=0;i<pages.length;i++)blobs.push(await renderSharePng(pages[i],{groupName:group.name,activityName:activity.title,date,pageNumber:i+1,pageCount:pages.length}));
      setImages(blobs.map((blob,i)=>({file:new File([blob],`Bopli-${i+1}.png`,{type:'image/png'}),url:URL.createObjectURL(blob)})));setSelected(blobs.map(()=>true));setMode('preview');
    }catch(e){setError(e.message);}finally{setBusy(false);}
  }
  async function share() {
    try {
      const result=await outputShareFiles(images.filter((_,i)=>selected[i]).map(image=>image.file),{download:file=>{const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}});
      if(result==='downloaded')setNotice('已下載所選 PNG');
    }catch(e){setError('分享失敗：'+e.message);}
  }
  return <div className="modal-overlay"><section className="modal share-modal" role="dialog" aria-label="分享結算"><div className="modal-top"><h2>分享結算</h2><button className="icon-button" aria-label="關閉分享" onClick={onClose}><X/></button></div>
    {!mode&&<div className="form-stack"><button className="outline-button" disabled={busy} onClick={()=>generate('personal')}>個人結算表分享</button><button className="outline-button" disabled={busy} onClick={()=>setMode('other')}>他人結算表分享</button><button className="outline-button" disabled={busy} onClick={()=>generate('all')}>全部結算表分享</button></div>}
    {mode==='other'&&<div className="form-stack"><label className="field"><span>選擇成員</span><select value={member} onChange={e=>setMember(e.target.value)}><option value="">請選擇一位成員</option>{activity.participantIds.map(id=><option key={id} value={id}>{nameFor(id)}</option>)}</select></label><button className="primary-button" disabled={!member||busy} onClick={()=>generate('other',member)}>產生圖片</button></div>}
    {mode==='preview'&&<><div className="share-carousel" aria-label="結算圖片預覽">{images.map((image,i)=><article className="share-page" key={image.url}><img src={image.url} alt={`結算 PNG 第 ${i+1} 張`}/><label><input type="checkbox" aria-label={`選取第 ${i+1} 張`} checked={selected[i]} onChange={()=>setSelected(old=>old.map((value,j)=>i===j?!value:value))}/>第 {i+1} / {images.length} 張</label></article>)}</div><p aria-live="polite">已選擇 {selected.filter(Boolean).length} / {images.length} 張</p><button className="primary-button full" disabled={!selected.some(Boolean)} onClick={share}>分享</button></>}
    {busy&&<p role="status">正在產生 PNG…</p>}{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  </section></div>;
}
