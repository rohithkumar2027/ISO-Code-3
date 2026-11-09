import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../lib/SessionContext';
import './header-menu.css';

export function HeaderMenu() {
  const {
    patient,
    logout,
    doctor,
    doctorLogout,
    theme,
    toggleTheme,
    setActiveModal,
  } = useSession();

  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isDoctor = !!doctor;
  const isPatient = !!patient;

  async function handleLogout() {
    setOpen(false);
    if (isDoctor) {
      doctorLogout();
      navigate('/doctor/login');
    } else {
      await logout();
      navigate('/login');
    }
  }

  return (
    <div className="header-menu-container" ref={menuRef}>
      {/* Profile Photo / Avatar with Three-Dots Toggle Button */}
      <button
        type="button"
        className="menu-trigger-btn"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label="User profile, support and settings"
      >
        <div className="avatar-wrapper">
          {isDoctor ? (
            <div className="profile-photo doctor-photo" title={doctor.name || 'Doctor'}>
              <span>🩺</span>
              <span className="online-indicator" />
            </div>
          ) : isPatient ? (
            <div className="profile-photo patient-photo" title={patient.maskedMobile || 'Patient'}>
              <span>👤</span>
              <span className="online-indicator" />
            </div>
          ) : (
            <div className="profile-photo guest-photo" title="Guest User">
              <span>⚕</span>
            </div>
          )}
        </div>

        {/* User preview label */}
        <div className="user-text-preview">
          <span className="user-name-small">
            {isDoctor ? (doctor.name || 'Dr. Sharma') : isPatient ? 'My Account' : 'Sign In'}
          </span>
          <span className="user-role-small">
            {isDoctor ? 'Pathologist' : isPatient ? patient.maskedMobile : 'Pharmacy Portal'}
          </span>
        </div>

        {/* Three Dots Icon */}
        <div className="three-dots-icon" aria-hidden="true">
          <span className="dot" />
          <span className="dot" />
          <span className="dot" />
        </div>
      </button>

      {/* Dropdown Popover */}
      {open && (
        <div className="menu-dropdown-card">
          {/* User Header in Dropdown */}
          <div className="dropdown-user-header">
            <div className="dropdown-avatar-big">
              {isDoctor ? '🩺' : isPatient ? '👤' : '⚕'}
            </div>
            <div className="dropdown-user-info">
              <strong className="dropdown-name">
                {isDoctor
                  ? (doctor.name || 'Dr. Rajesh Sharma, MD')
                  : isPatient
                  ? 'Patient Record'
                  : 'Company A Diagnostics'}
              </strong>
              <div className="dropdown-sub">
                {isDoctor
                  ? `${doctor.username} · Pathologist`
                  : isPatient
                  ? patient.maskedMobile
                  : 'Central Lab Network'}
              </div>
            </div>
          </div>

          <div className="dropdown-divider" />

          {/* Action Items */}
          <div className="dropdown-items-list">
            {/* Profile Action */}
            <button
              type="button"
              className="dropdown-item"
              onClick={() => {
                setOpen(false);
                setActiveModal('profile');
              }}
            >
              <span className="item-icon">📋</span>
              <div className="item-text">
                <span className="item-title">Profile & Medical ID</span>
                <span className="item-hint">View identity & NABL records</span>
              </div>
            </button>

            {/* Support Action */}
            <button
              type="button"
              className="dropdown-item"
              onClick={() => {
                setOpen(false);
                setActiveModal('support');
              }}
            >
              <span className="item-icon">📞</span>
              <div className="item-text">
                <span className="item-title">24x7 Clinical Support</span>
                <span className="item-hint">Emergency desk & WhatsApp care</span>
              </div>
            </button>

            {/* Help & Guide */}
            <button
              type="button"
              className="dropdown-item"
              onClick={() => {
                setOpen(false);
                setActiveModal('help');
              }}
            >
              <span className="item-icon">💡</span>
              <div className="item-text">
                <span className="item-title">Help & Lab FAQs</span>
                <span className="item-hint">Understanding your test reports</span>
              </div>
            </button>

            {/* Dark / Light Mode Toggle */}
            <button
              type="button"
              className="dropdown-item theme-item"
              onClick={() => {
                toggleTheme();
              }}
            >
              <span className="item-icon">{theme === 'dark' ? '☀️' : '🌙'}</span>
              <div className="item-text">
                <span className="item-title">
                  {theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                </span>
                <span className="item-hint">Current: {theme === 'dark' ? 'Dark' : 'Light'}</span>
              </div>
            </button>
          </div>

          <div className="dropdown-divider" />

          {/* Bottom Actions: Log In or Log Out */}
          <div className="dropdown-footer">
            {isDoctor || isPatient ? (
              <button
                type="button"
                className="dropdown-logout-btn"
                onClick={handleLogout}
              >
                <span>🚪</span> Sign Out ({isDoctor ? 'Doctor' : 'Patient'})
              </button>
            ) : (
              <div className="dropdown-login-options">
                <button
                  type="button"
                  className="quick-login-link"
                  onClick={() => {
                    setOpen(false);
                    navigate('/login');
                  }}
                >
                  Patient Login
                </button>
                <button
                  type="button"
                  className="quick-login-link doctor-link"
                  onClick={() => {
                    setOpen(false);
                    navigate('/doctor/login');
                  }}
                >
                  Doctor Login 🩺
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

