import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HRHeader from '../../components/kit/HRHeader.jsx';
import Card from '../../components/kit/Card.jsx';
import StatBar from '../../components/kit/StatBar.jsx';
import Toolbar from '../../components/kit/Toolbar.jsx';
import EmptyState from '../../components/kit/EmptyState.jsx';
import Icon from '../../components/common/Icon.jsx';
import { listActivity, listOnboardingCases } from '../../api/onboarding.js';
import { listAllOnboardingDocuments } from '../../api/onboardingDocuments.js';
import { listVerifications } from '../../api/verification.js';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const WHEN = {
  today: { label: 'Today', days: 1 },
  week: { label: 'Last 7 days', days: 7 },
  month: { label: 'Last 30 days', days: 30 },
};

/* Pick an icon + colour from the action string, so the feed reads at a glance. */
function eventMeta(action = '') {
  const t = action.toLowerCase();
  if (t.includes('reject')) return { icon: 'XCircle', tone: 'red' };
  if (t.includes('reupload') || t.includes('revision')) return { icon: 'RotateCcw', tone: 'amber' };
  if (t.includes('approve') || t.includes('verify') || t.includes('verified')) return { icon: 'CheckCircle2', tone: 'green' };
  if (t.includes('request')) return { icon: 'Send', tone: 'blue' };
  if (t.includes('document')) return { icon: 'Files', tone: 'teal' };
  return { icon: 'CircleDot', tone: 'grey' };
}

