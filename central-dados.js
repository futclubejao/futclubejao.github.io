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
    .map(p=>{const c={kind:CP_PREMIO[p.tipo],semana:rod[p.rodada_id].data,atleta:atl[p.atleta_id].nome,votos:p.votos,enquete:p.enquete_id||null};
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
  if(!$("cp-carrega")){console.error("Central:",msg);return}   // erro depois de a página já ter aberto
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
  const{data:gs,error:eg}=await sb.from("grupos").select("id,nome,votos_abertos").eq("slug",GRUPO);
  if(eg)return falhou(eg.message);
  if(!gs.length)return paraEntrar();          // ainda não aprovado (ou de fora)
  const g=gs[0].id;
  const{data:eu}=await sb.from("membros").select("id,atleta_id,papel").eq("grupo_id",g).eq("user_id",session.user.id).eq("situacao","aprovado").maybeSingle();
  if(!eu)return paraEntrar();
  await sb.rpc("apurar_enquetes",{p_grupo:g});   // enquete que fechou vira prêmio (não duplica)

  const[atletas,perfis,rodadas,lances,lance_atletas,gols,fotos,premios]=await Promise.all([
    todos("atletas","id,nome,apelido,variacoes,dm,convidado",g),
    todos("perfis_visiveis","atleta_id,times,foto_path,posicao,pe,camisa,caracteristicas,sobre,redes,altura_cm,peso_kg,aniversario_dia,aniversario_mes",g),
    todos("rodadas","id,data,campeonato_id",g),
    todos("lances","id,rodada_id,codigo,n,jogo,tipo,tipo2,time,descricao,gol_atleta_id,assist_atleta_id,gol_desconhecido,assist_desconhecido,desconhecidos,thumb_path,duracao_s",g),
    todos("lance_atletas","lance_id,atleta_id,ordem",g),
    todos("gols_sem_video","rodada_id,tipo,atleta_id",g),
    todos("fotos","rodada_id,path,ordem",g),
    todos("premios","rodada_id,tipo,atleta_id,lance_id,votos,campeonato_id,enquete_id",g)]);
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
  CP.g=g;CP.eu=meu?meu.nome:null;CP.ficha=Object.fromEntries(perfis.map(p=>[(atletas.find(a=>a.id===p.atleta_id)||{}).nome,p]));
  registra("visita");

  // liga o site (mesmo código do index.html)
  const s=document.createElement("script");
  s.textContent=$("app-js").textContent;
  document.body.appendChild(s);
  document.body.classList.add("cp-pronto");
  $("cp-carrega").remove();

  ficha();compartilhar();janelaPremio();
  if(meu)voce(meu.nome);

  if(mod)pedidos(g);
  const ult=rodadas.filter(r=>!r.campeonato_id).sort((x,y)=>y.data.localeCompare(x.data))[0];
  if(ult)enquetes(g,eu.id,ult,gs[0].votos_abertos,Object.fromEntries(atletas.map(a=>[a.id,a.nome])));
}

// ---------- Enquetes de verdade (1 voto por pessoa, troca até fechar; parcial e total ao vivo) ----------
// Substitui as enquetes "de mentirinha" do index.html (voto só no aparelho). Mesmo visual.
const KIND={craque:"craque",golaco:"gol",murcha:"comico"};
let ENQ=[],VOT={g:null,membro:null};
async function enquetes(g,membro,rod,abertos,nomeAtl){
  VOT={g,membro,rod,abertos,nomeAtl};
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
  await quemVotou();
  window.renderPolls=desenhaEnquetes;
  desenhaEnquetes();
  $("polls").addEventListener("click",votar,true);
}
// Votos abertos (regra do grupo): cada opção mostra quem votou nela
async function quemVotou(){
  if(!VOT.abertos||!ENQ.length)return;
  const[v,m]=await Promise.all([sb.from("votos").select("opcao_id,membro_id").in("enquete_id",ENQ.map(e=>e.id)),
                               sb.from("membros").select("id,atleta_id").eq("grupo_id",VOT.g)]);
  const nome=Object.fromEntries((m.data||[]).map(x=>[x.id,VOT.nomeAtl[x.atleta_id]||"Conta do grupo"]));
  ENQ.forEach(e=>e.quem={});
  (v.data||[]).forEach(x=>{const e=ENQ.find(e=>e.opcoes.some(o=>o.id===x.opcao_id));if(e)(e.quem[x.opcao_id]=e.quem[x.opcao_id]||[]).push(nome[x.membro_id]||"?")});
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
    return `<div class="poll" data-kind="${e.kind}"><h3><span class="dot"></span>${esc(e.titulo.replace(/ · \d\d\/\d\d$/,""))} · ${fmt(VOT.rod.data)}</h3>
      <div class="opt-head"><span>${ab?(e.kind==="craque"?"Toque no atleta para votar":"Toque no lance para votar"):"Resultado final"}</span><span>${e.kind==="craque"?"":"Veja o lance ▾"}</span></div>
      ${e.opcoes.map((o,i)=>{const v=e.votos[o.id]||0,l=cand[i],nome=o.atleta_id?OPC.atleta[o.atleta_id]:null;
        const ganhou=!ab&&v>0&&v===max;
        const txt=nome?`${esc(nome)}<small>${pts[nome]||0} ${pts[nome]===1?"gol/assistência":"gols + assistências"} no domingo</small>`
                      :l?`${esc(l.atletas.join(", "))}<small>${esc(l.desc)}</small>`:"(lance removido)";
        const ver=l?`<a class="watch" href="#" data-kind="${e.kind}" data-i="${li++}" aria-label="Assistir: ${esc(l.desc)}">▶</a>`:"";
        return `<div class="opt-row"><button class="opt${e.meu===o.id?" voted":""}" data-kind="${e.kind}" data-id="${o.id}" data-enq="${e.id}" aria-pressed="${e.meu===o.id}"${ab?"":" disabled"}>
          <span class="bar" style="width:${tot?Math.round(v/tot*100):0}%"></span>
          <span class="t">${ganhou?"🏆 ":""}${txt}${e.quem&&e.quem[o.id]?votantes(e.quem[o.id]):""}</span><span class="n">${v}</span></button>${ver}</div>`}).join("")}
      <div class="foot">${tot} ${tot===1?"voto":"votos"} · ${ab?(e.meu?"Seu voto foi registrado. Toque em outro para trocar.":"Um voto por pessoa; dá para trocar até fechar."):"Votação encerrada."}${VOT.abertos&&tot?` · <button type="button" class="cp-vbt">Ver quem votou</button>`:""}</div></div>`;
  }).join("");
}
// Votos abertos: rodinhas (foto/iniciais) de até 5 votantes + "+N"; "Ver quem votou" mostra os nomes
function votantes(nomes){
  const L=nomes.slice().sort((a,b)=>a.localeCompare(b,"pt"));
  return `<span class="cp-vots" aria-label="Votaram: ${esc(L.join(", "))}">${L.slice(0,5).map(n=>av(n,"cp-vav")).join("")}${L.length>5?`<span class="cp-vmais">+${L.length-5}</span>`:""}</span>`
    +`<small class="cp-vnomes">${esc(L.join(", "))}</small>`;
}
async function votar(ev){
  const vb=ev.target.closest(".cp-vbt");
  if(vb){ev.stopPropagation();const p=vb.closest(".poll");p.classList.toggle("cp-vver");vb.textContent=p.classList.contains("cp-vver")?"Esconder nomes":"Ver quem votou";return}
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
  await quemVotou();
  desenhaEnquetes();
}

