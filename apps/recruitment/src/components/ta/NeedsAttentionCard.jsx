import Icon from '../common/Icon.jsx';

/* "Needs Attention" — restrained navy header, and a stack of clean white
   rows (tone-colored icon badge + count pill) for each real signal pulled
   off the pipeline. */
export default function NeedsAttentionCard({ rows }) {
  return (
    <section className="ta-needs-attention">
      <div className="ta-needs-attention__head">
        <span className="ta-needs-attention__icon"><Icon name="AlertTriangle" size={15} /></span>
        <div>
          <h3>Needs Attention</h3>
          <p>Key items that require your action</p>
        </div>
      </div>

      <div className="ta-needs-attention__body">
        {rows.length === 0 ? (
          <div className="ta-note ta-note--ok"><Icon name="CheckCircle2" size={15} /> Nothing needs follow-up right now — the pipeline's clean.</div>
        ) : (
          rows.map((r) => (
            <button key={r.key} type="button" className="ta-attention-item" onClick={r.onClick}>
              <span className={`ta-attention-item__icon ta-attention-item__icon--${r.tone}`}><Icon name={r.icon} size={14} /></span>
              <span className="ta-attention-item__text">
                <span className="ta-attention-item__label">{r.shortLabel}</span>
                <span className="ta-attention-item__detail">{r.label}</span>
              </span>
              <span className={`ta-attention-item__count ta-attention-item__count--${r.tone}`}>{r.count}</span>
              <Icon className="ta-attention-item__arrow" name="ChevronRight" size={14} />
            </button>
          ))
        )}
      </div>
    </section>
  );
}
