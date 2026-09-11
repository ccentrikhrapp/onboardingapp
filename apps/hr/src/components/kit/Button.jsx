import Icon from '../common/Icon.jsx';

/* Premium button. variant: 'primary' | 'ghost' | 'danger'. */
export default function Button({ children, variant = 'primary', icon, iconRight, className = '', ...rest }) {
  return (
    <button className={`hr-btn hr-btn--${variant} ${className}`} {...rest}>
      {icon && <Icon name={icon} size={15} />}
      {children}
      {iconRight && <Icon name={iconRight} size={15} />}
    </button>
  );
}