// ---------- atividade do membro (painel do Teste 1 mostra só totais) ----------
const CP={};
function registra(tipo,alvo,rede){try{sb.rpc("registrar",{p_grupo:CP.g,p_tipo:tipo,p_alvo:alvo||null,p_rede:rede||null}).then(()=>{},()=>{})}catch(e){}}

// ---------- ficha do atleta no perfil (o que ele preencheu em "Editar meu perfil") ----------
const POS_PE={direito:"Pé direito",esquerdo:"Pé esquerdo",ambos:"Os dois pés"};
function ficha(){
  const orig=window.abrirPerfil;
  window.abrirPerfil=a=>{orig(a);
    const f=CP.ficha[a]||{},box=document.getElementById("pf-tiles");
    document.getElementById("cp-ficha")?.remove();
    const itens=[f.posicao&&`⚽ ${esc(f.posicao)}`,f.pe&&`🦶 ${POS_PE[f.pe]||esc(f.pe)}`,f.camisa!=null&&`👕 ${f.camisa}`,
      f.altura_cm&&`📏 ${(f.altura_cm/100).toFixed(2).replace(".",",")} m`,f.peso_kg&&`⚖️ ${String(f.peso_kg).replace(".",",")} kg`,
      f.aniversario_dia&&f.aniversario_mes&&`🎂 ${String(f.aniversario_dia).padStart(2,"0")}/${String(f.aniversario_mes).padStart(2,"0")}`].filter(Boolean);
    const r=f.redes||{},links=[r.instagram&&`<a href="https://instagram.com/${encodeURIComponent(r.instagram.replace(/^@/,""))}" target="_blank" rel="noopener">Instagram @${esc(r.instagram.replace(/^@/,""))}</a>`,
      r.tiktok&&`<a href="https://www.tiktok.com/@${encodeURIComponent(r.tiktok.replace(/^@/,""))}" target="_blank" rel="noopener">TikTok @${esc(r.tiktok.replace(/^@/,""))}</a>`].filter(Boolean);
    const eu=a===CP.eu;
    if(!itens.length&&!(f.caracteristicas||[]).length&&!f.sobre&&!links.length&&!eu)return;
    box.insertAdjacentHTML("afterend",`<div id="cp-ficha">
      ${itens.length?`<p class="cp-f-itens">${itens.join("<span>·</span>")}</p>`:""}
      ${(f.caracteristicas||[]).length?`<p class="cp-f-chips">${f.caracteristicas.map(c=>`<span>${esc(c)}</span>`).join("")}</p>`:""}
      ${f.sobre?`<p class="cp-f-sobre">${esc(f.sobre)}</p>`:""}
      ${links.length?`<p class="cp-f-redes">${links.join(" · ")}</p>`:""}
      ${eu?`<a class="cp-f-editar" href="perfil.html">✏️ Editar meu perfil</a>`:""}</div>`);
  };
}

