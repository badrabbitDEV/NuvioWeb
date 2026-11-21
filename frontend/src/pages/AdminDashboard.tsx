import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, ArrowLeft, BarChart3, CheckCircle2, Clock3, Database, KeyRound, LogOut, RefreshCw, ShieldCheck, Users, Video, Network, Eye, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, ApiClientError } from '../lib/api';

type Overview = Awaited<ReturnType<typeof api.adminOverview>>;
const KEY_SLOT = 'nuvio-admin-session-key';
const number = (value:number|undefined) => new Intl.NumberFormat('pt-BR').format(value ?? 0);
const dateTime = (value:string) => new Date(value).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});

function StatCard({label,value,detail,icon:Icon}:{label:string;value:string;detail:string;icon:typeof Activity}) {
  return <article className="admin-stat"><div className="admin-stat-icon"><Icon size={18}/></div><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

export default function AdminDashboard(){
  const [key,setKey]=useState(()=>sessionStorage.getItem(KEY_SLOT)??'');
  const [authenticated,setAuthenticated]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [range,setRange]=useState<'24h'|'7d'|'30d'>('7d');
  const [overview,setOverview]=useState<Overview|null>(null);
  const [users,setUsers]=useState<Awaited<ReturnType<typeof api.adminUsers>>['users']>([]);
  const [eventRows,setEventRows]=useState<Awaited<ReturnType<typeof api.adminEvents>>['events']>([]);
  const [health,setHealth]=useState<{ok:boolean;features?:Record<string,boolean>}|null>(null);

  const refresh=useCallback(async(currentKey=key,currentRange=range)=>{
    if(!currentKey)return;
    setLoading(true);setError('');
    try{
      const [data,userData,eventData,healthData]=await Promise.all([api.adminOverview(currentKey,currentRange),api.adminUsers(currentKey),api.adminEvents(currentKey),api.health()]);
      setOverview(data);setUsers(userData.users);setEventRows(eventData.events);setHealth(healthData);setAuthenticated(true);
    }catch(cause){
      const message=cause instanceof ApiClientError?cause.message:'Não foi possível atualizar o painel.';
      setError(message);
      if(cause instanceof ApiClientError&&cause.status===401){setAuthenticated(false);sessionStorage.removeItem(KEY_SLOT);}
    }finally{setLoading(false);}
  },[key,range]);

  async function login(event:React.FormEvent){
    event.preventDefault();setLoading(true);setError('');
    try{await api.adminVerify(key);sessionStorage.setItem(KEY_SLOT,key);setAuthenticated(true);await refresh(key,range);}
    catch(cause){setError(cause instanceof ApiClientError?cause.message:'Falha de autenticação.');setAuthenticated(false);}
    finally{setLoading(false);}
  }
  function logout(){sessionStorage.removeItem(KEY_SLOT);setAuthenticated(false);setOverview(null);setUsers([]);setEventRows([]);setKey('');}
  function exportEvents(){
    const rows=[['event_name','edition','route','media_type','provider','created_at'],...eventRows.map(event=>[event.event_name,event.edition,event.route??'',event.media_type??'',event.provider??'',event.created_at])];
    const csv=rows.map(row=>row.map(value=>'"'+String(value).replace(/"/g,'""')+'"').join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download='nuvio-events-'+new Date().toISOString().slice(0,10)+'.csv';link.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  useEffect(()=>{if(key&&sessionStorage.getItem(KEY_SLOT)===key){void refresh(key,range);}},[range]);
  useEffect(()=>{if(!authenticated)return;const id=window.setInterval(()=>void refresh(key,range),45_000);return()=>window.clearInterval(id);},[authenticated,key,range,refresh]);

  const maxEvents=useMemo(()=>Math.max(1,...(overview?.timeline??[]).map(row=>row.events)),[overview]);
  const features=health?.features??{};

  if(!authenticated)return <main className="admin-login-wrap"><form className="admin-login panel" onSubmit={login}>
    <Link className="back-link" to="/"><ArrowLeft size={15}/> Voltar ao Nuvio</Link>
    <div className="admin-login-mark"><ShieldCheck size={25}/></div><span className="eyebrow">ÁREA RESTRITA</span><h1>Administração</h1><p>O painel usa uma chave administrativa validada exclusivamente pela API da Render. A chave fica somente nesta sessão do navegador.</p>
    <label htmlFor="admin-key">ADMIN_API_KEY</label><div className="admin-key-input"><KeyRound size={17}/><input id="admin-key" type="password" required minLength={32} autoComplete="current-password" placeholder="Cole a chave administrativa" value={key} onChange={event=>setKey(event.target.value)}/></div>
    {error&&<div className="notice notice-warning"><AlertTriangle size={17}/>{error}</div>}
    <button className="button-primary admin-submit" disabled={loading||key.length<32}>{loading?<RefreshCw className="spin" size={16}/>:<ShieldCheck size={16}/>} Entrar no dashboard</button>
    <small>Não coloque esta chave em variáveis VITE_ nem em arquivos do frontend.</small>
  </form></main>;

  return <main className="admin-page">
    <header className="admin-header"><div><Link className="back-link" to="/"><ArrowLeft size={15}/> Voltar ao aplicativo</Link><span className="eyebrow">NUVIO WEB · CONTROLE DO SERVIÇO</span><h1>Dashboard administrativo</h1><p>Indicadores agregados, atividade da aplicação e estado da API.</p></div><div className="admin-header-actions"><select value={range} onChange={event=>setRange(event.target.value as typeof range)}><option value="24h">Últimas 24 horas</option><option value="7d">Últimos 7 dias</option><option value="30d">Últimos 30 dias</option></select><button className="icon-button" onClick={()=>void refresh()} disabled={loading} title="Atualizar"><RefreshCw size={17} className={loading?'spin':''}/></button><button className="icon-button" onClick={logout} title="Sair"><LogOut size={17}/></button></div></header>
    {error&&<div className="notice notice-warning"><AlertTriangle size={16}/>{error}</div>}
    <section className="admin-stats-grid">
      <StatCard label="Contas registradas" value={number(overview?.users.total)} detail={`+${number(overview?.users.new_24h)} nas últimas 24h`} icon={Users}/>
      <StatCard label="Sessões ativas" value={number(overview?.analytics.active_sessions)} detail="Atividade nos últimos 15 minutos" icon={Activity}/>
      <StatCard label="Visualizações" value={number(overview?.analytics.page_views)} detail={`${number(overview?.analytics.sessions)} sessões no período`} icon={Eye}/>
      <StatCard label="Reproduções iniciadas" value={number(overview?.analytics.player_starts)} detail={`${number(overview?.analytics.p2p_starts)} sessões P2P iniciadas`} icon={Video}/>
    </section>
    <section className="panel admin-panel admin-edition-panel"><div className="admin-panel-head"><div><span className="eyebrow">VERSÕES</span><h2>Uso por edição</h2></div><Sparkles size={19}/></div><div className="admin-edition-split">{(['normal','enhanced'] as const).map(name=>{const row=overview?.editions?.find(item=>item.edition===name);return <div className={`admin-edition-card ${name}`} key={name}><span>{name==='normal'?'Nuvio Normal':'Nuvio Enhanced'}</span><strong>{number(row?.events)}</strong><small>{number(row?.page_views)} visualizações · {number(row?.player_starts)} reproduções · {number(row?.p2p_starts)} P2P</small></div>;})}</div></section>
    <section className="admin-main-grid">
      <article className="panel admin-panel"><div className="admin-panel-head"><div><span className="eyebrow">ATIVIDADE</span><h2>Eventos ao longo do tempo</h2></div><BarChart3 size={19}/></div>
        <div className="admin-chart" role="img" aria-label="Gráfico de eventos agregados">{(overview?.timeline??[]).length?overview!.timeline.map((point,index)=><div className="admin-chart-column" key={`${point.bucket}-${index}`} title={`${number(point.events)} eventos`}><div className="admin-chart-bar" style={{height:`${Math.max(4,point.events/maxEvents*100)}%`}}/><small>{new Date(point.bucket).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}</small></div>):<div className="admin-no-data">Nenhum evento registrado neste período. Ative a telemetria opcional nas configurações do app.</div>}</div>
      </article>
      <article className="panel admin-panel"><div className="admin-panel-head"><div><span className="eyebrow">INFRAESTRUTURA</span><h2>Estado dos serviços</h2></div><Database size={19}/></div>
        <div className="admin-service-row"><span>API Render</span><b className={health?.ok?'healthy':'unhealthy'}>{health?.ok?'Online':'Indisponível'}</b></div>
        <div className="admin-service-row"><span>PostgreSQL</span><b className={overview?.database==='connected'?'healthy':'unhealthy'}>{overview?.database==='connected'?'Conectado':'Sem conexão'}</b></div>
        {Object.entries(features).map(([name,enabled])=><div className="admin-service-row" key={name}><span>{name}</span><b className={enabled?'healthy':'service-disabled'}>{enabled?'Ativo':'Não configurado'}</b></div>)}
        <small className="admin-updated"><Clock3 size={12}/> Atualizado {overview?.generatedAt?dateTime(overview.generatedAt):'—'} · atualização automática a cada 45 s</small>
      </article>
    </section>
    <section className="admin-main-grid">
      <article className="panel admin-panel"><div className="admin-panel-head"><div><span className="eyebrow">NAVEGAÇÃO</span><h2>Páginas mais acessadas</h2></div><Eye size={19}/></div>
        {(overview?.topRoutes??[]).length?overview!.topRoutes.map(row=><div className="admin-route-row" key={row.route}><code>{row.route}</code><strong>{number(row.views)}</strong><div className="admin-route-track"><i style={{width:`${Math.max(2,row.views/Math.max(1,overview!.topRoutes[0].views)*100)}%`}}/></div></div>):<p className="admin-muted">Sem dados para este período.</p>}
      </article>
      <article className="panel admin-panel"><div className="admin-panel-head"><div><span className="eyebrow">CONTAS</span><h2>Registros recentes</h2></div><Users size={19}/></div>
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Referência</th><th>Criada em</th></tr></thead><tbody>{users.map(user=><tr key={user.user_ref}><td><code>{user.user_ref}…</code></td><td>{dateTime(user.created_at)}</td></tr>)}</tbody></table></div>
        <small className="admin-muted">IDs parcialmente ocultos. O dashboard não exibe e-mails nem endereços IP.</small>
      </article>
    </section>
    <section className="panel admin-panel"><div className="admin-panel-head"><div><span className="eyebrow">LOG DE EVENTOS</span><h2>Atividade recente</h2></div><div className="admin-header-actions"><button className="button-secondary small-button" onClick={exportEvents} disabled={!eventRows.length}>Exportar CSV</button><Network size={19}/></div></div>
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Evento</th><th>Versão</th><th>Área</th><th>Tipo</th><th>Data</th></tr></thead><tbody>{eventRows.slice(0,50).map((event,index)=><tr key={`${event.created_at}-${index}`}><td>{event.event_name}</td><td><span className={`admin-edition ${event.edition}`}>{event.edition}</span></td><td>{event.route??event.provider??'—'}</td><td>{event.media_type??'—'}</td><td>{dateTime(event.created_at)}</td></tr>)}</tbody></table></div>
      {!eventRows.length&&<p className="admin-muted">O log ainda está vazio. A telemetria é opcional e precisa ser habilitada pelos usuários.</p>}
    </section>
    <footer className="admin-footer"><ShieldCheck size={14}/> Telemetria agregada e com opt-in. Não coleta IP, e-mail, título pesquisado, IDs de mídia, URLs de streams ou tokens.</footer>
  </main>;
}
