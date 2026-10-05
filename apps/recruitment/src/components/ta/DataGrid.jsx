import Icon from '../common/Icon.jsx';
import EmptyState from './EmptyState.jsx';

/* Premium data table inside a card.
   - `columns`  : [{ key, label, sortable }]
   - `rows`     : array already sliced to the current page
   - `renderRow`: (row) => <tr>...</tr>
   - `sort`,`onSort` : optional sorting ({ key, dir })
   - `title`, `action` : optional card header
   - `pager`    : { page, pageSize, total, onPage } — drives the Prev/Next bar
                  shown under the table (the numbered pager lives on the Toolbar)
   - `empty`    : props for EmptyState when there are no rows */
// Placeholder rows while the data is still loading, so the table shape is visible at once.
function SkeletonBody({ columns, rows = 5 }) {
  return (
    <tbody aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r}>
          {columns.map((c) => (
            <td key={c.key}><span className="skeleton skeleton-bar" /></td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

export default function DataGrid({ columns, rows, renderRow, sort, onSort, title, action, pager, empty, loading }) {
  const pages = pager ? Math.max(1, Math.ceil(pager.total / pager.pageSize)) : 1;

  const goto = (p) => {
    pager.onPage(Math.min(pages, Math.max(1, p)));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="ta-table-card">
      {(title || action) && (
        <div className="ta-table-card__head">
          {title && <div className="ta-card__title">{title}</div>}
          {action}
        </div>
      )}

      {!loading && rows.length === 0 ? (
        <EmptyState {...(empty || { title: 'Nothing to show', message: 'Try changing the filters or search.' })} />
      ) : (
        <div className="ta-table-scroll">
          <table className="ta-table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={c.sortable ? 'sortable' : undefined}
                    onClick={c.sortable && onSort ? () => onSort(c.key) : undefined}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {c.label}
                      {c.sortable && sort?.key === c.key && (
                        <Icon name={sort.dir === 'asc' ? 'ArrowUp' : 'ArrowDown'} size={12} />
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            {loading ? <SkeletonBody columns={columns} /> : <tbody>{rows.map(renderRow)}</tbody>}
          </table>
        </div>
      )}

      {pager && rows.length > 0 && pages > 1 && (
        <div className="ta-gridnav">
          <button type="button" className="ta-btn ta-btn--ghost" disabled={pager.page <= 1} onClick={() => goto(pager.page - 1)}>
            <Icon name="ChevronLeft" size={15} /> Previous
          </button>
          <span className="ta-gridnav__pos">Page {pager.page} of {pages}</span>
          <button type="button" className="ta-btn ta-btn--ghost" disabled={pager.page >= pages} onClick={() => goto(pager.page + 1)}>
            Next <Icon name="ChevronRight" size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