// ---------- card de PRÊMIO: toque abre a janela com o card grande + resumo (data, votação, votos, quem votou, total de prêmios) ----------
// Vale para os prêmios já apurados: Destaques da rodada e "Cards conquistados" do perfil.
const TIER_KIND={craque:"craque",esmeralda:"gol",murcha:"comico"};
const NOME_PREMIO={craque:"🏆 Craque da rodada",gol:"🌟 Golaço da rodada",comico:"😂 Lance da Resenha"};
function janelaPremio(){
  const m=document.createElement("div");m.id="cp-premio";m.hidden=true;
  m.innerHTML=`<div class="cp-pr-box" role="dialog" aria-modal="true" aria-labelledby="cp-pr-t"><button class="cp-pr-x" type="button" aria-label="Fechar">✕</button><div id="cp-pr-corpo"></div></div>`;
  document.body.appendChild(m);
  const fecha=()=>{m.hidden=true;if(document.getElementById("perfil").hidden)document.body.style.overflow=""};
  m.addEventListener("click",e=>{if(e.target===m||e.target.closest(".cp-pr-x"))fecha();
    const v=e.target.closest(".cp-pr-ver");if(v){fecha();const l=byIdCP[v.dataset.id];if(l){mLista=[l];abrir(0)}}
    const pf=e.target.closest(".cp-pr-perfil");if(pf){fecha();abrirPerfil(pf.dataset.a)}});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!m.hidden)fecha()});
  // Destaques da rodada
  document.getElementById("cards-rodada").addEventListener("click",e=>{
    const f=e.target.closest(".fig[data-a]");if(!f)return;
    const kind=Object.keys(TIER_KIND).find(t=>f.classList.contains(t));if(!kind)return;
    const sem=document.getElementById("f-rod").value||ultima;
    const c=CAMPEOES.find(x=>x.kind===TIER_KIND[kind]&&x.semana===sem&&ganhador(x)===f.dataset.a);
    if(!c)return;e.stopPropagation();abre(c);
  },true);
  // "Cards conquistados" no perfil (mesma ordem do perfil: mais recente primeiro)
  document.getElementById("pf-hist").addEventListener("click",e=>{
    const ph=e.target.closest(".ph");if(!ph)return;
    const a=document.getElementById("pf-nome").textContent;
    const meus=CAMPEOES.filter(c=>ganhador(c)===a).sort((x,y)=>y.semana.localeCompare(x.semana));
    const c=meus[[...ph.parentNode.children].indexOf(ph)];if(c)abre(c);
  });
  async function abre(c){
    const a=ganhador(c),l=c.id?byIdCP[c.id]:null;
    const meus=CAMPEOES.filter(x=>ganhador(x)===a),qt=k=>meus.filter(x=>x.kind===k).length;
    const card=figurinha(a,{...PREMIO_CARD[c.kind],ate:c.semana}).replace('<button type="button"','<div role="img"').replace(/<\/button>$/,"</div>");
    document.getElementById("cp-pr-corpo").innerHTML=`<div class="cp-pr-card">${card}</div>
      <h3 id="cp-pr-t">${NOME_PREMIO[c.kind]}</h3>
      <p class="cp-pr-quem">${esc(a)}</p>
      <dl class="cp-pr-dl">
        <dt>Jogo</dt><dd>${new Date(c.semana+"T12:00").toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"2-digit",year:"numeric"})}</dd>
        <dt>Votação</dt><dd id="cp-pr-vot">…</dd>
        <dt>Votos</dt><dd id="cp-pr-votos">${c.votos!=null?c.votos:"—"}</dd>
        ${l?`<dt>Lance</dt><dd>${esc(l.desc)} <button type="button" class="cp-pr-ver" data-id="${l.id}">▶ ver</button></dd>`:""}
      </dl>
      <div id="cp-pr-quemvotou"></div>
      <p class="cp-pr-total">Prêmios de ${esc(a)}: 🏆 Craque <b>${qt("craque")}×</b> · 🌟 Golaço <b>${qt("gol")}×</b> · 😂 Resenha <b>${qt("comico")}×</b></p>
      <button type="button" class="cp-pr-perfil" data-a="${esc(a)}">Ver o perfil de ${esc(a)}</button>`;
    m.className="cp-pr-"+({craque:"craque",gol:"esmeralda",comico:"murcha"}[c.kind]);
    m.hidden=false;document.body.style.overflow="hidden";m.querySelector(".cp-pr-x").focus();
    if(!c.enquete){document.getElementById("cp-pr-vot").textContent="—";return}
    const[{data:e},{data:r},{data:ops}]=await Promise.all([
      sb.from("enquetes").select("abre_em,fecha_em").eq("id",c.enquete).maybeSingle(),
      sb.rpc("resultado_enquete",{p_enquete:c.enquete}),
      sb.from("enquete_opcoes").select("id,lance_id,atleta_id").eq("enquete_id",c.enquete)]);
    const d=x=>new Date(x).toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"})+" "+new Date(x).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
    if(e)document.getElementById("cp-pr-vot").textContent=`${d(e.abre_em)} até ${d(e.fecha_em)}`;
    const total=r&&r.length?+r[0].total:0;
    if(total)document.getElementById("cp-pr-votos").textContent=`${c.votos} de ${total} (${Math.round(c.votos/total*100)}%)`;
    // quem votou: só com "votos abertos" (o banco só devolve os votos dos outros nesse caso)
    const lids=(ops||[]).map(o=>o.lance_id).filter(Boolean);
    const{data:cods}=lids.length?await sb.from("lances").select("id,codigo").in("id",lids):{data:[]};
    const cod=Object.fromEntries((cods||[]).map(x=>[x.id,x.codigo]));
    const venc=(ops||[]).find(o=>c.kind==="craque"?OPC_ATL(o,a):o.lance_id&&cod[o.lance_id]===c.id)||null;
    const box=document.getElementById("cp-pr-quemvotou");
    if(!VOT.abertos){box.innerHTML=`<p class="cp-pr-obs">Voto secreto: só aparece o total.</p>`;return}
    if(!venc)return;
    const[{data:vs},{data:mb}]=await Promise.all([sb.from("votos").select("membro_id").eq("opcao_id",venc.id),
      sb.from("membros").select("id,atleta_id").eq("grupo_id",CP.g)]);
    const nome=Object.fromEntries((mb||[]).map(x=>[x.id,VOT.nomeAtl[x.atleta_id]||"Conta do grupo"]));
    const L=(vs||[]).map(v=>nome[v.membro_id]||"?");
    if(L.length)box.innerHTML=`<p class="cp-pr-obs">Votaram em ${esc(a)}:</p>${votantes(L).replace('class="cp-vnomes"','class="cp-vnomes cp-pr-nomes"')}`;
  }
  const OPC_ATL=(o,a)=>o.atleta_id&&VOT.nomeAtl&&VOT.nomeAtl[o.atleta_id]===a;
}

