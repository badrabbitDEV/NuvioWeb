import { useEffect, useState } from 'react';
import { Bell, Check, Trash2 } from 'lucide-react';
import { clearNotifications, markAllNotificationsRead, notificationPermission, notifyUser, readNotifications, requestNotificationPermission, type AppNotification } from './service';

export default function NotificationCenter() {
  const [items, setItems] = useState<AppNotification[]>(readNotifications());
  const [permission, setPermission] = useState(notificationPermission());
  useEffect(() => {
    const refresh = () => setItems(readNotifications());
    window.addEventListener('nuvio:notifications-updated', refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener('nuvio:notifications-updated', refresh); window.removeEventListener('storage', refresh); };
  }, []);
  async function enable() { setPermission(await requestNotificationPermission()); }
  function test() { notifyUser({ title: 'Nuvio Web', body: 'As notificações estão funcionando neste navegador.', tag: 'nuvio-test', osNotification: true }); }
  const unread = items.filter(item => !item.read).length;
  return <section className="panel settings-panel">
    <div className="panel-heading"><div className="panel-icon"><Bell size={20}/></div><div><h3>Notificações</h3><p>Avisos locais sobre ações do app. O envio ao sistema só ocorre após permissão do navegador.</p></div></div>
    <div className="setting-row"><div><b>Permissão do navegador</b><span>{permission === 'granted' ? 'Autorizada' : permission === 'denied' ? 'Bloqueada nas permissões do navegador' : permission === 'unsupported' ? 'Não suportada neste navegador' : 'Ainda não solicitada'}</span></div><button className="button-secondary" onClick={() => void enable()} disabled={permission === 'granted' || permission === 'unsupported'}>Ativar</button></div>
    <div className="setting-row"><div><b>Central local</b><span>{items.length} aviso(s) · {unread} não lido(s)</span></div><div className="setting-font-tools"><button className="icon-button" onClick={markAllNotificationsRead} disabled={!unread} title="Marcar todos como lidos"><Check size={15}/></button><button className="icon-button danger-button" onClick={clearNotifications} disabled={!items.length} title="Limpar avisos"><Trash2 size={15}/></button><button className="button-secondary" onClick={test}>Testar</button></div></div>
    {items.slice(0, 5).map(item => <div className="feature-status" key={item.id}><Bell size={15}/><div><b>{item.title}</b><span>{item.body}</span></div><em>{new Date(item.createdAt).toLocaleTimeString()}</em></div>)}
  </section>;
}
