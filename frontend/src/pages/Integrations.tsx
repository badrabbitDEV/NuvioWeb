import { useEffect, useMemo, useState } from 'react';
import { Activity, CheckCircle2, ExternalLink, Link2, LoaderCircle, LogOut, PlayCircle, Radio, RefreshCw, Save, Server, ShieldCheck, Tv, UserRound, XCircle } from 'lucide-react';
import { useStoredState } from '../lib/storage';
import { useApp } from '../lib/context';
import { api, ApiClientError } from '../lib/api';
import type { MediaItem } from '../types';
import { authenticateMediaServer, listMediaServerItems, listMediaServerLibraries, listPlexSections, listPlexSectionItems, type MediaServerSession, type PlexSection } from '../features/servers';
import { completeDeviceAuthorization, getWatchedItems, startDeviceAuthorization } from '../features/tracking';

type ProviderId = 'trakt'|'simkl'|'anilist'|'mdblist'|'publicmetadb'|'wetrakr'|'jellyfin'|'emby'|'plex'|'premiumize'|'torbox';
type Provider = { id: ProviderId; name: string; category: 'tracking'|'metadata'|'server'|'debrid'; description: string; url: string; state: 'native'|'device'|'manual' };
type DeviceCode = { deviceCode: string; userCode: string; verificationUrl: string; expiresIn: number; interval: number };

const providers: Provider[] = [
  { id:'trakt', name:'Trakt', category:'tracking', description:'Login por código, lista de assistidos e envio de progresso (scrobble).', url:'https://trakt.tv/oauth/applications', state:'device' },
  { id:'simkl', name:'SIMKL', category:'tracking', description:'Login por código e consulta de itens assistidos.', url:'https://simkl.com/settings/developer', state:'device' },
  { id:'anilist', name:'AniList', category:'tracking', description:'Conexão por token de API e consulta GraphQL. Login OAuth requer app ID próprio.', url:'https://anilist.co/settings/developer', state:'manual' },
  { id:'mdblist', name:'MDBList', category:'metadata', description:'API key para ratings e listas. As chaves ficam somente nesta sessão.', url:'https://mdblist.com/preferences/', state:'manual' },
  { id:'publicmetadb', name:'PublicMetaDB', category:'metadata', description:'Provedor de metadados; requer endpoint público compatível.', url:'https://publicmetadb.com/', state:'manual' },
  { id:'wetrakr', name:'WeTrakr', category:'tracking', description:'Integração de listas e tracking; conexão depende das credenciais/API habilitadas pelo serviço.', url:'https://wetrakr.com/', state:'manual' },
  { id:'jellyfin', name:'Jellyfin', category:'server', description:'Login direto, bibliotecas e catálogo do seu servidor. O servidor precisa permitir CORS.', url:'https://jellyfin.org/docs/', state:'native' },
  { id:'emby', name:'Emby', category:'server', description:'Login direto e leitura da biblioteca do seu servidor. O servidor precisa permitir CORS.', url:'https://emby.media/support/articles/Home.html', state:'native' },
  { id:'plex', name:'Plex', category:'server', description:'Token Plex e leitura de servidor. PIN OAuth e descoberta de servidores são etapas externas.', url:'https://support.plex.tv/', state:'manual' },
  { id:'premiumize', name:'Premiumize', category:'debrid', description:'Credenciais locais para serviços de nuvem. Resolução exige implementação específica da API.', url:'https://www.premiumize.me/', state:'manual' },
  { id:'torbox', name:'TorBox', category:'debrid', description:'Credenciais locais para serviços de nuvem. Resolução exige implementação específica da API.', url:'https://torbox.app/', state:'manual' },
];

const sessionGet = <T,>(key:string, fallback:T):T => { try { const raw=sessionStorage.getItem(key); return raw?JSON.parse(raw) as T:fallback; } catch { return fallback; } };
const sessionSet = (key:string,value:unknown) => { try { sessionStorage.setItem(key,JSON.stringify(value)); } catch { /* Private browsing may disable storage. */ } };
const sessionRemove = (key:string) => { try { sessionStorage.removeItem(key); } catch { /* Ignore. */ } };


