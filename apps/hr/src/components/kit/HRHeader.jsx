import { useLayoutEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';

/* Every HR page renders one of these. It doesn't draw anything itself — it
   hands the title/subtitle/optional back-link to the layout, which shows
   them in the top bar (one header band, not two). */
export default function HRHeader({ title, subtitle, backTo, backLabel }) {
  const { setHead } = useOutletContext();
  const navigate = useNavigate();

  useLayoutEffect(() => {
    setHead({ title, subtitle, backTo, backLabel, onBack: backTo ? () => navigate(backTo) : null });
    return () => setHead(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, subtitle, backTo, backLabel]);

  return null;
}
