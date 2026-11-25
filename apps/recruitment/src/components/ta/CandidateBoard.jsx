import { useState } from 'react';
import Icon from '../common/Icon.jsx';
import { initialsOf, avatarToneOf, formatDate } from '../../utils/format.js';

/* Stage-grouped Kanban board — click a card to open the candidate. Cards
   can also be dragged one column to the right; the parent decides whether
   that's actually a valid workflow transition and what to do about it
   (see onDropCard) — this component never changes status itself. */
export default function CandidateBoard({ columns, rows, onOpen, onDropCard }) {
  const grouped = columns.map((col) => ({ ...col, items: rows.filter((r) => col.match(r.status)) }));
  const [dragOverCol, setDragOverCol] = useState(null);

  const handleDrop = (e, colKey) => {
    e.preventDefault();
    setDragOverCol(null);
    const id = e.dataTransfer.getData('text/plain');
    const row = rows.find((r) => String(r.id) === id);
    if (row && onDropCard) onDropCard(row, colKey);
  };

  return (
    <div className="ta-board">
      {grouped.map((col) => (
        <div
          className={`ta-board__col${dragOverCol === col.key ? ' is-dragover' : ''}`}
          key={col.key}
          onDragOver={onDropCard ? (e) => { e.preventDefault(); setDragOverCol(col.key); } : undefined}
          onDragLeave={onDropCard ? () => setDragOverCol((k) => (k === col.key ? null : k)) : undefined}
          onDrop={onDropCard ? (e) => handleDrop(e, col.key) : undefined}
        >
          <div className="ta-board__colhead">
            <span className="ta-board__coldot" style={{ background: col.color }} />
            <span className="ta-board__coltitle">{col.label}</span>
            <span className="ta-board__colcount">{col.items.length}</span>
          </div>
          <div className="ta-board__cards">
            {col.items.length === 0 && <div className="ta-board__empty">No candidates</div>}
            {col.items.map((r) => (
              <button
                key={r.id}
                className="ta-board__card"
                onClick={() => onOpen(r)}
                draggable={!!onDropCard}
                onDragStart={onDropCard ? (e) => e.dataTransfer.setData('text/plain', String(r.id)) : undefined}
              >
                <span className="ta-board__cardtop">
                  <span className={`ta-avatar ta-avatar--${avatarToneOf(r.name)}`}>{initialsOf(r.name)}</span>
                  <span className="ta-board__cardname">
                    <span className="ta-board__cardtitle">{r.name}</span>
                    <span className="ta-board__cardsub">{r.job}</span>
                  </span>
                </span>
                <span className="ta-board__cardmeta">
                  <span><Icon name="Hash" size={11} /> {r.candidateCode}</span>
                  <span><Icon name="Calendar" size={11} /> {formatDate(r.createdAt)}</span>
                </span>
                {r.assignedToName && r.assignedToName !== '—' && (
                  <span className="ta-board__cardassignee"><Icon name="UserRound" size={11} /> {r.assignedToName}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