export default function Integrations(){
  const { setLibrary, activeProfileId } = useApp();
  const sessionKey = (name: string) => `nuvio-session:${activeProfileId}:${name}`;
  const [saved,setSaved]=useStoredState<Array<{id:ProviderId;label:string;endpoint?:string;username?:string;note?:string}>>(`nuvio-web:${activeProfileId}:integrations`,[]);
  const [active,setActive]=useState<ProviderId>('trakt');
  const [endpoint,setEndpoint]=useState('');
  const [username,setUsername]=useState('');
  const [apiKey,setApiKey]=useState('');
  const [password,setPassword]=useState('');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [serviceConfig,setServiceConfig]=useState<{trakt:boolean;simkl:boolean;wetrakr:boolean;tmdb:boolean}|null>(null);
  const [traktDevice,setTraktDevice]=useState<DeviceCode|null>(null);
  const [simklDevice,setSimklDevice]=useState<DeviceCode|null>(null);
  const [weTrakrDevice,setWeTrakrDevice]=useState<DeviceCode|null>(null);
  const [weTrakrToken,setWeTrakrToken]=useState(sessionGet<string>(`nuvio-session:${activeProfileId}:wetrakr`,''));
  const [weTrakrStatus,setWeTrakrStatus]=useState('');
  const [weTrakrAccount,setWeTrakrAccount]=useState('');

  const [traktToken,setTraktToken]=useState(sessionGet<{accessToken:string;refreshToken:string;expiresAt?:number}>(`nuvio-session:${activeProfileId}:trakt`, {accessToken:'',refreshToken:''}));
  const [simklToken,setSimklToken]=useState(sessionGet<string>(`nuvio-session:${activeProfileId}:simkl`,''));
  const [mediaSession,setMediaSession]=useState<MediaServerSession|null>(sessionGet<MediaServerSession|null>(`nuvio-session:${activeProfileId}:media-server`,null));
  const [plexUrl,setPlexUrl]=useState(sessionGet<string>(`nuvio-session:${activeProfileId}:plex-url`,''));
  const [plexToken,setPlexToken]=useState(sessionGet<string>(`nuvio-session:${activeProfileId}:plex-token`,''));
  const [plexSections,setPlexSections]=useState<Array<{key:string;title:string;type:string}>>([]);
  const [plexItems,setPlexItems]=useState<MediaItem[]>([]);
  const [plexStatus,setPlexStatus]=useState('');
  const [serverItems,setServerItems]=useState<MediaItem[]>([]);
  const [serverLibraries,setServerLibraries]=useState<Array<{Name:string;Id:string}>>([]);
  const [aniListToken,setAniListToken]=useState(sessionGet<string>(`nuvio-session:${activeProfileId}:anilist`,''));
  const [aniListStatus,setAniListStatus]=useState('');
  const [aniListItems,setAniListItems]=useState<MediaItem[]>([]);
  const [traktStatus,setTraktStatus]=useState('');
  const [simklStatus,setSimklStatus]=useState('');
  const [mdblistKey,setMdblistKey]=useState(sessionGet<string>(`nuvio-session:${activeProfileId}:mdblist`,''));
  const [mdblistStatus,setMdblistStatus]=useState('');
  const [mdblistItems,setMdblistItems]=useState<MediaItem[]>([]);
  const [publicMetaDbKey,setPublicMetaDbKey]=useState(sessionGet<string>(`nuvio-session:${activeProfileId}:publicmetadb`,''));
  const [publicMetaDbStatus,setPublicMetaDbStatus]=useState('');
  const [publicMetaDbItems,setPublicMetaDbItems]=useState<MediaItem[]>([]);

  useEffect(()=>{ api.integrationConfig().then(setServiceConfig).catch(()=>setServiceConfig({trakt:false,simkl:false,wetrakr:false,tmdb:false})); },[]);
  const selected=providers.find(p=>p.id===active)!;
  const savedIds=useMemo(()=>new Set(saved.map(item=>item.id)),[saved]);

  function saveIntegration(){
    const provider=providers.find(p=>p.id===active)!;
    const url=endpoint.trim();
    if(provider.category==='server' && !url){setMessage('Informe a URL base do servidor.');return;}
    setSaved(current=>[...current.filter(item=>item.id!==active),{id:active,label:provider.name,endpoint:url||undefined,username:username.trim()||undefined,note:apiKey.trim()? 'Credencial configurada nesta sessão':undefined}]);
    if(apiKey.trim()) sessionSet(sessionKey(`key:${active}`),apiKey.trim());
    setMessage(`${provider.name} configurado neste navegador. A integração só ficará operacional nos recursos indicados nesta página.`);
  }
  function removeIntegration(id:ProviderId){setSaved(current=>current.filter(item=>item.id!==id));sessionRemove(sessionKey(`key:${id}`));}

  async function beginDevice(provider:'trakt'|'simkl'){
    setBusy(true);setMessage('');
    try{
      const data=await startDeviceAuthorization(provider);
      if(provider==='trakt')setTraktDevice(data);else setSimklDevice(data);
      setMessage(`Código criado. Acesse ${data.verificationUrl} e informe ${data.userCode}.`);
    }catch(error){setMessage(error instanceof Error?error.message:'Não foi possível iniciar o login.');}
    finally{setBusy(false);}
  }
  async function verifyDevice(provider:'trakt'|'simkl'){
    const device=provider==='trakt'?traktDevice:simklDevice;
    if(!device)return;
    setBusy(true);setMessage('');
    try{
      if(provider==='trakt'){
        const result=await completeDeviceAuthorization('trakt',device.deviceCode);
        const value={accessToken:result.accessToken,refreshToken:result.refreshToken,expiresAt:Date.now()+Math.max(0,result.expiresIn-60)*1000};setTraktToken(value);sessionSet(sessionKey('trakt'),value);setTraktStatus('Autorizado nesta sessão');setTraktDevice(null);
      }else{
        const result=await completeDeviceAuthorization('simkl',device.deviceCode);
        setSimklToken(result.accessToken);sessionSet(sessionKey('simkl'),result.accessToken);setSimklStatus('Autorizado nesta sessão');setSimklDevice(null);
      }
      setMessage(`${provider==='trakt'?'Trakt':'SIMKL'} autorizado. O token fica na sessão atual do navegador.`);
    }catch(error){setMessage(error instanceof ApiClientError&&error.status===400?'Ainda aguardando autorização. Conclua o código no site e tente verificar novamente.':error instanceof Error?error.message:'Falha ao confirmar a autorização.');}
    finally{setBusy(false);}
  }
  async function currentTraktToken(): Promise<string> {
    let current = traktToken;
    const expiry = Number((current as typeof current & { expiresAt?: number }).expiresAt ?? 0);
    if (current.accessToken && current.refreshToken && expiry > 0 && expiry < Date.now() + 60_000) {
      const refreshed = await api.traktRefresh(current.refreshToken);
      current = { accessToken: refreshed.accessToken, refreshToken: refreshed.refreshToken, expiresAt: Date.now() + Math.max(0, refreshed.expiresIn - 60) * 1000 };
      setTraktToken(current);
      sessionSet(sessionKey('trakt'), current);
    }
    return current.accessToken;
  }

  async function syncTrakt(){
    if(!traktToken.accessToken)return;
    setBusy(true);setTraktStatus('Consultando itens assistidos…');
    try{const token = await currentTraktToken();const result=await getWatchedItems('trakt',token) as {movies:unknown[];shows:unknown[]};const movieItems=(result.movies as Array<{movie?:{title?:string;year?:number;ids?:{tmdb?:number}}}>).flatMap(entry=>entry.movie?.ids?.tmdb?[{id:entry.movie.ids.tmdb,media_type:'movie' as const,title:entry.movie.title,release_date:entry.movie.year?`${entry.movie.year}-01-01`:undefined}]:[]);const showItems=(result.shows as Array<{show?:{title?:string;year?:number;ids?:{tmdb?:number}}}>).flatMap(entry=>entry.show?.ids?.tmdb?[{id:entry.show.ids.tmdb,media_type:'tv' as const,name:entry.show.title,first_air_date:entry.show.year?`${entry.show.year}-01-01`:undefined}]:[]);setLibrary(current=>{const keys=new Set(current.map(item=>`${item.media_type}:${item.id}`));return [...current,...[...movieItems,...showItems].filter(item=>!keys.has(`${item.media_type}:${item.id}`))];});setTraktStatus(`${result.movies.length} filmes e ${result.shows.length} séries consultados. Itens com ID TMDB foram adicionados à biblioteca local.`);}
    catch(error){setTraktStatus(error instanceof Error?error.message:'Falha ao consultar Trakt.');}
    finally{setBusy(false);}
  }
  async function syncSimkl(){
    if(!simklToken)return;
    setBusy(true);setSimklStatus('Consultando sua biblioteca…');
    try{
      const result=await getWatchedItems('simkl',simklToken) as {movies?:Array<{movie?:{title?:string;year?:number;ids?:{tmdb?:number}}}>;shows?:Array<{show?:{title?:string;year?:number;ids?:{tmdb?:number}}}>;anime?:Array<{show?:{title?:string;year?:number;ids?:{tmdb?:number}}}>};
      const movieItems=(result.movies??[]).flatMap(entry=>entry.movie?.ids?.tmdb?[{id:entry.movie.ids.tmdb,media_type:'movie' as const,title:entry.movie.title,release_date:entry.movie.year?`${entry.movie.year}-01-01`:undefined}]:[]);
      const showEntries=[...(result.shows??[]),...(result.anime??[])];
      const showItems=showEntries.flatMap(entry=>entry.show?.ids?.tmdb?[{id:entry.show.ids.tmdb,media_type:'tv' as const,name:entry.show.title,first_air_date:entry.show.year?`${entry.show.year}-01-01`:undefined}]:[]);
      setLibrary(current=>{const keys=new Set(current.map(item=>`${item.media_type}:${item.id}`));return [...current,...[...movieItems,...showItems].filter(item=>!keys.has(`${item.media_type}:${item.id}`))];});
      setSimklStatus(`${movieItems.length+showItems.length} itens com ID TMDB importados para a biblioteca local. Itens sem correspondência TMDB foram ignorados.`);
    }
    catch(error){setSimklStatus(error instanceof Error?error.message:'Falha ao consultar SIMKL.');}
    finally{setBusy(false);}
  }

  async function connectMediaServer(provider:'jellyfin'|'emby'){
    setBusy(true);setMessage('');setServerItems([]);
    try{
      const session=await authenticateMediaServer(provider,endpoint,username,password);
      setMediaSession(session);sessionSet(sessionKey('media-server'),session);
      const [libraries,items]=await Promise.all([listMediaServerLibraries(session),listMediaServerItems(session)]);
      setServerLibraries(libraries);setServerItems(items);
      setMessage(`Conectado ao ${provider==='jellyfin'?'Jellyfin':'Emby'} como ${session.username}. ${items.length} itens encontrados.`);
    }catch(error){setMessage(error instanceof Error?`${error.message} Se for erro de CORS, habilite a origem do site nas configurações do servidor.`:'Falha na conexão ao servidor.');}
    finally{setBusy(false);}
  }
  async function refreshMediaServer(){
    if(!mediaSession)return;
    setBusy(true);
    try{const items=await listMediaServerItems(mediaSession);setServerItems(items);setMessage(`${items.length} itens atualizados do servidor.`);}
    catch(error){setMessage(error instanceof Error?error.message:'Falha ao carregar biblioteca.');}
    finally{setBusy(false);}
  }
  function importServerItems(){setLibrary(current=>{const keys=new Set(current.map(item=>`${item.media_type}:${item.id}`));return [...current,...serverItems.filter(item=>!keys.has(`${item.media_type}:${item.id}`))];});setMessage(`${serverItems.length} itens da biblioteca do servidor adicionados à biblioteca local.`);}
  function disconnect(provider:'trakt'|'simkl'|'media-server'){
    if(provider==='trakt'){setTraktToken({accessToken:'',refreshToken:''});sessionRemove(sessionKey('trakt'));setTraktStatus('');}
    if(provider==='simkl'){setSimklToken('');sessionRemove(sessionKey('simkl'));setSimklStatus('');}
    if(provider==='media-server'){setMediaSession(null);sessionRemove(sessionKey('media-server'));setServerItems([]);setServerLibraries([]);}
  }
  async function connectPlex(){
    setBusy(true);setPlexStatus('Conectando ao Plex…');setPlexItems([]);
    try{
      const base=new URL(plexUrl.trim());
      const sections=await listPlexSections(base.toString(),plexToken);
      setPlexSections(sections);sessionSet(sessionKey('plex-url'),base.toString());sessionSet(sessionKey('plex-token'),plexToken.trim());
      setPlexStatus(`${sections.length} bibliotecas encontradas. Selecione uma para importar.`);
    }catch(error){setPlexStatus(error instanceof Error?`${error.message} Habilite CORS no Plex e confirme o token.`:'Falha ao conectar ao Plex.');}
    finally{setBusy(false);}
  }
  async function loadPlexSection(section:PlexSection){
    setBusy(true);setPlexStatus(`Carregando ${section.title}…`);
    try{const items=await listPlexSectionItems(plexUrl,plexToken,section);setPlexItems(items);setPlexStatus(`${items.length} itens encontrados em ${section.title}.`);}
    catch(error){setPlexStatus(error instanceof Error?error.message:'Falha ao carregar a seção Plex.');}
    finally{setBusy(false);}
  }
  function importPlexItems(){setLibrary(current=>{const keys=new Set(current.map(item=>`${item.media_type}:${item.id}`));return [...current,...plexItems.filter(item=>!keys.has(`${item.media_type}:${item.id}`))];});setPlexStatus(`${plexItems.length} itens adicionados à biblioteca local.`);}

  async function beginWeTrakr(){
    setBusy(true);setWeTrakrStatus('');
    try{const result=await api.wetrakrDeviceCode();setWeTrakrDevice(result);setWeTrakrStatus(`Acesse ${result.verificationUrl} e informe o código ${result.userCode}.`);}
    catch(error){setWeTrakrStatus(error instanceof Error?error.message:'Não foi possível iniciar a autorização WeTrakr.');}
    finally{setBusy(false);}
  }
  async function verifyWeTrakr(){
    if(!weTrakrDevice)return;setBusy(true);
    try{
      const result=await api.wetrakrDeviceToken(weTrakrDevice.deviceCode);
      if(result.pending||!result.accessToken){setWeTrakrStatus('Autorização pendente. Finalize no site WeTrakr e tente novamente.');return;}
      setWeTrakrToken(result.accessToken);sessionSet(sessionKey('wetrakr'),result.accessToken);if(result.refreshToken)sessionSet(sessionKey('wetrakr-refresh'),result.refreshToken);sessionSet(sessionKey('wetrakr-expiry'),Date.now()+Math.max(0,(result.expiresIn??3600)-60)*1000);setWeTrakrDevice(null);
      const account=await api.wetrakrAccount(result.accessToken);const info=(account.info??account.user??account) as Record<string,unknown>;
      setWeTrakrAccount(String(info.name??info.display_name??info.username??'Conta WeTrakr'));setWeTrakrStatus('WeTrakr autorizado nesta sessão.');
    }catch(error){setWeTrakrStatus(error instanceof Error?error.message:'Falha ao validar WeTrakr.');}
    finally{setBusy(false);}
  }
  async function currentWeTrakrToken(): Promise<string> {
    let access = weTrakrToken;
    const expiry = Number(sessionGet<number>(sessionKey('wetrakr-expiry'), 0));
    const refresh = sessionGet<string>(sessionKey('wetrakr-refresh'), '');
    if (access && refresh && expiry > 0 && expiry < Date.now() + 60_000) {
      const result = await api.wetrakrRefresh(refresh);
      access = result.accessToken;
      setWeTrakrToken(access);
      sessionSet(sessionKey('wetrakr'), access);
      sessionSet(sessionKey('wetrakr-refresh'), result.refreshToken);
      sessionSet(sessionKey('wetrakr-expiry'), Date.now() + Math.max(0, result.expiresIn - 60) * 1000);
    }
    return access;
  }

  async function syncWeTrakr(){
    if(!weTrakrToken)return;setBusy(true);setWeTrakrStatus('Importando histórico WeTrakr…');
    try{
      const token = await currentWeTrakrToken();
      const data=await api.wetrakrWatched(token);
      const collect=(value:unknown,fallbackType:'movie'|'tv'):MediaItem[]=>{
        const rows=Array.isArray(value)?value:value&&typeof value==='object'?(['items','results','data'] as const).map(k=>(value as Record<string,unknown>)[k]).find(Array.isArray)??[]:[];
        return (rows as Array<Record<string,unknown>>).flatMap(row=>{
          const media=(row.movie??row.show??row.media??row) as Record<string,unknown>;
          const ids=(media.ids??row.ids??{}) as Record<string,unknown>;
          const id=Number(ids.tmdb??media.tmdb_id??media.tmdbId);
          const title=String(media.title??media.name??'').trim();
          if(!Number.isSafeInteger(id)||id<=0)return[];
          return [{id,media_type:fallbackType,title:fallbackType==='movie'?title:undefined,name:fallbackType==='tv'?title:undefined,sourceProvider:'wetrakr'} as MediaItem];
        });
      };
      const mapped=[...collect(data.movies,'movie'),...collect(data.shows,'tv')];
      setLibrary(current=>{const keys=new Set(current.map(item=>`${item.media_type}:${item.id}`));return [...current,...mapped.filter(item=>!keys.has(`${item.media_type}:${item.id}`))];});
      setWeTrakrStatus(`${mapped.length} filmes e séries com ID TMDB importados; ${Array.isArray(data.episodes)?data.episodes.length:0} registros de episódios consultados.`);
    }catch(error){setWeTrakrStatus(error instanceof Error?error.message:'Falha ao sincronizar WeTrakr.');}
    finally{setBusy(false);}
  }
  function disconnectWeTrakr(){setWeTrakrToken('');setWeTrakrAccount('');setWeTrakrDevice(null);sessionRemove(sessionKey('wetrakr'));sessionRemove(sessionKey('wetrakr-refresh'));sessionRemove(sessionKey('wetrakr-expiry'));setWeTrakrStatus('WeTrakr desconectado.');}

  async function syncMdblist(){
    const key=mdblistKey.trim();
    if(!key)return;
    setBusy(true);setMdblistStatus('Consultando sua watchlist do MDBList…');
    try{
      await api.mdblistUser(key);
      const result=await api.mdblistWatchlist(key);
      const payload=result.data as unknown;
      const rows=Array.isArray(payload)?payload:
        payload&&typeof payload==='object'?
          (['results','items','data','movies','shows'] as const).map(name=>(payload as Record<string,unknown>)[name]).find(Array.isArray)??[]:[];
      const mapped=(rows as Array<Record<string,unknown>>).flatMap(row=>{
        const nested=(row.movie??row.show??row.media??row) as Record<string,unknown>;
        if(!nested||typeof nested!=='object')return[];
        const ids=(nested.ids??row.ids??{}) as Record<string,unknown>;
        const tmdb=Number(ids.tmdb??nested.tmdbid??nested.tmdb_id??nested.tmdbId);
        const rawType=String(row.mediatype??row.media_type??nested.type??(row.show?'show':'movie')).toLowerCase();
        const type=rawType.includes('show')||rawType==='tv'?'tv':'movie';
        const title=String(nested.title??nested.name??row.title??row.name??'').trim();
        if(!Number.isSafeInteger(tmdb)||tmdb<=0||!title)return[];
        const year=Number(nested.year??row.year);
        return [{id:tmdb,media_type:type,title:type==='movie'?title:undefined,name:type==='tv'?title:undefined,release_date:type==='movie'&&year?`${year}-01-01`:undefined,first_air_date:type==='tv'&&year?`${year}-01-01`:undefined,overview:String(nested.description??nested.overview??''),sourceProvider:'mdblist'} as MediaItem];
      });
      setMdblistItems(mapped);
      sessionSet(sessionKey('mdblist'),key);
      setMdblistStatus(`${mapped.length} itens da watchlist têm ID TMDB e podem ser importados. O MDBList retornou ${(rows as unknown[]).length} registro(s).`);
    }catch(error){setMdblistStatus(error instanceof Error?error.message:'Falha ao consultar MDBList.');}
    finally{setBusy(false);}
  }
  function importMdblistItems(){
    setLibrary(current=>{const keys=new Set(current.map(item=>`${item.media_type}:${item.id}`));return [...current,...mdblistItems.filter(item=>!keys.has(`${item.media_type}:${item.id}`))];});
    setMdblistStatus(`${mdblistItems.length} itens adicionados à biblioteca local.`);
  }

  async function syncPublicMetaDb(){
    const key=publicMetaDbKey.trim();if(!key)return;
    setBusy(true);setPublicMetaDbStatus('Validando chave e sincronizando dados…');
    try{
      await api.publicMetaDbVerify(key);
      const data=await api.publicMetaDbSync(key);
      const raw=data.watched as unknown;
      const rows=Array.isArray(raw)?raw:raw&&typeof raw==='object'?(['items','results','data','watched_history'] as const).map(name=>(raw as Record<string,unknown>)[name]).find(Array.isArray)??[]:[];
      const mapped=(rows as Array<Record<string,unknown>>).flatMap(row=>{
        const nested=(row.media??row.item??row) as Record<string,unknown>;
        const id=Number(nested.tmdb_id??nested.tmdbId??nested.tmdb??row.tmdb_id);
        const rawType=String(nested.media_type??nested.mediaType??row.media_type??'movie').toLowerCase();
        const type=rawType==='tv'||rawType==='show'?'tv':'movie';
        const title=String(nested.title??nested.name??row.title??'').trim();
        if(!Number.isSafeInteger(id)||id<=0)return[];
        return [{id,media_type:type,title:type==='movie'?title:undefined,name:type==='tv'?title:undefined,sourceProvider:'publicmetadb'} as MediaItem];
      });
      setPublicMetaDbItems(mapped);sessionSet(sessionKey('publicmetadb'),key);
      setPublicMetaDbStatus(`${mapped.length} itens assistidos importáveis. Listas e progresso também foram consultados.`);
    }catch(error){setPublicMetaDbStatus(error instanceof Error?error.message:'Falha ao consultar PublicMetaDB.');}
    finally{setBusy(false);}
  }
  function importPublicMetaDbItems(){
    setLibrary(current=>{const keys=new Set(current.map(item=>`${item.media_type}:${item.id}`));return [...current,...publicMetaDbItems.filter(item=>!keys.has(`${item.media_type}:${item.id}`))];});
    setPublicMetaDbStatus(`${publicMetaDbItems.length} itens importados para a biblioteca local.`);
  }

  async function connectAniList(){
    if(!aniListToken.trim()){setAniListStatus('Informe seu token de acesso.');return;}
    setBusy(true);setAniListStatus('Validando token e lendo suas listas…');
    try{
      const headers={'content-type':'application/json',authorization:`Bearer ${aniListToken.trim()}`};
      const viewerResponse=await fetch('https://graphql.anilist.co',{method:'POST',headers,body:JSON.stringify({query:'query { Viewer { id name } }'}),signal:AbortSignal.timeout(20_000)});
      const viewerBody=await viewerResponse.json();
      if(!viewerResponse.ok||viewerBody.errors||!viewerBody.data?.Viewer?.id)throw new Error('Token inválido ou API indisponível.');
      const query='query ($userId:Int) { MediaListCollection(userId:$userId,type:ANIME) { lists { name entries { status progress score media { id idMal type format episodes seasonYear title { romaji english native } description averageScore coverImage { large } bannerImage } } } } }';
      const listResponse=await fetch('https://graphql.anilist.co',{method:'POST',headers,body:JSON.stringify({query,variables:{userId:viewerBody.data.Viewer.id}}),signal:AbortSignal.timeout(25_000)});
      const listBody=await listResponse.json();
      if(!listResponse.ok||listBody.errors)throw new Error('Não foi possível consultar as listas AniList.');
      const rows=(listBody.data?.MediaListCollection?.lists??[]).flatMap((list:{name:string;entries:Array<{status:string;progress:number;media:Record<string,unknown>}>})=>list.entries.map(entry=>({entry,listName:list.name})));
      const mapped=rows.map(({entry,listName})=>{
        const media=entry.media as {id:number;idMal?:number;type?:string;title?:{romaji?:string;english?:string;native?:string};description?:string;averageScore?:number;coverImage?:{large?:string};bannerImage?:string;seasonYear?:number};
        return {id:media.id,media_type:'tv' as const,title:media.title?.english||media.title?.romaji||media.title?.native||'Anime',overview:(media.description??'').replace(/<[^>]*>/g,' '),vote_average:media.averageScore?media.averageScore/10:undefined,release_date:media.seasonYear?`${media.seasonYear}-01-01`:undefined,sourceProvider:'anilist' as const,sourceId:media.id,sourcePosterUrl:media.coverImage?.large,sourceBackdropUrl:media.bannerImage,sourceStatus:`${entry.status} · ${entry.progress} ep.`,external_ids:{anilist_id:media.id,...(media.idMal?{mal_id:media.idMal}:{})},sourceProgress:entry.progress,sourceList:listName} as MediaItem;
      });
      setAniListItems(mapped);
      setLibrary(current=>{const keys=new Set(current.map(item=>`${item.sourceProvider??'tmdb'}:${item.sourceId??item.id}`));return [...current,...mapped.filter(item=>!keys.has(`anilist:${item.sourceId}`))];});
      sessionSet(sessionKey('anilist'),aniListToken.trim());
      setAniListStatus(`Conectado como ${viewerBody.data.Viewer.name}. ${mapped.length} animes importados/atualizados na biblioteca local.`);
    }
    catch(error){setAniListStatus(error instanceof Error?error.message:'Falha ao conectar AniList.');}
    finally{setBusy(false);}
  }

  return <div className="page-stack narrow-page">
    <section className="page-intro"><span className="eyebrow">CONTAS · METADADOS · SERVIDORES</span><h2>Integrações</h2><p>Conexões reais disponíveis nesta versão. Tokens de terceiros ficam em sessionStorage e são removidos ao encerrar a sessão do navegador.</p></section>
    <section className="integration-status-grid"><div className="stat-card"><Activity size={18}/><b>{serviceConfig?.trakt?'Configurável':'Sem client ID'}</b><span>Trakt OAuth</span></div><div className="stat-card"><Activity size={18}/><b>{serviceConfig?.simkl?'Configurável':'Sem client ID'}</b><span>SIMKL OAuth</span></div><div className="stat-card"><Server size={18}/><b>{mediaSession?.provider??'Desconectado'}</b><span>Servidor de mídia</span></div></section>

    <section className="panel integration-provider-panel"><div className="panel-heading"><div className="panel-icon"><Radio size={20}/></div><div><h3>Trakt — OAuth e scrobble</h3><p>Exige credenciais de aplicação Trakt configuradas na Render.</p></div><span className={`status-pill ${traktToken.accessToken?'ok':''}`}>{traktToken.accessToken?'Conectado':'Desconectado'}</span></div>
      {!serviceConfig?.trakt&&<div className="notice notice-warning"><ShieldCheck size={16}/><span>Defina <code>TRAKT_CLIENT_ID</code> e <code>TRAKT_CLIENT_SECRET</code> na Render e faça redeploy.</span></div>}
      {!traktToken.accessToken?<><button className="button-primary full-button" disabled={busy||!serviceConfig?.trakt} onClick={()=>void beginDevice('trakt')}><Link2 size={15}/> Gerar código de autorização</button>{traktDevice&&<div className="device-code-box"><span>Abra <a href={traktDevice.verificationUrl} target="_blank" rel="noreferrer">{traktDevice.verificationUrl}</a> e informe:</span><strong>{traktDevice.userCode}</strong><button className="button-secondary" onClick={()=>void navigator.clipboard?.writeText(traktDevice.userCode)}>Copiar código</button><button className="button-primary" disabled={busy} onClick={()=>void verifyDevice('trakt')}>Já autorizei — verificar</button><small>O código expira em {Math.ceil(traktDevice.expiresIn/60)} minutos. A verificação é manual para evitar polling em segundo plano.</small></div>}</>:<><div className="sync-action-grid"><button className="button-secondary" onClick={()=>void syncTrakt()} disabled={busy}><RefreshCw size={15}/> Consultar assistidos</button><button className="text-button danger-text" onClick={()=>disconnect('trakt')}><LogOut size={15}/> Desconectar</button></div>{traktStatus&&<p className="form-hint">{traktStatus}</p>}</>}
    </section>

    <section className="panel integration-provider-panel"><div className="panel-heading"><div className="panel-icon"><Radio size={20}/></div><div><h3>SIMKL — dispositivo</h3><p>Autorização por código e consulta de itens assistidos.</p></div><span className={`status-pill ${simklToken?'ok':''}`}>{simklToken?'Conectado':'Desconectado'}</span></div>
      {!serviceConfig?.simkl&&<div className="notice notice-warning"><ShieldCheck size={16}/><span>Defina <code>SIMKL_CLIENT_ID</code> e <code>SIMKL_CLIENT_SECRET</code> na Render e faça redeploy.</span></div>}
      {!simklToken?<><button className="button-primary full-button" disabled={busy||!serviceConfig?.simkl} onClick={()=>void beginDevice('simkl')}><Link2 size={15}/> Gerar código SIMKL</button>{simklDevice&&<div className="device-code-box"><span>Abra <a href={simklDevice.verificationUrl} target="_blank" rel="noreferrer">{simklDevice.verificationUrl}</a> e informe:</span><strong>{simklDevice.userCode}</strong><button className="button-secondary" onClick={()=>void navigator.clipboard?.writeText(simklDevice.userCode)}>Copiar código</button><button className="button-primary" disabled={busy} onClick={()=>void verifyDevice('simkl')}>Já autorizei — verificar</button><small>O código expira em {Math.ceil(simklDevice.expiresIn/60)} minutos.</small></div>}</>:<><div className="sync-action-grid"><button className="button-secondary" onClick={()=>void syncSimkl()} disabled={busy}><RefreshCw size={15}/> Consultar assistidos</button><button className="text-button danger-text" onClick={()=>disconnect('simkl')}><LogOut size={15}/> Desconectar</button></div>{simklStatus&&<p className="form-hint">{simklStatus}</p>}</>}
    </section>

    <section className="panel integration-provider-panel"><div className="panel-heading"><div className="panel-icon"><Server size={20}/></div><div><h3>Jellyfin / Emby — servidor de mídia</h3><p>Autenticação, leitura da biblioteca e importação de catálogo.</p></div><span className={`status-pill ${mediaSession?'ok':''}`}>{mediaSession?mediaSession.provider:'Desconectado'}</span></div>
      {!mediaSession?<><label>Tipo de servidor</label><div className="choice-row"><button className={active==='jellyfin'?'active':''} onClick={()=>setActive('jellyfin')}>Jellyfin</button><button className={active==='emby'?'active':''} onClick={()=>setActive('emby')}>Emby</button></div><label>URL base</label><input className="wide-input" type="url" value={endpoint} onChange={e=>setEndpoint(e.target.value)} placeholder="https://media.seudominio.com:8096"/><label>Usuário</label><input className="wide-input" value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username"/><label>Senha</label><input className="wide-input" type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password"/><button className="button-primary full-button" disabled={busy||!endpoint.trim()||!username.trim()||!password} onClick={()=>void connectMediaServer(active==='emby'?'emby':'jellyfin')}><Server size={15}/> Conectar e importar biblioteca</button></>:<><p className="form-hint">Conectado como {mediaSession.username} em {mediaSession.baseUrl}. {serverLibraries.length} biblioteca(s) encontrada(s).</p><div className="sync-action-grid"><button className="button-secondary" onClick={()=>void refreshMediaServer()} disabled={busy}><RefreshCw size={15}/> Atualizar catálogo</button><button className="button-secondary" onClick={importServerItems} disabled={!serverItems.length}><CheckCircle2 size={15}/> Importar {serverItems.length} itens</button><button className="text-button danger-text" onClick={()=>disconnect('media-server')}><LogOut size={15}/> Desconectar</button></div><div className="server-items-preview">{serverItems.slice(0,8).map(item=><span key={`${item.media_type}-${item.id}`}>{item.title??item.name}</span>)}</div></>}
      <small className="muted-copy">Acesso direto do navegador: configure CORS no servidor para permitir o domínio Vercel. Senhas são usadas apenas no login e não são gravadas pelo app.</small>
    </section>

    <section className="panel integration-provider-panel"><div className="panel-heading"><div className="panel-icon"><Server size={20}/></div><div><h3>Plex — bibliotecas do servidor</h3><p>Conexão via URL e token Plex; requer CORS autorizado.</p></div></div><label>URL do Plex Media Server</label><input className="wide-input" type="url" value={plexUrl} onChange={e=>setPlexUrl(e.target.value)} placeholder="https://plex.seudominio.com:32400"/><label>X-Plex-Token</label><input className="wide-input" type="password" value={plexToken} onChange={e=>setPlexToken(e.target.value)} autoComplete="off" placeholder="Token do seu Plex"/><button className="button-primary full-button" disabled={busy||!plexUrl.trim()||!plexToken.trim()} onClick={()=>void connectPlex()}><Server size={15}/> Conectar ao Plex</button>{plexSections.length>0&&<div className="plex-section-list">{plexSections.map(section=><button key={section.key} onClick={()=>void loadPlexSection(section)} disabled={busy}><span>{section.title}</span><small>{section.type}</small></button>)}</div>}{plexItems.length>0&&<button className="button-secondary full-button" onClick={importPlexItems}><CheckCircle2 size={15}/> Importar {plexItems.length} itens</button>}{plexStatus&&<p className="form-hint">{plexStatus}</p>}<small className="muted-copy">O token Plex permanece somente nesta sessão. Algumas instalações Plex bloqueiam chamadas de origem cruzada; o port não tenta contornar essa política.</small></section>

    <section className="panel integration-provider-panel"><div className="panel-heading"><div className="panel-icon"><Activity size={20}/></div><div><h3>WeTrakr — tracking e scrobble</h3><p>OAuth por código, conta e importação de histórico.</p></div><span className={`status-pill ${weTrakrToken?'ok':''}`}>{weTrakrToken?'Conectado':'Desconectado'}</span></div>
      {!serviceConfig?.wetrakr&&<div className="notice notice-warning"><ShieldCheck size={16}/><span>Configure <code>WETRAKR_CLIENT_ID</code> na Render com um aplicativo autorizado do WeTrakr.</span></div>}
      {!weTrakrToken?<><button className="button-primary full-button" disabled={busy||!serviceConfig?.wetrakr} onClick={()=>void beginWeTrakr()}><Link2 size={15}/> Gerar código de autorização</button>{weTrakrDevice&&<div className="device-code-box"><span>Abra <a href={weTrakrDevice.verificationUrl} target="_blank" rel="noreferrer">{weTrakrDevice.verificationUrl}</a> e informe:</span><strong>{weTrakrDevice.userCode}</strong><button className="button-secondary" onClick={()=>void navigator.clipboard?.writeText(weTrakrDevice.userCode)}>Copiar código</button><button className="button-primary" disabled={busy} onClick={()=>void verifyWeTrakr()}>Já autorizei — verificar</button><small>O código expira em {Math.ceil(weTrakrDevice.expiresIn/60)} minutos. A verificação é manual.</small></div>}</>:<><p className="form-hint">Conectado como {weTrakrAccount||'usuário WeTrakr'}.</p><div className="sync-action-grid"><button className="button-secondary" disabled={busy} onClick={()=>void syncWeTrakr()}><RefreshCw size={15}/> Sincronizar assistidos</button><button className="text-button danger-text" onClick={disconnectWeTrakr}><LogOut size={15}/> Desconectar</button></div></>}
      {weTrakrStatus&&<p className="form-hint">{weTrakrStatus}</p>}<small className="muted-copy">O token fica somente no sessionStorage; o serviço WeTrakr aplica seus próprios limites. Configure seu próprio app ID no backend.</small><a className="text-button" href="https://wetrakr.com/" target="_blank" rel="noreferrer">WeTrakr <ExternalLink size={13}/></a>
    </section>

    <section className="panel integration-provider-panel"><div className="panel-heading"><div className="panel-icon"><Activity size={20}/></div><div><h3>PublicMetaDB — tracking e progresso</h3><p>Autenticação por API key, importação de assistidos e consulta de listas/progresso.</p></div><span className={`status-pill ${publicMetaDbKey?'ok':''}`}>{publicMetaDbKey?'Chave nesta sessão':'Desconectado'}</span></div><label>API key</label><input className="wide-input" type="password" value={publicMetaDbKey} onChange={e=>setPublicMetaDbKey(e.target.value)} autoComplete="off" placeholder="PublicMetaDB API key"/><div className="sync-action-grid"><button className="button-primary" disabled={busy||!publicMetaDbKey.trim()} onClick={()=>void syncPublicMetaDb()}><RefreshCw size={15}/> Sincronizar assistidos</button><button className="button-secondary" disabled={!publicMetaDbItems.length} onClick={importPublicMetaDbItems}><CheckCircle2 size={15}/> Importar {publicMetaDbItems.length}</button><button className="text-button danger-text" onClick={()=>{setPublicMetaDbKey('');setPublicMetaDbItems([]);sessionRemove(sessionKey('publicmetadb'));setPublicMetaDbStatus('Chave removida desta sessão.');}}><LogOut size={15}/> Desconectar</button></div>{publicMetaDbStatus&&<p className="form-hint">{publicMetaDbStatus}</p>}<small className="muted-copy">A API key fica somente no sessionStorage. Marcação de assistidos e progresso são endpoints disponíveis; use apenas os dados da sua própria conta.</small><a className="text-button" href="https://publicmetadb.com/settings" target="_blank" rel="noreferrer">Configurar PublicMetaDB <ExternalLink size={13}/></a></section>

    <section className="panel integration-provider-panel"><div className="panel-heading"><div className="panel-icon"><Activity size={20}/></div><div><h3>MDBList — ratings, listas e watchlist</h3><p>Consulta da API oficial e importação de itens com identificador TMDB.</p></div><span className={`status-pill ${mdblistKey?'ok':''}`}>{mdblistKey?'Chave nesta sessão':'Desconectado'}</span></div><label>API key</label><input className="wide-input" type="password" value={mdblistKey} onChange={e=>setMdblistKey(e.target.value)} autoComplete="off" placeholder="MDBList API key"/><div className="sync-action-grid"><button className="button-primary" disabled={busy||!mdblistKey.trim()} onClick={()=>void syncMdblist()}><RefreshCw size={15}/> Consultar watchlist</button><button className="button-secondary" disabled={!mdblistItems.length} onClick={importMdblistItems}><CheckCircle2 size={15}/> Importar {mdblistItems.length} itens</button><button className="text-button danger-text" onClick={()=>{setMdblistKey('');setMdblistItems([]);sessionRemove(sessionKey('mdblist'));setMdblistStatus('Chave removida desta sessão.');}}><LogOut size={15}/> Desconectar</button></div>{mdblistStatus&&<p className="form-hint">{mdblistStatus}</p>}<small className="muted-copy">A chave é mantida em sessionStorage e enviada à API apenas para a chamada MDBList. O serviço aplica quotas e limites próprios.</small><a className="text-button" href="https://mdblist.com/preferences/#api" target="_blank" rel="noreferrer">Gerenciar chave MDBList <ExternalLink size={13}/></a></section>

    <section className="panel integration-provider-panel"><div className="panel-heading"><div className="panel-icon"><UserRound size={20}/></div><div><h3>AniList — consulta GraphQL</h3><p>Valida token de sessão e identifica seu perfil.</p></div></div><label>Access token</label><input className="wide-input" type="password" value={aniListToken} onChange={e=>setAniListToken(e.target.value)} placeholder="Token AniList" autoComplete="off"/><div className="sync-action-grid"><button className="button-primary" disabled={busy||!aniListToken.trim()} onClick={()=>void connectAniList()}><CheckCircle2 size={15}/> Validar token</button><a className="text-button" href="https://anilist.co/settings/developer" target="_blank" rel="noreferrer">Criar aplicativo <ExternalLink size={13}/></a></div>{aniListStatus&&<p className="form-hint">{aniListStatus}</p>}{aniListItems.length>0&&<><div className="section-heading compact-heading"><b>Listas importadas</b><span className="count-bubble">{aniListItems.length}</span></div><div className="server-items-preview">{aniListItems.slice(0,10).map(item=><span key={String(item.sourceId)}>{item.title} · {item.sourceStatus}</span>)}</div></>}</section>

    <section className="panel integration-provider-panel"><div className="panel-heading"><div className="panel-icon"><Tv size={20}/></div><div><h3>Outros serviços e APIs</h3><p>Registro local de configurações; adaptadores específicos ainda dependem de suas APIs e credenciais.</p></div></div><label>Serviço</label><select className="wide-input" value={active} onChange={e=>setActive(e.target.value as ProviderId)}>{providers.filter(p=>p.id!=='trakt'&&p.id!=='simkl'&&p.id!=='jellyfin'&&p.id!=='emby'&&p.id!=='anilist').map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><p className="muted-copy">{selected.description}</p><label>Endpoint / servidor (opcional)</label><input className="wide-input" value={endpoint} onChange={e=>setEndpoint(e.target.value)} placeholder="https://..."/><label>API key / token</label><input className="wide-input" type="password" value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="Guardado apenas nesta sessão"/><div className="form-footer"><a className="text-button" href={selected.url} target="_blank" rel="noreferrer">Documentação <ExternalLink size={13}/></a><button className="button-primary" onClick={saveIntegration}><Save size={15}/> Guardar configuração</button></div></section>

    {message&&<div className="notice notice-info"><ShieldCheck size={17}/><span>{message}</span></div>}
    <section className="section-block"><div className="section-heading"><div><span className="eyebrow">CONFIGURAÇÕES LOCAIS</span><h2>Outras integrações</h2></div><span className="count-bubble">{saved.length}</span></div>{saved.length?saved.map(item=><article className="integration-card" key={item.id}><div className="panel-icon"><Link2 size={18}/></div><div className="integration-info"><b>{item.label}</b><span>{item.endpoint||item.note||'Configuração local'}</span></div><span className="local-tag">Local</span><button className="icon-button danger-button" onClick={()=>removeIntegration(item.id)} aria-label={`Remover ${item.label}`}><XCircle size={15}/></button></article>):<div className="empty-state"><div className="empty-icon"><Link2 size={22}/></div><h3>Nenhuma outra integração</h3><p>As conexões autenticadas aparecem nos cartões específicos acima.</p></div>}</section>
    <div className="notice notice-warning"><ShieldCheck size={17}/><div><b>Segurança e compatibilidade</b><span>As chaves de Trakt e SIMKL ficam na Render; tokens de usuário ficam na sessão do navegador. O app não envia tokens de terceiros para sincronização em nuvem. URLs privadas de mídia podem exigir CORS e HTTPS. Não cole tokens em computadores compartilhados.</span></div></div>
  </div>;
}