// ---------- compartilhar: WhatsApp (link), Instagram/TikTok (o vídeo), baixar, copiar link ----------
function compartilhar(){
  const abr=window.abrir;
  window.abrir=i=>{abr(i);const l=mLista[i];if(l)registra("video",l.id)};
  const m=document.createElement("div");m.id="cp-sheet";m.hidden=true;
  m.innerHTML=`<div class="cp-sh-box" role="dialog" aria-modal="true" aria-labelledby="cp-sh-t">
    <h3 id="cp-sh-t">Compartilhar o lance</h3><p id="cp-sh-desc"></p>
    <button data-r="whatsapp">💬 WhatsApp <small>manda o link (só a turma abre)</small></button>
    <button data-r="instagram">📸 Instagram <small>manda o vídeo</small></button>
    <button data-r="tiktok">🎵 TikTok <small>manda o vídeo</small></button>
    <button data-r="baixar">⬇️ Baixar o vídeo</button>
    <button data-r="link">🔗 Copiar o link</button>
    <p class="cp-sh-msg" role="status"></p>
    <button class="cp-sh-x" data-r="fechar">Fechar</button></div>`;
  document.body.appendChild(m);
  let atual=null;
  const msg=t=>m.querySelector(".cp-sh-msg").textContent=t;
  document.addEventListener("click",e=>{const b=e.target.closest(".cp-share");if(!b)return;e.preventDefault();e.stopPropagation();
    atual=byIdCP[b.dataset.id||(mAtual&&mAtual.id)];if(!atual)return;
    document.getElementById("cp-sh-desc").textContent=`${atual.atletas.join(", ")} — ${atual.desc}`;msg("");m.hidden=false},true);
  m.addEventListener("click",async e=>{
    if(e.target===m){m.hidden=true;return}
    const b=e.target.closest("button[data-r]");if(!b)return;const r=b.dataset.r;
    if(r==="fechar"){m.hidden=true;return}
    const l=atual,link=`${location.origin}${location.pathname}#${l.id}`,txt=`⚽ ${l.desc} (${l.atletas.join(", ")})
Veja na Central da Pelada: ${link}`;
    if(r==="whatsapp"){registra("compartilhar",l.id,r);window.open("https://wa.me/?text="+encodeURIComponent(txt),"_blank","noopener");return}
    if(r==="link"){registra("compartilhar",l.id,r);try{await navigator.clipboard.writeText(link);msg("Link copiado!")}catch(err){msg(link)}return}
    msg("Preparando o vídeo…");b.disabled=true;
    try{
      const{data:{session}}=await sb.auth.getSession();
      const resp=await fetch("https://fvxecqjiyjstyacqrumr.supabase.co/functions/v1/video",{method:"POST",
        headers:{"Content-Type":"application/json",apikey:"sb_publishable_le3V4al6wKdsfPZ4DXHKZg_cXtEP3DS",Authorization:"Bearer "+session.access_token},
        body:JSON.stringify({codigo:l.id,arquivo:true})});
      if(!resp.ok)throw new Error("sem acesso");
      const arq=new File([await resp.blob()],`lance-${l.id}.mp4`,{type:"video/mp4"});
      registra("compartilhar",l.id,r);
      if(r!=="baixar"&&navigator.canShare&&navigator.canShare({files:[arq]})){
        await navigator.share({files:[arq],text:`⚽ ${l.desc}`});msg(`Escolha o ${r==="instagram"?"Instagram":"TikTok"} na lista.`);
      }else{
        const u=URL.createObjectURL(arq),a=document.createElement("a");a.href=u;a.download=arq.name;document.body.appendChild(a);a.click();a.remove();
        setTimeout(()=>URL.revokeObjectURL(u),60000);
        msg(r==="baixar"?"Vídeo baixado.":`Vídeo baixado. Abra o ${r==="instagram"?"Instagram":"TikTok"} e poste da galeria.`);
      }
    }catch(err){if(err.name!=="AbortError")msg("Não deu para preparar o vídeo agora. Tente de novo.")}
    b.disabled=false;
  });
}

