/* Plain premium card. Optional header with a title and a right-side action. */
export default function Card({ id, title, action, children, bodyStyle }) {
  return (
    <section className="hr-card" id={id}>
      {(title || action) && (
        <div className="hr-card__head">
          {title && <h3 className="hr-card__title">{title}</h3>}
          {action}
        </div>
      )}
      <div className="hr-card__body" style={bodyStyle}>{children}</div>
    </section>
  );
}
