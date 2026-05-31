import { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';

const navBtnStyle = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: '20px',
  color: '#0052cc',
  lineHeight: 1,
  padding: '0 6px'
};

function getDayCellStyle(day, isTodayFn) {
  if (!day) {
    return {
      padding: '6px 2px',
      borderRadius: '6px',
      fontSize: '13px',
      fontWeight: 400,
      background: 'transparent',
      color: 'transparent',
    };
  }

  const today = isTodayFn(day);
  return {
    padding: '6px 2px',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: today ? 700 : 400,
    background: today ? '#0052cc' : 'transparent',
    color: today ? '#fff' : '#0f172a',
  };
}

function Calendar({ anchorRef, onClose }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const popupRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        popupRef.current && !popupRef.current.contains(e.target) &&
        anchorRef.current && !anchorRef.current.contains(e.target)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [anchorRef, onClose]);

  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const dayNames = ['Su','Mo','Tu','We','Th','Fr','Sa'];
  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
  const isToday = (day) =>
    day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div ref={popupRef} style={{
      position: 'absolute',
      top: '60px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: '#fff',
      borderRadius: '10px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
      padding: '16px',
      zIndex: 2000,
      minWidth: '260px',
      userSelect: 'none'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <button onClick={prevMonth} style={navBtnStyle}>&#8249;</button>
        <span style={{ fontWeight: 700, fontSize: '15px', color: '#0f172a' }}>
          {monthNames[viewMonth]} {viewYear}
        </span>
        <button onClick={nextMonth} style={navBtnStyle}>&#8250;</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', textAlign: 'center' }}>
        {dayNames.map(d => (
          <div key={d} style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', padding: '4px 0' }}>{d}</div>
        ))}
        {cells.map((day, i) => (
          <div
            key={day ? `day-${viewYear}-${viewMonth}-${day}` : `pad-${viewYear}-${viewMonth}-${i}`}
            style={getDayCellStyle(day, isToday)}
          >
            {day || ''}
          </div>
        ))}
      </div>
    </div>
  );
}

Calendar.propTypes = {
  anchorRef: PropTypes.shape({ current: PropTypes.instanceOf(Element) }).isRequired,
  onClose: PropTypes.func.isRequired,
};

export default Calendar;
