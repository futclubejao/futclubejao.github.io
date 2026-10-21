// Central fechada (A1.6, 21/10/2026): confere o login, busca os dados no Supabase e só então liga o site.
// O código do site é o mesmo do index.html (montar_central.py guarda ele em <script type="text/plain" id="app-js">).
// Sem login / aguardando aprovação → entrar.html (e volta para cá depois).
const CP_DESC="❓ A identificar";
const CP_PREMIO={craque:"craque",golaco:"gol",murcha:"comico"};

// Tabelas do banco → as mesmas variáveis que o lances.js tinha (LANCES, FOTOS, ATLETAS, ENQUETES, EXTRAS) + CAMPEOES.
// Fotos/miniaturas saem como CAMINHO no Storage; quem chama troca pelo link temporário.
function cpConverte(d){
  const atl=Object.fromEntries(d.atletas.map(a=>[a.id,a]));
  const perfil=Object.fromEntries(d.perfis.map(p=>[p.atleta_id,p]));
  // dia de campeonato fica fora da temporada
  const rod=Object.fromEntries(d.rodadas.filter(r=>!r.campeonato_id).map(r=>[r.id,r]));
  const nomes={};
  d.lance_atletas.slice().sort((x,y)=>x.ordem-y.ordem)
    .forEach(x=>{if(atl[x.atleta_id])(nomes[x.lance_id]=nomes[x.lance_id]||[]).push(atl[x.atleta_id].nome)});
  const quem=(id,desc)=>desc?CP_DESC:(id&&atl[id]?atl[id].nome:"");
  const codigo={};
  const LANCES=d.lances.filter(l=>rod[l.rodada_id]).sort((x,y)=>x.codigo.localeCompare(y.codigo)).map(l=>{
    codigo[l.id]=l.codigo;
    const o={n:l.codigo.split("_").pop(),jogo:l.jogo,tipo:l.tipo};
    if(l.tipo2)o.tipo2=l.tipo2;
    Object.assign(o,{atletas:(nomes[l.id]||[]).concat(l.desconhecidos>0?[CP_DESC]:[]),time:l.time,desc:l.descricao,
      gol:quem(l.gol_atleta_id,l.gol_desconhecido),assist:quem(l.assist_atleta_id,l.assist_desconhecido),
      id:l.codigo,data:rod[l.rodada_id].data,thumb:l.thumb_path||null});
    if(l.duracao_s!=null)o.s=Math.round(+l.duracao_s);
    return o;
  });
  const EXTRAS=d.gols.filter(x=>rod[x.rodada_id]&&atl[x.atleta_id])
    .sort((x,y)=>rod[x.rodada_id].data.localeCompare(rod[y.rodada_id].data))
    .map((x,i)=>({id:"extra_"+i,data:rod[x.rodada_id].data,tipo:"extra",atletas:[],
      gol:x.tipo==="gol"?atl[x.atleta_id].nome:"",assist:x.tipo==="assist"?atl[x.atleta_id].nome:""}));
  const FOTOS=d.fotos.filter(f=>rod[f.rodada_id])
    .sort((x,y)=>rod[x.rodada_id].data.localeCompare(rod[y.rodada_id].data)||x.ordem-y.ordem)
    .map(f=>({data:rod[f.rodada_id].data,arquivo:f.path}));
  const ATLETAS={};
  d.atletas.filter(a=>!a.convidado).sort((x,y)=>x.nome.localeCompare(y.nome,"pt")).forEach(a=>{
    const p=perfil[a.id]||{},o={apelido:a.apelido,variacoes:a.variacoes};
    if(p.foto_path)o.foto=p.foto_path;
    if(p.times&&p.times.length)o.times=p.times;
    if(a.dm)o.dm=true;
    ATLETAS[a.nome]=o;
  });
  const CAMPEOES=d.premios.filter(p=>p.rodada_id&&rod[p.rodada_id]&&!p.campeonato_id&&CP_PREMIO[p.tipo]&&atl[p.atleta_id])
    .sort((x,y)=>rod[x.rodada_id].data.localeCompare(rod[y.rodada_id].data))
    .map(p=>{const c={kind:CP_PREMIO[p.tipo],semana:rod[p.rodada_id].data,atleta:atl[p.atleta_id].nome,votos:p.votos};
      if(p.lance_id&&codigo[p.lance_id])c.id=codigo[p.lance_id];return c});
  return {LANCES,FOTOS,ATLETAS,ENQUETES:{},EXTRAS,CAMPEOES};
}