// ---------- barra "Logado como…" ----------
const PAPEL={dono:"dono",moderador:"moderador",atleta:"atleta",visitante:"visitante"};
function barra(email,nome,papel){
  const b=document.createElement("div");
  b.className="cp-barra";
  b.innerHTML=`<div class="in">
    <span class="cp-quem">Logado como <b>${esc(nome||"Conta do grupo")}</b><small> · ${esc(email)}${papel!=="atleta"?` · ${PAPEL[papel]}`:""}</small></span>
    <span class="cp-acoes">${nome?`<a href="#meu-card" id="cp-meu">Meu card</a>`:""}<a href="entrar.html" id="cp-sino" class="cp-sino" hidden aria-label="Pendências">🔔<span class="cp-sino-n" id="cp-sino-n"></span></a>${papel==="dono"||papel==="moderador"?`<a href="painel.html">📊 Painel</a>`:""}<a href="config.html">⚙ Configurações</a><button type="button" id="cp-sair">Sair</button></span></div>`;
  document.body.prepend(b);
  const fx=document.createElement("a");fx.id="cp-faixa";fx.href="entrar.html";fx.hidden=true;b.after(fx);
  $("cp-sair").onclick=async()=>{await sb.auth.signOut();location.replace("entrar.html")};
}
// Pendências do moderador: sininho com número na barra + faixa chamativa no topo.
// Confere de novo a cada minuto e quando a pessoa volta para a aba.
async function pedidos(g){
  const confere=async()=>{
    const{data}=await sb.rpc("pedidos_pendentes",{p_grupo:g});
    const L=data||[],n=L.length;
    $("cp-sino").hidden=!n;$("cp-sino-n").textContent=n;
    $("cp-sino").setAttribute("aria-label",n?`${n} ${n===1?"pendência":"pendências"}`:"Pendências");
    const nomes=L.slice(0,2).map(p=>(p.atleta_nome||p.nome_informado||p.conta_nome||"alguém").split(" ")[0]);
    $("cp-faixa").hidden=!n;
    $("cp-faixa").innerHTML=n?`🙋 <b>${n===1?`${esc(nomes[0])} pediu`:`${n} pedidos`}</b> para entrar na Central${n>2?"":n===2?` (${esc(nomes.join(" e "))})`:""} <span>Aprovar →</span>`:"";
  };
  await confere();
  setInterval(confere,60000);
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)confere()});
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