function dayBucket(dateStr) {
  const start = (x) => { const d = new Date(x); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const diff = Math.round((start(Date.now()) - start(dateStr)) / 86400000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return new Date(dateStr).toLocaleDateString(undefined, { weekday: 'long' });
  return new Date(dateStr).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

const shortTime = (d) => new Date(d).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).toLowerCase();

export default function HRActivityPage() {
  const navigate = useNavigate();
  const [remote, setRemote] = useState({ loading: true, logs: [], docs: [], cases: [], verifications: [] });
  const [type, setType] = useState('all');
  const [when, setWhen] = useState('all');
  const [actor, setActor] = useState('all');

  useEffect(() => {
    let cancelled = false;
    Promise.all([listActivity(), listAllOnboardingDocuments(), listOnboardingCases(), listVerifications()])
      .then(([logs, docs, cases, verifications]) => {
        if (!cancelled) setRemote({ loading: false, logs: logs || [], docs: docs || [], cases: cases || [], verifications: verifications || [] });
      })
      .catch(() => !cancelled && setRemote({ loading: false, logs: [], docs: [], cases: [], verifications: [] }));
    return () => { cancelled = true; };
  }, []);

  const { logs, docs, cases, verifications } = remote;

  // Resolve each log entry to a candidate name + a place to click through to.
  const all = useMemo(() => {
    const caseById = new Map(cases.map((c) => [c.id, c]));
    const docToCase = new Map(docs.map((d) => [d.id, d.onboarding_case_id]));
    const verById = new Map(verifications.map((v) => [v.id, v]));
    return logs.map((l) => {
      let candidate = '';
      let linkCaseId = null;
      let linkApplicationId = null;
      if (l.entity_type === 'onboarding_case') {
        linkCaseId = l.entity_id;
        candidate = caseById.get(l.entity_id)?.candidate_name || '';
      } else if (l.entity_type === 'onboarding_document') {
        linkCaseId = docToCase.get(l.entity_id) || null;
        candidate = linkCaseId ? caseById.get(linkCaseId)?.candidate_name || '' : '';
      } else if (l.entity_type === 'document_verification') {
        const v = verById.get(l.entity_id);
        linkApplicationId = v?.source_application_id || null;
        candidate = v?.candidate_name || '';
      }
      return { ...l, candidate, linkCaseId, linkApplicationId };
    });
  }, [logs, cases, docs, verifications]);

  const types = useMemo(() => [...new Set(all.map((a) => a.entity_type).filter(Boolean))], [all]);
  const actors = useMemo(() => [...new Set(all.map((a) => a.actor_label).filter(Boolean))].sort(), [all]);

  const items = useMemo(
    () => all.filter((a) => {
      if (type !== 'all' && a.entity_type !== type) return false;
      if (actor !== 'all' && a.actor_label !== actor) return false;
      if (when !== 'all' && new Date(a.created_at).getTime() < Date.now() - WHEN[when].days * 86400000) return false;
      return true;
    }),
    [all, type, actor, when]
  );

  const groups = useMemo(() => {
    const out = [];
    items.forEach((it) => {
      const key = dayBucket(it.created_at);
      let g = out.find((x) => x.key === key);
      if (!g) { g = { key, items: [] }; out.push(g); }
      g.items.push(it);
    });
    return out;
  }, [items]);

  const last7 = useMemo(() => all.filter((a) => new Date(a.created_at).getTime() >= Date.now() - 7 * 86400000).length, [all]);

  const stats = [
    { icon: 'Activity', accent: 'blue', label: 'Events this week', value: last7 },
    { icon: 'FileSearch', accent: 'amber', label: 'Total logged', value: all.length },
  ];

  const chips = [
    type !== 'all' && { key: 'type', label: cap(type.replace(/_/g, ' ')), onRemove: () => setType('all') },
    when !== 'all' && { key: 'when', label: WHEN[when].label, onRemove: () => setWhen('all') },
    actor !== 'all' && { key: 'actor', label: actor, onRemove: () => setActor('all') },
  ].filter(Boolean);
  const clearAll = () => { setType('all'); setWhen('all'); setActor('all'); };

  const open = (it) => {
    if (it.linkCaseId) navigate(`/hr/candidates/${it.linkCaseId}`);
    else if (it.linkApplicationId) navigate(`/hr/applications/${it.linkApplicationId}`);
  };

  if (remote.loading) return <div className="hr-loading">Loading…</div>;

  return (
    <>
      <HRHeader title="Activity" subtitle="Every recorded HR action — document reviews, requests and decisions." />

      <StatBar items={stats} />

      <Toolbar
        filters={[
          { label: 'Type', value: type, onChange: setType, options: types.map((t) => ({ value: t, label: cap(t.replace(/_/g, ' ')) })) },
          { label: 'When', value: when, onChange: setWhen, options: Object.entries(WHEN).map(([value, w]) => ({ value, label: w.label })) },
          { label: 'Person', value: actor, onChange: setActor, options: actors.map((p) => ({ value: p, label: p })) },
        ]}
        chips={chips}
        onClearAll={chips.length ? clearAll : undefined}
      />

      {items.length === 0 ? (
        <Card><EmptyState icon="History" title="No activity found" message="Try clearing the filters." /></Card>
      ) : (
        <Card>
          {groups.map((g) => (
            <div className="act-day" key={g.key}>
              <div className="act-day__label">{g.key}<span className="act-day__count">{g.items.length}</span></div>
              <div className="act-feed">
                {g.items.map((it) => {
                  const m = eventMeta(it.action);
                  const clickable = !!(it.linkCaseId || it.linkApplicationId);
                  return (
                    <button
                      key={it.id}
                      type="button"
                      className={`act-feed__item${clickable ? ' act-feed__item--link' : ''}`}
                      onClick={clickable ? () => open(it) : undefined}
                      disabled={!clickable}
                    >
                      <span className={`act-feed__icon act-feed__icon--${m.tone}`}><Icon name={m.icon} size={15} /></span>
                      <div className="act-feed__body">
                        <div className="act-feed__head">
                          <span className="act-feed__title">
                            {cap(it.action.replace(/[._]/g, ' '))}
                            {it.candidate && <span className="act-feed__cand"> · {it.candidate}</span>}
                          </span>
                          <span className="act-feed__when">{shortTime(it.created_at)}</span>
                        </div>
                        <div className="act-feed__desc">
                          {it.remarks}
                          {it.actor_label && <span className="act-feed__actor"> · by {it.actor_label}</span>}
                        </div>
                      </div>
                      {clickable && <Icon name="ChevronRight" size={16} className="act-feed__go" />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