if(typeof window!=="undefined"&&window.document)(()=>{
const sb=supabase.createClient("https://fvxecqjiyjstyacqrumr.supabase.co","sb_publishable_le3V4al6wKdsfPZ4DXHKZg_cXtEP3DS");
const GRUPO="jao", VALIDADE=6*3600;   // links das fotos valem 6 h
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

function paraEntrar(){
  try{localStorage.setItem("cp_volta",location.href)}catch(e){}
  location.replace("entrar.html");
}
function falhou(msg){
  $("cp-carrega").innerHTML=`<p>Não deu para abrir a Central agora.</p><p class="cp-err">${esc(msg)}</p><button type="button" onclick="location.reload()">Tentar de novo</button>`;
}
// Busca a tabela inteira (o Supabase entrega no máximo 1000 linhas por vez)
async function todos(tabela,cols,g){
  let out=[];
  for(let de=0;;de+=1000){
    const{data,error}=await sb.from(tabela).select(cols).eq("grupo_id",g).range(de,de+999);
    if(error)throw error;
    out=out.concat(data);
    if(data.length<1000)return out;
  }
}

// ---------- links temporários: fotos/miniaturas (Storage) e vídeos (função "video" → R2) ----------
const LINK={};
window.MIDIA={
  thumb:id=>{const l=window.byIdCP&&window.byIdCP[id];return(l&&LINK[l.thumb])||""},
  foto:p=>LINK[p]||"",
  video:async codigo=>{
    const c=MIDIA._v[codigo];
    if(c&&c.ate>Date.now())return c.url;
    const{data,error}=await sb.functions.invoke("video",{body:{codigo}});
    if(error||!data||!data.url)throw error||new Error("sem link");
    MIDIA._v[codigo]={url:data.url,ate:Date.now()+50*60*1000};
    return data.url;
  },
  _v:{}
};

async function iniciar(){
  const{data:{session}}=await sb.auth.getSession();
  if(!session)return paraEntrar();
  const{data:gs,error:eg}=await sb.from("grupos").select("id,nome").eq("slug",GRUPO);
  if(eg)return falhou(eg.message);
  if(!gs.length)return paraEntrar();          // ainda não aprovado (ou de fora)
  const g=gs[0].id;
  const{data:eu}=await sb.from("membros").select("id,atleta_id,papel").eq("grupo_id",g).eq("user_id",session.user.id).eq("situacao","aprovado").maybeSingle();
  if(!eu)return paraEntrar();
  await sb.rpc("apurar_enquetes",{p_grupo:g});   // enquete que fechou vira prêmio (não duplica)

  const[atletas,perfis,rodadas,lances,lance_atletas,gols,fotos,premios]=await Promise.all([
    todos("atletas","id,nome,apelido,variacoes,dm,convidado",g),
    todos("perfis_visiveis","atleta_id,times,foto_path",g),
    todos("rodadas","id,data,campeonato_id",g),
    todos("lances","id,rodada_id,codigo,n,jogo,tipo,tipo2,time,descricao,gol_atleta_id,assist_atleta_id,gol_desconhecido,assist_desconhecido,desconhecidos,thumb_path,duracao_s",g),
    todos("lance_atletas","lance_id,atleta_id,ordem",g),
    todos("gols_sem_video","rodada_id,tipo,atleta_id",g),
    todos("fotos","rodada_id,path,ordem",g),
    todos("premios","rodada_id,tipo,atleta_id,lance_id,votos,campeonato_id",g)]);
  const D=cpConverte({atletas,perfis,rodadas,lances,lance_atletas,gols,fotos,premios});

  // links temporários de todas as imagens de uma vez
  const caminhos=[...new Set([...Object.values(D.ATLETAS).map(a=>a.foto),...D.LANCES.map(l=>l.thumb),...D.FOTOS.map(f=>f.arquivo)].filter(Boolean))];
  if(caminhos.length){
    const{data:links,error:el}=await sb.storage.from("midia").createSignedUrls(caminhos,VALIDADE);
    if(el)return falhou(el.message);
    links.forEach(x=>{if(x.signedUrl)LINK[x.path]=x.signedUrl});
  }
  Object.values(D.ATLETAS).forEach(a=>{if(a.foto)a.foto=LINK[a.foto]||undefined});
  window.byIdCP=Object.fromEntries(D.LANCES.map(l=>[l.id,l]));
  Object.assign(window,{LANCES:D.LANCES,FOTOS:D.FOTOS,ATLETAS:D.ATLETAS,ENQUETES:D.ENQUETES,EXTRAS:D.EXTRAS,CAMPEOES_DB:D.CAMPEOES});

  const meu=atletas.find(a=>a.id===eu.atleta_id);
  const mod=eu.papel==="dono"||eu.papel==="moderador";
  barra(session.user.email,meu?meu.nome:null,eu.papel);

  // liga o site (mesmo código do index.html)
  const s=document.createElement("script");
  s.textContent=$("app-js").textContent;
  document.body.appendChild(s);
  document.body.classList.add("cp-pronto");
  $("cp-carrega").remove();

  if(meu)voce(meu.nome);
  if(mod)pedidos(g);
  const ult=rodadas.filter(r=>!r.campeonato_id).sort((x,y)=>y.data.localeCompare(x.data))[0];
  if(ult)enquetes(g,eu.id,ult);
}

// ---------- Enquetes de verdade (1 voto por pessoa, troca até fechar; parcial e total ao vivo) ----------
// Substitui as enquetes "de mentirinha" do index.html (voto só no aparelho). Mesmo visual.
const KIND={craque:"craque",golaco:"gol",murcha:"comico"};
let ENQ=[],VOT={g:null,membro:null};
async function enquetes(g,membro,rod){
  VOT={g,membro,rod};
  const{data:es}=await sb.from("enquetes").select("id,tipo,titulo,fecha_em").eq("rodada_id",rod.id);
  const ids=(es||[]).map(e=>e.id);
  const[ops,meus,...res]=ids.length?await Promise.all([
    sb.from("enquete_opcoes").select("id,enquete_id,lance_id,atleta_id,ordem").in("enquete_id",ids),
    sb.from("votos").select("enquete_id,opcao_id").eq("membro_id",membro).in("enquete_id",ids),
    ...ids.map(id=>sb.rpc("resultado_enquete",{p_enquete:id}))]):[{data:[]},{data:[]}];
  ENQ=(es||[]).map((e,i)=>{
    const r=(res[i]&&res[i].data)||[];
    return{...e,kind:KIND[e.tipo],
      opcoes:(ops.data||[]).filter(o=>o.enquete_id===e.id).sort((x,y)=>x.ordem-y.ordem),
      votos:Object.fromEntries(r.map(x=>[x.opcao_id,+x.votos])),total:r.length?+r[0].total:0,
      meu:((meus.data||[]).find(v=>v.enquete_id===e.id)||{}).opcao_id||null};
  });
  await nomesDasOpcoes();
  window.renderPolls=desenhaEnquetes;
  desenhaEnquetes();
  $("polls").addEventListener("click",votar,true);
}
// opção → lance (pelo código) ou atleta (pelo nome)
const OPC={lance:{},atleta:{}};
async function nomesDasOpcoes(){
  const lids=[...new Set(ENQ.flatMap(e=>e.opcoes.map(o=>o.lance_id)).filter(Boolean))];
  const aids=[...new Set(ENQ.flatMap(e=>e.opcoes.map(o=>o.atleta_id)).filter(Boolean))];
  const[l,a]=await Promise.all([lids.length?sb.from("lances").select("id,codigo").in("id",lids):{data:[]},
                                aids.length?sb.from("atletas").select("id,nome").in("id",aids):{data:[]}]);
  (l.data||[]).forEach(x=>OPC.lance[x.id]=x.codigo);
  (a.data||[]).forEach(x=>OPC.atleta[x.id]=x.nome);
}
const quando=d=>{const x=new Date(d);return x.toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"2-digit"})+" às "+x.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})};
function desenhaEnquetes(){
  const box=$("polls"),aberta=e=>new Date(e.fecha_em)>new Date();
  const ordem=["craque","gol","comico"];
  const L=ENQ.slice().sort((x,y)=>ordem.indexOf(x.kind)-ordem.indexOf(y.kind));
  const prazo=L.find(aberta);
  $("poll-date").textContent=`Jogo de ${fmtAno(VOT.rod.data)} · `+(prazo?`votação até ${quando(prazo.fecha_em)}`:L.length?"votação encerrada":"enquetes ainda não abertas");
  if(!L.length){box.innerHTML=`<div class="empty">As enquetes desta rodada ainda não foram abertas.</div>`;return}
  const pts={};STATS.filter(l=>l.data===VOT.rod.data).forEach(l=>{for(const a of[l.gol,l.assist])if(a)pts[a]=(pts[a]||0)+1});
  box.innerHTML=L.map(e=>{
    const ab=aberta(e),tot=e.total||0,max=Math.max(0,...Object.values(e.votos));
    const cand=e.opcoes.map(o=>o.lance_id?byId[OPC.lance[o.lance_id]]:null);
    if(e.kind!=="craque")pollCands[e.kind]=cand.filter(Boolean);
    let li=0;
    return `<div class="poll" data-kind="${e.kind}"><h3><span class="dot"></span>${esc(e.titulo)}</h3>
      <div class="opt-head"><span>${ab?(e.kind==="craque"?"Toque no atleta para votar":"Toque no lance para votar"):"Resultado final"}</span><span>${e.kind==="craque"?"":"Veja o lance ▾"}</span></div>
      ${e.opcoes.map((o,i)=>{const v=e.votos[o.id]||0,l=cand[i],nome=o.atleta_id?OPC.atleta[o.atleta_id]:null;
        const ganhou=!ab&&v>0&&v===max;
        const txt=nome?`${esc(nome)}<small>${pts[nome]||0} ${pts[nome]===1?"gol/assistência":"gols + assistências"} no domingo</small>`
                      :l?`${esc(l.atletas.join(", "))}<small>${esc(l.desc)}</small>`:"(lance removido)";
        const ver=l?`<a class="watch" href="#" data-kind="${e.kind}" data-i="${li++}" aria-label="Assistir: ${esc(l.desc)}">▶</a>`:"";
        return `<div class="opt-row"><button class="opt${e.meu===o.id?" voted":""}" data-kind="${e.kind}" data-id="${o.id}" data-enq="${e.id}" aria-pressed="${e.meu===o.id}"${ab?"":" disabled"}>
          <span class="bar" style="width:${tot?Math.round(v/tot*100):0}%"></span>
          <span class="t">${ganhou?"🏆 ":""}${txt}</span><span class="n">${v}</span></button>${ver}</div>`}).join("")}
      <div class="foot">${tot} ${tot===1?"voto":"votos"} · ${ab?(e.meu?"Seu voto foi registrado. Toque em outro para trocar.":"Um voto por pessoa; dá para trocar até fechar."):"Votação encerrada."}</div></div>`;
  }).join("");
}
async function votar(ev){
  const b=ev.target.closest(".opt[data-enq]");if(!b)return;   // ▶ "Veja o lance" segue com o código do site
  ev.stopPropagation();ev.preventDefault();
  if(b.disabled)return;
  const e=ENQ.find(x=>x.id===b.dataset.enq),op=b.dataset.id;
  if(!e||e.meu===op)return;
  b.disabled=true;
  // trocar voto = update; primeiro voto = insert
  let{data:up,error}=await sb.from("votos").update({opcao_id:op}).eq("enquete_id",e.id).eq("membro_id",VOT.membro).select("opcao_id");
  if(!error&&!(up||[]).length)({error}=await sb.from("votos").insert({enquete_id:e.id,membro_id:VOT.membro,opcao_id:op,grupo_id:VOT.g}));
  if(error){b.disabled=false;alert("Não deu para votar: "+((error.message||"").includes("row-level")?"a votação já fechou.":error.message));return}
  e.meu=op;
  const{data:r}=await sb.rpc("resultado_enquete",{p_enquete:e.id});
  if(r){e.votos=Object.fromEntries(r.map(x=>[x.opcao_id,+x.votos]));e.total=r.length?+r[0].total:0}
  desenhaEnquetes();
}

