import { useMemo, useState } from 'react';
import { FileUp, Link2, RefreshCw, Tv, Play, Radio, CalendarDays, Server } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useStoredState } from '../lib/storage';
import { useApp } from '../lib/context';
import { api, ApiClientError } from '../lib/api';
import { currentProgramme, filterChannels, getChannelGroups, parseM3U, parseXmltv, readXmltvFile, validatePlayableChannelUrl } from '../features/live';
import type { EpgProgramme, LiveChannel } from '../types';
import { trackEvent } from '../lib/analytics';


export default function LiveTV() {
  const navigate = useNavigate();
  const { activeProfileId, edition, settings } = useApp();
  const [channels, setChannels] = useStoredState<LiveChannel[]>(`nuvio-web:${activeProfileId}:live-channels`, []);
  const [epg, setEpg] = useStoredState<EpgProgramme[]>(`nuvio-web:${activeProfileId}:live-epg`, []);
  const [sourceUrl, setSourceUrl] = useState('');
  const [epgUrl, setEpgUrl] = useState('');
  const [xtreamHost, setXtreamHost] = useState('');
  const [xtreamUser, setXtreamUser] = useState('');
  const [xtreamPassword, setXtreamPassword] = useState('');
  const [stalkerPortal, setStalkerPortal] = useState('');
  const [stalkerMac, setStalkerMac] = useState('');
  const [stalkerToken, setStalkerToken] = useState('');
  const [stalkerEpgBusy, setStalkerEpgBusy] = useState('');
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('Todos');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const groups = useMemo(() => getChannelGroups(channels), [channels]);
  const filtered = useMemo(() => filterChannels(channels, query, group), [channels, group, query]);
  const now = Date.now();
  const getCurrentProgramme = (channelId: string) => currentProgramme(epg, channelId, now);

  async function importPlaylist(file: File) {
    setBusy(true); setMessage('');
    try { const parsed = parseM3U(await file.text()); setChannels(parsed); setMessage(`${parsed.length} canais importados.`); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Falha ao importar a playlist.'); }
    finally { setBusy(false); }
  }

  async function fetchPlaylist(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    try { const result = await api.fetchLiveText(sourceUrl, 'm3u'); const parsed = parseM3U(result.content); setChannels(parsed); setMessage(`${parsed.length} canais carregados da URL.`); }
    catch (error) { setMessage(error instanceof ApiClientError ? error.message : 'Falha ao carregar playlist.'); }
    finally { setBusy(false); }
  }

  async function connectXtream(loadGuide = false) {
    setBusy(true); setMessage('');
    try {
      const base = new URL(xtreamHost.trim());
      if (base.protocol !== 'https:' && base.hostname !== 'localhost' && base.hostname !== '127.0.0.1') throw new Error('Use HTTPS para conexões remotas.');
      const params = new URLSearchParams({ username: xtreamUser.trim(), password: xtreamPassword, type: 'm3u_plus', output: 'ts' });
      const playlistUrl = new URL('/get.php', base);
      playlistUrl.search = params.toString();
      const playlist = await api.fetchLiveText(playlistUrl.toString(), 'm3u');
      const parsed = parseM3U(playlist.content);
      setChannels(parsed);
      if (loadGuide) {
        const guideUrl = new URL('/xmltv.php', base); guideUrl.search = new URLSearchParams({ username: xtreamUser.trim(), password: xtreamPassword }).toString();
        const guide = await api.fetchLiveText(guideUrl.toString(), 'xmltv');
        const programmes = parseXmltv(guide.content); setEpg(programmes);
        setMessage(`${parsed.length} canais e ${programmes.length} programas importados do Xtream.`);
      } else setMessage(`${parsed.length} canais importados do Xtream. A programação pode ser carregada separadamente.`);
    } catch (error) { setMessage(error instanceof ApiClientError ? error.message : error instanceof Error ? error.message : 'Falha ao conectar Xtream.'); }
    finally { setBusy(false); }
  }


  function unwrapStalkerData(value: unknown): Record<string,unknown> | unknown[] {
    if (value && typeof value === 'object' && 'data' in value) {
      const nested = (value as Record<string,unknown>).data;
      if (Array.isArray(nested) || (nested && typeof nested === 'object')) return nested as Record<string,unknown> | unknown[];
    }
    return value as Record<string,unknown> | unknown[];
  }

  async function connectStalker() {
    setBusy(true); setMessage('');
    try {
      const portal = new URL(stalkerPortal.trim());
      if (portal.protocol !== 'https:' && portal.hostname !== 'localhost') throw new Error('O portal Stalker precisa usar HTTPS.');
      if (!/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(stalkerMac.trim())) throw new Error('Informe o endereço MAC no formato AA:BB:CC:DD:EE:FF.');
      const handshake = await api.stalker({portalUrl:portal.toString(),mac:stalkerMac.trim(),action:'handshake'});
      const handshakeData = unwrapStalkerData(handshake.data) as Record<string,unknown>;
      const token = String(handshakeData?.token ?? (handshake.payload as Record<string,unknown> | undefined)?.token ?? '');
      if (!token) throw new Error('O portal não devolveu um token de sessão. Confira o endereço do portal e o MAC autorizado.');
      setStalkerToken(token);
      const [profile,genres,channelResult] = await Promise.all([
        api.stalker({portalUrl:portal.toString(),mac:stalkerMac.trim(),token,action:'profile'}),
        api.stalker({portalUrl:portal.toString(),mac:stalkerMac.trim(),token,action:'genres'}),
        api.stalker({portalUrl:portal.toString(),mac:stalkerMac.trim(),token,action:'channels'}),
      ]);
      const rawChannels = unwrapStalkerData(channelResult.data);
      const list = Array.isArray(rawChannels) ? rawChannels : [];
      const rawGenres=unwrapStalkerData(genres.data);
      const genreRows=Array.isArray(rawGenres)?rawGenres:[];
      const genreNames=new Map(genreRows.flatMap(item=>{if(!item||typeof item!=='object')return[];const row=item as Record<string,unknown>;const key=String(row.id??row.genre_id??'');const value=String(row.title??row.name??row.value??'');return key&&value?[[key,value] as [string,string]]:[];}));
      const imported: LiveChannel[] = list.flatMap((item,index) => {
        if (!item || typeof item !== 'object') return [];
        const row = item as Record<string,unknown>;
        const cmd = String(row.cmd ?? row.url ?? '');
        const name = String(row.name ?? row.title ?? `Canal ${index+1}`);
        const id = String(row.id ?? row.ch_id ?? `${name}-${index}`);
        if (!cmd) return [];
        return [{id,name,url:'',logo:String(row.logo ?? row.icon ?? '')||undefined,group:genreNames.get(String(row.tv_genre_id??row.genre_id??''))??String(row.genre??'TV ao vivo'),tvgId:id,provider:'stalker',stalkerCmd:cmd,stalkerChannelId:id,stalkerPortalUrl:portal.toString(),stalkerMac:stalkerMac.trim()}];
      });
      setChannels(imported);
      const profileData=unwrapStalkerData(profile.data) as Record<string,unknown>;
      const genreCount=genreRows.length;
      const profileName=String(profileData?.name ?? profileData?.login ?? 'portal');
      setMessage(`${imported.length} canais importados do Stalker (${genreCount} categorias · ${profileName}). A sessão fica ativa somente nesta aba.`);
    } catch (error) { setStalkerToken(''); setMessage(error instanceof Error?error.message:'Falha ao conectar ao Stalker Portal.'); }
    finally { setBusy(false); }
  }

  async function playChannel(channel: LiveChannel) {
    setMessage('');
    if (settings.analyticsOptIn) trackEvent('live_tv_opened', edition, { route: '/live', mediaType: 'channel', provider: channel.provider ?? 'playlist' });
    try {
      if (channel.provider === 'stalker') {
        if (!stalkerToken || !channel.stalkerPortalUrl || !channel.stalkerMac || !channel.stalkerCmd) throw new Error('Reconecte o Stalker Portal para abrir este canal.');
        setBusy(true);
        const result = await api.stalker({portalUrl:channel.stalkerPortalUrl,mac:channel.stalkerMac,token:stalkerToken,action:'create_link',cmd:channel.stalkerCmd});
        if (!result.streamUrl) throw new Error('O portal não devolveu uma URL de reprodução reconhecida.');
        const target=new URL(result.streamUrl);
        if (target.protocol !== 'https:') throw new Error('O portal devolveu uma URL HTTP. Este player em HTTPS só aceita fontes HTTPS.');
        navigate('/watch',{state:{stream:{url:target.toString(),name:channel.name,addonName:'Stalker Portal'},mediaTitle:channel.name,mediaKey:`live:stalker:${channel.id}`}});
      } else {
        const safeUrl = validatePlayableChannelUrl(channel.url);
        navigate('/watch',{state:{stream:{url:safeUrl,name:channel.name,addonName:channel.provider==='xtream'?'Xtream':'Playlist M3U',mimeType:safeUrl.includes('.m3u8')?'application/vnd.apple.mpegurl':undefined},mediaTitle:channel.name,mediaKey:`live:${channel.id}`}});
      }
    } catch (error) { setMessage(error instanceof Error?error.message:'Não foi possível abrir o canal.'); }
    finally { setBusy(false); }
  }

  async function loadStalkerEpg(channel: LiveChannel) {
    if (!stalkerToken || !channel.stalkerPortalUrl || !channel.stalkerMac || !channel.stalkerChannelId) return;
    setStalkerEpgBusy(channel.id); setMessage('');
    try {
      const result=await api.stalker({portalUrl:channel.stalkerPortalUrl,mac:channel.stalkerMac,token:stalkerToken,action:'epg',channelId:channel.stalkerChannelId});
      const raw=unwrapStalkerData(result.data);
      const rows=Array.isArray(raw)?raw:[];
      const mapped:EpgProgramme[]=rows.flatMap((entry)=>{if(!entry||typeof entry!=='object')return[];const row=entry as Record<string,unknown>;const startValue=row.start??row.start_timestamp??row.time??'';const stopValue=row.stop??row.stop_timestamp??'';const start=typeof startValue==='number'?startValue*1000:Date.parse(String(startValue));const stop=typeof stopValue==='number'?stopValue*1000:Date.parse(String(stopValue));const title=String(row.name??row.title??'').trim();if(!title||!Number.isFinite(start)||!Number.isFinite(stop)||stop<=start)return[];return[{channelId:channel.stalkerChannelId!,title,description:String(row.descr??row.description??''),start,stop}];});
      setEpg(current=>[...current.filter(item=>item.channelId!==channel.stalkerChannelId),...mapped]);
      setMessage(`${mapped.length} programas carregados para ${channel.name}.`);
    } catch(error) { setMessage(error instanceof Error?error.message:'Falha ao carregar EPG do Stalker.'); }
    finally { setStalkerEpgBusy(''); }
  }

  async function importEpg(file?: File) {
    if (!file && !epgUrl.trim()) return;
    setBusy(true); setMessage('');
    try {
      const text = file ? await readXmltvFile(file) : (await api.fetchLiveText(epgUrl, 'xmltv')).content;
      const parsed = parseXmltv(text);
      setEpg(parsed); setMessage(`${parsed.length} programas EPG importados.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha ao importar EPG.'); }
    finally { setBusy(false); }
  }

  return <div className="page-stack">
    <section className="page-intro"><span className="eyebrow">ENHANCED · LIVE TV</span><h2>TV ao vivo</h2><p>Importe playlists M3U e guias XMLTV que você tenha autorização para usar. Os canais e o guia ficam salvos neste dispositivo.</p></section>
    <section className="two-column-section live-import-grid">
      <div className="panel"><div className="panel-heading"><div className="panel-icon"><FileUp size={20}/></div><div><h3>Playlist M3U</h3><p>Arquivo local ou URL pública HTTPS.</p></div></div>
        <label className="file-drop"><FileUp size={18}/><span>Selecionar arquivo .m3u / .m3u8<input type="file" accept=".m3u,.m3u8,text/plain,application/x-mpegURL" onChange={(e)=>e.target.files?.[0] && void importPlaylist(e.target.files[0])}/></span></label>
        <form className="addon-form" onSubmit={fetchPlaylist}><label>Ou URL da playlist</label><div className="input-action-row"><input type="url" placeholder="https://.../playlist.m3u" value={sourceUrl} onChange={(e)=>setSourceUrl(e.target.value)} required/><button className="button-primary" disabled={busy}><Link2 size={15}/></button></div></form>
      </div>
      <div className="panel"><div className="panel-heading"><div className="panel-icon"><Server size={20}/></div><div><h3>Xtream Codes</h3><p>Importe playlist e EPG da sua conta legítima de TV.</p></div></div><label>URL do servidor</label><input className="wide-input" type="url" value={xtreamHost} onChange={e=>setXtreamHost(e.target.value)} placeholder="https://servidor.exemplo:8080"/><label>Usuário</label><input className="wide-input" autoComplete="username" value={xtreamUser} onChange={e=>setXtreamUser(e.target.value)}/><label>Senha</label><input className="wide-input" type="password" autoComplete="current-password" value={xtreamPassword} onChange={e=>setXtreamPassword(e.target.value)}/><div className="sync-action-grid"><button className="button-primary" disabled={busy||!xtreamHost.trim()||!xtreamUser.trim()||!xtreamPassword} onClick={()=>void connectXtream(false)}><Tv size={15}/> Importar canais</button><button className="button-secondary" disabled={busy||!xtreamHost.trim()||!xtreamUser.trim()||!xtreamPassword} onClick={()=>void connectXtream(true)}><CalendarDays size={15}/> Canais + EPG</button></div><small className="muted-copy">As credenciais são usadas para gerar URLs e consultar fontes. O provedor precisa permitir acesso HTTPS e o servidor Render precisa alcançar o host público.</small></div>
      <div className="panel"><div className="panel-heading"><div className="panel-icon"><Server size={20}/></div><div><h3>Stalker Portal / MAG</h3><p>Handshake, perfil, categorias, canais e link sob demanda.</p></div></div><label>URL do portal (portal.php ou load.php)</label><input className="wide-input" type="url" value={stalkerPortal} onChange={e=>setStalkerPortal(e.target.value)} placeholder="https://portal.exemplo/portal.php"/><label>Endereço MAC autorizado</label><input className="wide-input" value={stalkerMac} onChange={e=>setStalkerMac(e.target.value)} placeholder="00:1A:79:XX:XX:XX" autoCapitalize="characters"/><button className="button-primary full-button" disabled={busy||!stalkerPortal.trim()||!stalkerMac.trim()} onClick={()=>void connectStalker()}><Server size={15}/> Conectar e carregar canais</button><small className="muted-copy">Apenas portais que você está autorizado a acessar. O token fica em memória nesta aba; o proxy da Render bloqueia destinos privados e exige HTTPS por padrão.</small>{stalkerToken&&<span className="status-pill ok">Sessão Stalker ativa nesta aba</span>}</div>
      <div className="panel"><div className="panel-heading"><div className="panel-icon"><CalendarDays size={20}/></div><div><h3>Guia de programação</h3><p>Importe XMLTV em XML (ou XMLTV comprimido descompactado).</p></div></div>
        <label className="file-drop"><FileUp size={18}/><span>Selecionar guia .xml<input type="file" accept=".xml,.xmltv,.xml.gz,.gz,text/xml,application/xml,application/gzip" onChange={(e)=>e.target.files?.[0] && void importEpg(e.target.files[0])}/></span></label>
        <div className="addon-form"><label>Ou URL do XMLTV</label><div className="input-action-row"><input type="url" placeholder="https://.../epg.xml" value={epgUrl} onChange={(e)=>setEpgUrl(e.target.value)}/><button className="button-primary" disabled={busy || !epgUrl.trim()} onClick={()=>void importEpg()}><RefreshCw size={15}/></button></div></div>
      </div>
    </section>
    {message && <div className="notice notice-info"><Radio size={17}/><div><span>{message}</span></div></div>}
    <section className="section-block"><div className="section-heading"><div><span className="eyebrow">SUA PLAYLIST</span><h2>Canais <span className="count-bubble">{filtered.length}</span></h2></div><button className="text-button danger-text" onClick={()=>{setChannels([]);setEpg([]);}}>Limpar fontes</button></div>
      {channels.length>0 ? <><div className="live-toolbar"><input className="search-inline" placeholder="Buscar canal ou categoria" value={query} onChange={(e)=>setQuery(e.target.value)}/><select value={group} onChange={(e)=>setGroup(e.target.value)}>{groups.map((value)=><option key={value}>{value}</option>)}</select></div><div className="live-channel-grid">{filtered.map((channel)=>{const programme=getCurrentProgramme(channel.tvgId || channel.id);return <article className="live-channel-card" key={channel.id}><div className="live-logo">{channel.logo ? <img src={channel.logo} alt="" loading="lazy"/> : <Tv size={20}/>}</div><div className="live-channel-info"><b>{channel.name}</b><span>{channel.group}</span><small>{programme ? `AO VIVO · ${programme.title}` : 'Programação indisponível'}</small></div><div className="live-card-actions">{channel.provider==='stalker'&&<button className="icon-button" aria-label={`Carregar guia de ${channel.name}`} title="Carregar EPG" disabled={stalkerEpgBusy===channel.id||!stalkerToken} onClick={()=>void loadStalkerEpg(channel)}><CalendarDays size={15}/></button>}<button className="icon-button" aria-label={`Assistir ${channel.name}`} disabled={busy} onClick={()=>void playChannel(channel)}><Play size={16}/></button></div></article>})}</div></> : <div className="empty-state"><div className="empty-icon"><Tv size={22}/></div><h3>Nenhuma playlist carregada</h3><p>Importe uma playlist M3U local ou por URL para montar sua grade de canais.</p></div>}
    </section>
    <div className="notice notice-warning"><Radio size={17}/><div><b>Compatibilidade de streams</b><span>O player usa HLS ou formatos suportados pelo navegador. Algumas URLs TS, autenticações especiais, codecs e fontes sem CORS podem exigir um servidor de mídia próprio. O aplicativo não fornece playlists ou canais.</span></div></div>
  </div>;
}
