import Icon from '../../common/Icon.jsx';
import Button from '../../ta/Button.jsx';
const FieldGrid = ({ children }) => <div className="jf-grid">{children}</div>;
import FieldControl from './FieldControl.jsx';
import { fieldIsRequired, fieldIsVisible, groupIsVisible, sectionProgress } from '../../../utils/joiningSchema.ts';

/* Renders one schema section: "fields" groups as a grid, "list" groups as
   repeating rows (family members, employers, nominees…) with add / remove.
   Errors appear only for fields the person has touched, or everywhere once
   they try to move on (`showAll`). */
export default function SectionForm({ section, data, onChange, disabled, sources, edited, touched, onTouch, showAll, corrections }) {
  const { errors } = sectionProgress(section, data);
  const seg = data?.[section.id] ?? {};
  const remarkFor = (path) => corrections.find((c) => c.field === path)?.remark;
  const errFor = (path) => (showAll || touched[path] ? errors[path] : undefined);
  const sourceFor = (path) => (edited.has(path) ? 'employee' : sources[path]);

  const setGroup = (gid, val) => onChange({ ...seg, [gid]: val });

  return (
    <div className="jf-sections">
      {section.groups.filter((g) => groupIsVisible(g, data)).map((g) => {
        if (g.kind === 'fields') {
          const obj = seg[g.id] ?? {};
          return (
            <div key={g.id}>
              {g.title && <h4 className="ta-card__title" style={{ margin: '0 0 8px' }}>{g.title}</h4>}
              <FieldGrid>
                {g.fields.filter((f) => fieldIsVisible(f, data)).map((f) => {
                  const path = `${section.id}.${g.id}.${f.key}`;
                  return (
                    <FieldControl
                      key={f.key} field={f} value={obj[f.key] ?? f.defaultValue ?? ''} disabled={disabled}
                      isRequired={fieldIsRequired(f, data)} error={errFor(path)} source={sourceFor(path)} remark={remarkFor(path)}
                      onChange={(v) => setGroup(g.id, { ...obj, [f.key]: v })} onBlur={() => onTouch(path)}
                    />
                  );
                })}
              </FieldGrid>
            </div>
          );
        }

        const rows = seg[g.id] ?? [];
        const listErr = errFor(`${section.id}.${g.id}`) || (showAll ? errors[`${section.id}.${g.id}`] : undefined);
        return (
          <div key={g.id}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <h4 className="ta-card__title" style={{ margin: 0 }}>{g.title || `${g.itemTitle}s`}</h4>
              {!disabled && <Button variant="ghost" icon="Plus" onClick={() => setGroup(g.id, [...rows, {}])}>{g.addLabel}</Button>}
            </div>
            {g.hint && <p className="ta-cell-sub" style={{ marginBottom: 8 }}>{g.hint}</p>}
            {rows.length === 0 && <p className="ta-cell-sub">None added yet.</p>}
            {listErr && <div className="ta-field__error" style={{ marginBottom: 8 }}><Icon name="AlertCircle" size={12} /> {listErr}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rows.map((row, i) => (
                <div key={i} style={{ border: '1px solid var(--ta-line, #e5e7eb)', borderRadius: 10, padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <strong style={{ fontSize: 13 }}>{g.itemTitle} {i + 1}</strong>
                    {!disabled && (
                      <button type="button" className="ta-iconbtn" aria-label={`Remove ${g.itemTitle} ${i + 1}`} onClick={() => setGroup(g.id, rows.filter((_, j) => j !== i))}>
                        <Icon name="Trash2" size={15} />
                      </button>
                    )}
                  </div>
                  <FieldGrid>
                    {g.fields.filter((f) => fieldIsVisible(f, data, row)).map((f) => {
                      const path = `${section.id}.${g.id}.${i}.${f.key}`;
                      return (
                        <FieldControl
                          key={f.key} field={f} value={row[f.key] ?? ''} disabled={disabled}
                          isRequired={fieldIsRequired(f, data, row)} error={errFor(path)} source={sourceFor(path)} remark={remarkFor(path)}
                          onChange={(v) => setGroup(g.id, rows.map((r, j) => (j === i ? { ...r, [f.key]: v } : r)))} onBlur={() => onTouch(path)}
                        />
                      );
                    })}
                  </FieldGrid>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {Object.entries(errors).filter(([k]) => k.startsWith(`${section.id}.rule.`)).map(([k, msg]) => (
        (showAll || Object.keys(touched).some((t) => t.startsWith(`${section.id}.`))) && (
          <div key={k} className="ta-note ta-note--warn"><Icon name="AlertTriangle" size={14} /> <span>{msg}</span></div>
        )
      ))}
    </div>
  );
}
