import Icon from '../common/Icon.jsx';

/* Soft, rounded status pill. `tone` is one of:
   blue | violet | amber | teal | green | red | grey */
export default function Tag({ tone = 'grey', icon, children }) {
  return (
    <span className={`hr-tag hr-tag--${tone}`}>
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}
