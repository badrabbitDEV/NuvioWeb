import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useApp } from '../lib/context';
import { trackEvent } from '../lib/analytics';

export default function AnalyticsTracker() {
  const location = useLocation();
  const { edition, settings } = useApp();
  useEffect(() => {
    if (!settings.analyticsOptIn || location.pathname.startsWith('/admin')) return;
    const firstSegment = location.pathname.split('/').filter(Boolean)[0] ?? 'home';
    const safeRoute = firstSegment === 'details' || firstSegment === 'anilist' ? '/details' : `/${firstSegment}`;
    trackEvent('page_view', edition, { route: safeRoute });
  }, [location.pathname, edition, settings.analyticsOptIn]);
  return null;
}
