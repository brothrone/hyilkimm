(() => {
  const panel = document.getElementById("uploads");
  const input = document.getElementById("upload");
  const list = document.getElementById("file-list");
  const status = document.getElementById("file-status");
  const uploadStatus = document.getElementById("upload-status");
  const api = "https://filebin.net/";
  const week = 7 * 24 * 60 * 60 * 1000;
  const prefix = "hyilkimm-team-e07fb3-";
  const bin = n => prefix + n;
  const weekNow = () => Math.floor(Date.now() / week);
  const fmt = new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", timeZone: "Asia/Seoul" });
  let busy = false;
  let refreshAgain = false;
  let lastRender = null;
  const cache = new Map();
  async function getFiles(name) {
    const response = await fetch(api + name, {
      headers: {Accept: "application/json"}, cache: "no-store", credentials: "omit",
      signal: AbortSignal.timeout(20000)
    });
    if ([404, 405, 410].includes(response.status)) return [];
    if (!response.ok) throw Error(String(response.status));
    const {bin: info, files} = await response.json();
    return (files || []).map(file => ({...file, bin: name, expires: info.expired_at}));
  }
  function render(files) {
    files.sort((a,b) => b.updated_at.localeCompare(a.updated_at));
    const signature = JSON.stringify(files.map(f=>[f.bin,f.filename,f.updated_at,f.expires]));
    if (signature === lastRender) return;
    lastRender = signature;
    const rows=files.map(f=>{
      const item=document.createElement("li");
      const link=document.createElement("a");
      link.href=api+f.bin+"/"+encodeURIComponent(f.filename);
      link.target="_blank"; link.rel="noopener noreferrer";
      link.textContent=f.filename.replace(/^[0-9a-f]{12}--/, "");
      const meta=document.createElement("small");
      meta.textContent=f.bytes_readable+" · "+fmt.format(new Date(f.expires))+" 만료";
      item.append(link,meta);return item;
    });
    list.replaceChildren(...rows);
  }
  async function refresh() {
    if (panel.hidden || document.hidden) return;
    if (busy) { refreshAgain=true; return; }
    busy=true;
    try {
      const current = weekNow();
      const names=[bin(current),bin(current-1)];
      const results=await Promise.allSettled(names.map(getFiles));
      results.forEach((r,i)=>{if(r.status==="fulfilled")cache.set(names[i],r.value);});
      const files=names.flatMap(n=>cache.get(n)||[]);
      render(files);
      status.textContent=results.some(r=>r.status==="rejected")?"목록을 갱신하지 못했습니다. 잠시 후 다시 연결합니다.":files.length?"":"아직 올린 파일이 없습니다.";
    } finally {
      busy=false;
      if(refreshAgain){refreshAgain=false;void refresh();}
    }
  }
  input.addEventListener("change",async()=>{
    const files=Array.from(input.files);
    if(!files.length)return;
    input.disabled=true;
    const failed=[];
    let count=0;
    try {
      for(const file of files){
        uploadStatus.textContent=file.name+" 올리는 중…";
        // Preserve the original extension. A unique prefix lets two people upload the same filename.
        const stored=crypto.randomUUID().replaceAll("-","").slice(0,12)+"--"+file.name;
        try{
          const result=await fetch(api+bin(weekNow())+"/"+encodeURIComponent(stored),{
            method:"POST",body:file.slice(0,file.size,""),credentials:"omit",
            headers:{Accept:"application/json"}, signal:AbortSignal.timeout(300000)
          });
          if(!result.ok)throw Error(String(result.status));
          const saved=await result.json();
          if(saved.file?.filename!==stored)throw Error("응답 확인 실패");
          count++;void refresh();
        }catch(e){failed.push(file.name+" ("+e.message+")");}
      }
      uploadStatus.textContent=failed.length?"완료 "+count+"개 · 실패 "+failed.join(", "):count+"개 파일을 공유했습니다.";
    } finally {input.disabled=false;input.value="";void refresh();}
  });
  window.addEventListener("show-files",refresh);
  document.addEventListener("visibilitychange",refresh);
  setInterval(refresh,7000);
})();
