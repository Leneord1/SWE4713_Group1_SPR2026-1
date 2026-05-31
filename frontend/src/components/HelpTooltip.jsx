import { cloneElement, isValidElement, useId, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import './HelpTooltip.css';

export function HelpTooltip({ text, children, className = '' }) {
  const tipId = useId();
  const hoverDelayMs = 1200;
  const [visible, setVisible] = useState(false);
  const [placement, setPlacement] = useState('top');
  const timerRef = useRef(null);
  const wrapperRef = useRef(null);
  const bubbleRef = useRef(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, []);

  useEffect(() => {
    if (!visible) {
      return undefined;
    }

    const updatePlacement = () => {
      if (!wrapperRef.current || !bubbleRef.current) {
        return;
      }

      const wrapperRect = wrapperRef.current.getBoundingClientRect();
      const bubbleHeight = bubbleRef.current.offsetHeight;
      const tooltipGap = 8;
      const navbar = document.querySelector('.navbar');
      const navbarBottom = navbar ? navbar.getBoundingClientRect().bottom : 0;
      const projectedTop = wrapperRect.top - bubbleHeight - tooltipGap;
      const nextPlacement = projectedTop <= navbarBottom + 2 ? 'bottom' : 'top';

      setPlacement((prev) => (prev === nextPlacement ? prev : nextPlacement));
    };

    updatePlacement();
    window.addEventListener('resize', updatePlacement);
    window.addEventListener('scroll', updatePlacement, true);

    return () => {
      window.removeEventListener('resize', updatePlacement);
      window.removeEventListener('scroll', updatePlacement, true);
    };
  }, [visible]);

  if (!text || !isValidElement(children)) {
    return children;
  }

  const existing = children.props['aria-describedby'];
  const describedBy = [existing, tipId].filter(Boolean).join(' ');

  const child = cloneElement(children, {
    'aria-describedby': describedBy,
  });

  const show = () => setVisible(true);
  const hide = () => {
    clearTimer();
    setVisible(false);
  };

  const startHoverTimer = () => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      setVisible(true);
      timerRef.current = null;
    }, hoverDelayMs);
  };

  const handleMouseEnter = () => {
    startHoverTimer();
  };

  const handleMouseLeave = () => {
    if (wrapperRef.current?.contains(document.activeElement)) {
      clearTimer();
      return;
    }
    hide();
  };

  const handleFocusCapture = () => {
    clearTimer();
    show();
  };

  const handleBlurCapture = (e) => {
    const next = e.relatedTarget;
    if (wrapperRef.current && next && wrapperRef.current.contains(next)) {
      return;
    }
    hide();
  };

  return (
    <span
      ref={wrapperRef}
      className={`help-tooltip-wrap ${className}`.trim()}
      data-visible={visible ? 'true' : 'false'}
      data-placement={placement}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocusCapture={handleFocusCapture}
      onBlurCapture={handleBlurCapture}
      role="presentation"
    >
      {child}
      <span ref={bubbleRef} id={tipId} role="tooltip" className="help-tooltip-bubble">
        {text}
      </span>
    </span>
  );
}

HelpTooltip.propTypes = {
  text: PropTypes.string,
  children: PropTypes.node,
  className: PropTypes.string,
};