// ---------- barra "Logado como…" ----------
const PAPEL={dono:"dono",moderador:"moderador",atleta:"atleta",visitante:"visitante"};
function barra(email,nome,papel){
  const b=document.createElement("div");
  b.className="cp-barra";
  b.innerHTML=`<div class="in">
    <span class="cp-quem">Logado como <b>${esc(nome||"Conta do grupo")}</b><small> · ${esc(email)}${papel!=="atleta"?` · ${PAPEL[papel]}`:""}</small></span>
    <span class="cp-acoes">${nome?`<a href="#meu-card" id="cp-meu">Meu card</a>`:""}<a href="entrar.html" id="cp-ped" hidden></a><a href="config.html">⚙ Configurações</a><button type="button" id="cp-sair">Sair</button></span></div>`;
  document.body.prepend(b);
  $("cp-sair").onclick=async()=>{await sb.auth.signOut();location.replace("entrar.html")};
}
async function pedidos(g){
  const{data}=await sb.rpc("pedidos_pendentes",{p_grupo:g});
  const n=(data||[]).length,a=$("cp-ped");
  a.hidden=!n;a.textContent=`Pedidos (${n})`;
}

// ---------- "Você": selo nos seus cards, linha destacada nas tabelas, atalho "Meu card" ----------
function voce(nome){
  const sel=`[data-a="${CSS.escape(nome)}"]`;
  const abrir=e=>{e.preventDefault();abrirPerfil(nome)};
  $("cp-meu").onclick=abrir;
  const nav=document.createElement("a");
  nav.href="#meu-card";nav.className="cp-nav-eu";nav.textContent="⭐ Meu card";nav.onclick=abrir;
  $("secnav").prepend(nav);
  let pend=false;
  const marca=()=>{pend=false;
    document.querySelectorAll(`.fig${sel}:not(.cp-eu)`).forEach(f=>{f.classList.add("cp-eu");
      f.setAttribute("aria-label",(f.getAttribute("aria-label")||nome)+" · você");
      f.insertAdjacentHTML("beforeend",'<span class="cp-voce" aria-hidden="true">Você</span>')});
    document.querySelectorAll(`tr ${sel}`).forEach(b=>b.closest("tr").classList.add("cp-eu-tr"));
    document.querySelectorAll(`.name${sel}:not(.cp-eu-nome)`).forEach(b=>b.classList.add("cp-eu-nome"));
  };
  marca();
  new MutationObserver(()=>{if(!pend){pend=true;requestAnimationFrame(marca)}}).observe(document.body,{childList:true,subtree:true});
  if(location.hash==="#meu-card"){history.replaceState(null,"",location.pathname);abrirPerfil(nome)}
}

iniciar().catch(e=>falhou((e&&e.message)||String(e)));
})();
