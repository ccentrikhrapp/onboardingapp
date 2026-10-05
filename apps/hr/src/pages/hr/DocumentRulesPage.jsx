import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../../components/common/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { listDocConfig, updateDocConfig } from '../../api/joining.js';
import '../../styles/documentRules.css';
import { SkeletonPage, SkeletonBlock, SkeletonLine } from '../../components/kit/Skeleton.jsx';

/* Settings › Documents › Document Rules (admin configuration).
   Presentation only: the rules, validation and save call are the same as
   before. Each change is saved from the configuration drawer in one update. */

const REQUIREMENT_OPTIONS = [
  { value: 'critical', label: 'Mandatory', hint: 'Blocks approval until HR resolves it.' },
  { value: 'conditional', label: 'Conditional', hint: 'Applies only in some situations (for example previous-employer papers for experienced joiners).' },
  { value: 'optional', label: 'Optional', hint: 'Never blocks approval.' },
];
const REQUIREMENT_LABEL = Object.fromEntries(REQUIREMENT_OPTIONS.map((o) => [o.value, o.label]));

function describe(r) {
  const parts = [];
  if (r.anyOf) parts.push('PAN or Aadhaar accepted');
  if (r.perEmployer) parts.push('One per previous employer');
  if (r.dataOnly) parts.push('Filled from the joining form');
  return parts.join(' · ');
}

