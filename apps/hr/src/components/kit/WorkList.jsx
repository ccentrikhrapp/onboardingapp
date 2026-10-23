import Icon from '../common/Icon.jsx';

function initialsOf(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join('');
}

/* A flat row inside a worklist group — avatar, label, one line of context,
   an optional tag, a trailing element. Not a card and not a table row: the
   row-list is this app's one list idiom, used for the "Today" worklist and
   every record list (candidates, employees, activity, …) in place of the
   stat-tiles + data-table pattern. */
export function WorkListRow({ onClick, avatar, lead, sub, tag, trail }) {
  return (
    <button className="hr-pipe__row" onClick={onClick}>
      {avatar !== false && <span className="hr-pipe__avatar">{initialsOf(avatar || lead)}</span>}
      <span className="hr-pipe__label">
        {lead}
        {sub && <><br /><span className="hr-cell-sub">{sub}</span></>}
      </span>
      {tag}
      {trail || <Icon name="ChevronRight" size={16} />}
    </button>
  );
}

export function WorkListGroup({ title, count, countTone, children, empty }) {
  return (
    <section className="hr-worklist-group">
      <div className="hr-worklist-group__head">
        <h2>{title}</h2>
        {count != null && <span className={`hr-worklist-group__count${countTone ? ` hr-worklist-group__count--${countTone}` : ''}`}>{count}</span>}
      </div>
      {children || <p className="hr-cell-mute">{empty}</p>}
    </section>
  );
}
