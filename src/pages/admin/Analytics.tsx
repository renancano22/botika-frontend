import { useSearchParams } from 'react-router-dom';
import BackButton from '../../components/BackButton';
import { Svg } from '../../components/RequestCards';
import { DemandAnalysisSection } from '../shared/OperationsDashboard';
import Forecasting from './Forecasting';

type Tab = 'analysis' | 'forecast';

const TABS: { key: Tab; label: string; hint: string; icon: string }[] = [
  { key: 'analysis', label: 'Demand Analysis', hint: 'Requests and dispensing in a period', icon: 'M4 20V10M10 20V4M16 20v-7M22 20H2' },
  { key: 'forecast', label: 'Demand Forecasting', hint: 'Predicted needs and restocking', icon: 'M3 17l6-6 4 4 8-8M15 7h6v6' },
];

/**
 * Administrator: Analytics (Process 5.0) — Demand Analysis and Demand Forecasting in one place, one tab each.
 * The tab is kept in the address (?tab=forecast) so links and the back button open the right one.
 */
export default function Analytics() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'forecast' ? 'forecast' : 'analysis';
  const choose = (t: Tab) => setParams(t === 'analysis' ? {} : { tab: t }, { replace: true });

  return (
    <div className="page an-page">
      <BackButton linkedOnly />
      <header className="page-head hero-head db-hero an-hero">
        <div>
          <div className="page-title"><h1>Analytics</h1></div>
          <p className="muted">Medicine demand from the BulanBotikaCare records: what was requested and given out, and what is expected next.</p>
        </div>
      </header>

      <div className="an-tabs" role="tablist" aria-label="Analytics">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" id={`an-tab-${t.key}`} aria-selected={tab === t.key} aria-controls="an-panel"
            className={`an-tab ${tab === t.key ? 'active' : ''}`} onClick={() => choose(t.key)}>
            <span className="an-tab-icon"><Svg d={t.icon} size={20} /></span>
            <span className="an-tab-text"><strong>{t.label}</strong><small>{t.hint}</small></span>
          </button>
        ))}
      </div>

      <div id="an-panel" role="tabpanel" aria-labelledby={`an-tab-${tab}`} className="an-panel">
        {tab === 'analysis' ? <DemandAnalysisSection /> : <Forecasting embedded />}
      </div>
    </div>
  );
}