function StatusBadge({ active }) {
  return (
    <span className={`drl-status ${active ? 'drl-status--active' : 'drl-status--inactive'}`}>
      <span className="drl-status__dot" aria-hidden="true" />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

function Toggle({ id, checked, disabled, onChange, label }) {
  return (
    <label className="drl-toggle" htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="drl-toggle__track" aria-hidden="true" />
      <span className="drl-toggle__label">{label}</span>
    </label>
  );
}

function ConfigDrawer({ rule, busy, onClose, onSave }) {
  // Lock page scroll while the drawer is open, so only the drawer scrolls.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
  const [draft, setDraft] = useState(() => ({
    classification: rule.classification,
    active: rule.active,
    cannotProvide: rule.cannotProvide,
    naAllowed: rule.naAllowed,
    hrApproval: rule.hrApproval,
    maxFiles: rule.maxFiles,
  }));
  const [maxError, setMaxError] = useState('');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const save = () => {
    const n = Number(draft.maxFiles);
    if (!rule.dataOnly && (!Number.isInteger(n) || n < 1 || n > 30)) {
      setMaxError('Enter a whole number from 1 to 30.');
      return;
    }
    // Only the fields that actually changed are sent.
    const changes = {};
    for (const key of Object.keys(draft)) {
      if (rule.dataOnly && (key === 'cannotProvide' || key === 'maxFiles')) continue;
      if (draft[key] !== rule[key]) changes[key] = key === 'maxFiles' ? n : draft[key];
    }
    onSave(changes);
  };

  return createPortal(
    <div className="drl-overlay" onClick={onClose}>
      <aside className="drl-drawer" role="dialog" aria-modal="true" aria-labelledby="drl-drawer-title" onClick={(e) => e.stopPropagation()}>
        <header className="drl-drawer__head">
          <div>
            <h2 id="drl-drawer-title" className="drl-drawer__title">{rule.name}</h2>
            {describe(rule) && <p className="drl-drawer__desc">{describe(rule)}</p>}
          </div>
          <button className="drl-iconbtn" onClick={onClose} aria-label="Close"><Icon name="X" size={18} /></button>
        </header>

        <div className="drl-drawer__body">
          <div className="drl-section">
            <div className="drl-section__label">Status</div>
            <Toggle id="drl-active" checked={draft.active} disabled={busy} onChange={(v) => set({ active: v })}
              label={draft.active ? 'Active: requested from employees' : 'Inactive: not requested'} />
          </div>

          <div className="drl-section">
            <div className="drl-section__label">Requirement</div>
            <div className="drl-radiogroup" role="radiogroup" aria-label="Requirement">
              {REQUIREMENT_OPTIONS.map((o) => (
                <label key={o.value} className={`drl-radio${draft.classification === o.value ? ' drl-radio--on' : ''}`}>
                  <input type="radio" name="drl-requirement" value={o.value} checked={draft.classification === o.value}
                    disabled={busy} onChange={() => set({ classification: o.value })} />
                  <span className="drl-radio__title">{o.label}</span>
                  <span className="drl-radio__hint">{o.hint}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="drl-section">
            <div className="drl-section__label">Exceptions</div>
            <Toggle id="drl-cannot" checked={draft.cannotProvide} disabled={busy || rule.dataOnly}
              onChange={(v) => set({ cannotProvide: v })} label="Allow “cannot provide” with a reason" />
            <Toggle id="drl-na" checked={draft.naAllowed} disabled={busy} onChange={(v) => set({ naAllowed: v })}
              label="Allow “not applicable”" />
          </div>

          <div className="drl-section">
            <div className="drl-section__label">HR review</div>
            <Toggle id="drl-hr" checked={draft.hrApproval} disabled={busy} onChange={(v) => set({ hrApproval: v })}
              label="HR approval required when an exception is submitted" />
          </div>

          <div className="drl-section">
            <div className="drl-section__label">Upload limit</div>
            <label className="drl-field" htmlFor="drl-max">
              <span className="drl-field__label">Maximum files</span>
              <input id="drl-max" className="drl-input drl-input--short" type="number" min="1" max="30"
                value={draft.maxFiles} disabled={busy || rule.dataOnly}
                onChange={(e) => { set({ maxFiles: e.target.value }); setMaxError(''); }} />
            </label>
            <p className="drl-helper">{maxError || (rule.dataOnly ? 'Filled from the joining form, so no file upload.' : 'Most files an employee can upload for this document.')}</p>
          </div>
        </div>

        <footer className="drl-drawer__foot">
          <button className="drl-btn drl-btn--ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="drl-btn drl-btn--primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </footer>
      </aside>
    </div>,
    document.body,
  );
}

export default function DocumentRulesPage() {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [openKey, setOpenKey] = useState(null);
  const [query, setQuery] = useState('');
  const [requirement, setRequirement] = useState('all');
  const [status, setStatus] = useState('all');

  useEffect(() => {
    listDocConfig().then((r) => setRows(r.config)).catch((e) => { toast.error(e.message || 'Could not load the rules.'); setRows([]); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !`${r.name} ${r.group} ${describe(r)}`.toLowerCase().includes(q)) return false;
      if (requirement !== 'all' && r.classification !== requirement) return false;
      if (status === 'active' && !r.active) return false;
      if (status === 'inactive' && r.active) return false;
      return true;
    });
  }, [rows, query, requirement, status]);

  const groups = useMemo(() => {
    const order = [];
    for (const r of filtered) if (!order.includes(r.group)) order.push(r.group);
    return order.map((g) => ({ name: g, items: filtered.filter((r) => r.group === g) }));
  }, [filtered]);

  const openRule = rows?.find((r) => r.key === openKey) ?? null;

  const save = async (changes) => {
    setBusy(true);
    try {
      const r = await updateDocConfig(openKey, changes);
      setRows(r.config);
      setOpenKey(null);
      toast.success('Document rules updated successfully.');
    } catch (e) {
      toast.error(e.message || 'Could not save those changes.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="drl">
      <header className="drl-header">
        <h1 className="drl-title">Document Rules</h1>
        <p className="drl-desc">Configure which documents are required during the employee onboarding process.</p>
      </header>

      <div className="drl-note" role="note">
        <Icon name="Info" size={16} />
        <span>These rules determine document requirements, exceptions and HR approval during onboarding.</span>
      </div>

      <div className="drl-toolbar">
        <label className="drl-search">
          <Icon name="Search" size={16} />
          <input type="search" placeholder="Search documents…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search documents" />
        </label>
        <label className="drl-select">
          <span>Requirement</span>
          <select value={requirement} onChange={(e) => setRequirement(e.target.value)}>
            <option value="all">All</option>
            {REQUIREMENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="drl-select">
          <span>Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
      </div>

      {!rows ? (
        <SkeletonBlock lines={6} />
      ) : groups.length === 0 ? (
        <div className="drl-empty">No documents match these filters.</div>
      ) : (
        <div className="drl-groups">
          {groups.map((g) => (
            <section key={g.name} className="drl-group" aria-label={g.name}>
              <h2 className="drl-group__title">{g.name}</h2>
              <ul className="drl-list">
                {g.items.map((r) => (
                  <li key={r.key} className="drl-row">
                    <div className="drl-row__main">
                      <div className="drl-row__head">
                        <span className="drl-row__name">{r.name}</span>
                        <StatusBadge active={r.active} />
                      </div>
                      {describe(r) && <p className="drl-row__desc">{describe(r)}</p>}
                      <p className="drl-row__meta">
                        <span className="drl-meta-label">Requirement</span>
                        <span className={`drl-req drl-req--${r.classification}`}>{REQUIREMENT_LABEL[r.classification] ?? r.classification}</span>
                      </p>
                    </div>
                    <button className="drl-btn drl-btn--secondary" onClick={() => setOpenKey(r.key)} disabled={busy}>
                      Configure <Icon name="ChevronRight" size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {openRule && (
        <ConfigDrawer key={openRule.key} rule={openRule} busy={busy} onClose={() => !busy && setOpenKey(null)} onSave={save} />
      )}
    </div>
  );
}
