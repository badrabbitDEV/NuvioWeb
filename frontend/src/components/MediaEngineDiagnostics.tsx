import { useEffect, useState } from 'react';
import { Cpu, Gauge, RefreshCw, ShieldCheck, Zap } from 'lucide-react';
import { inspectMediaEngine, type MediaEngineReport } from '../lib/media-engine';

export default function MediaEngineDiagnostics(){
  const [report,setReport]=useState<MediaEngineReport|null>(null);
  const [loading,setLoading]=useState(false);
  async function refresh(){setLoading(true);try{setReport(await inspectMediaEngine());}finally{setLoading(false);}}
  useEffect(()=>{void refresh();},[]);
  const status=(value:boolean)=>value?'Disponível':'Não detectado';
  return <section className="panel settings-panel media-engine-panel">
    <div className="panel-heading"><div className="panel-icon"><Cpu size={20}/></div><div><h3>Motor de mídia e aceleração</h3><p>Diagnóstico do que o navegador e o dispositivo expõem à aplicação.</p></div><button className="icon-button" onClick={()=>void refresh()} disabled={loading} title="Testar novamente"><RefreshCw size={15} className={loading?'spin':''}/></button></div>
    {report?<>
      <div className="engine-badges"><span><ShieldCheck size={14}/> {report.browser}</span><span><Zap size={14}/> Contexto seguro: {report.secureContext?'sim':'não'}</span></div>
      <div className="setting-row"><div><b>WebCodecs</b><span>APIs de encode/decode disponíveis no navegador.</span></div><strong className="engine-state">{status(report.webCodecs)}</strong></div>
      <div className="setting-row"><div><b>WebGPU</b><span>GPU para computação e efeitos compatíveis.</span></div><strong className="engine-state">{status(report.webGpu)}</strong></div>
      <div className="setting-row"><div><b>WebGL</b><span>GPU para composição e efeitos visuais.</span></div><strong className="engine-state">{status(report.webGl)}</strong></div>
      <div className="setting-row"><div><b>Integração nativa</b><span>Bridge para um host desktop/mobile com MPV/ExoPlayer.</span></div><strong className="engine-state">{report.nativeBridge?`Detectada (${report.nativeEngine??'nativa'})`:'Somente navegador'}</strong></div>
      <div className="engine-codec-list">{report.probes.map(probe=><div className="engine-codec" key={probe.codec}><div><b>{probe.codec}</b><small>{probe.note??(probe.powerEfficient===undefined?'Decodificação suportada pelo navegador':probe.powerEfficient?'Caminho eficiente em energia detectado':'Caminho eficiente em energia não confirmado')}</small></div><strong className={probe.supported?'healthy':'service-disabled'}>{probe.supported?(probe.smooth?'Suave':'Suportado'):'Indisponível'}</strong></div>)}</div>
      <div className="notice notice-info"><Gauge size={16}/><span>O navegador controla a aceleração de vídeo. Este diagnóstico verifica a capacidade declarada; não força GPU. libmpv não pode ser carregado como biblioteca nativa dentro de uma página Vercel. Para usar MPV real, é necessário um app host (desktop/mobile) que exponha uma bridge nativa.</span></div>
      <small className="engine-timestamp">Verificado em {new Date(report.checkedAt).toLocaleString('pt-BR')}</small>
    </>:<p className="admin-muted">{loading?'Consultando codecs e capacidades da GPU…':'Não foi possível concluir o diagnóstico.'}</p>}
  </section>;
}
