import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { HelpTooltip } from './HelpTooltip';
import './PageHelpCorner.css';

export default function PageHelpCorner({ topic }) {
  const navigate = useNavigate();

  const openHelp = () => {
    if (topic) {
      navigate(`/help?topic=${encodeURIComponent(topic)}`);
    } else {
      navigate('/help');
    }
  };

  return (
    <HelpTooltip text="Open the user manual and help topics for this screen.">
      <button
        type="button"
        className="page-help-corner"
        onClick={openHelp}
        aria-label="Open help and user manual"
      >
        Help
      </button>
    </HelpTooltip>
  );
}

PageHelpCorner.propTypes = {
  topic: PropTypes.string,
};
