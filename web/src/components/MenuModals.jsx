import { useSession } from '../lib/SessionContext';

export function MenuModals() {
  const { activeModal, setActiveModal, doctor, patient } = useSession();

  if (!activeModal) return null;

  return (
    <div className="modal-backdrop" onClick={() => setActiveModal(null)}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="modal-close-btn"
          onClick={() => setActiveModal(null)}
          aria-label="Close modal"
        >
          ✕
        </button>

        {/* 1. Profile Modal */}
        {activeModal === 'profile' && (
          <div className="modal-content">
            <div className="modal-header">
              <div className="modal-avatar-big">
                {doctor ? '🩺' : patient ? '👤' : '⚕'}
              </div>
              <div>
                <h3 className="modal-title">
                  {doctor
                    ? (doctor.name || 'Dr. Rajesh Sharma, MD')
                    : patient
                    ? 'Patient Account'
                    : 'Company A Healthcare Portal'}
                </h3>
                <div className="modal-subtitle">
                  {doctor
                    ? 'Certified Consultant Pathologist · Lab Director'
                    : patient
                    ? `Verified Patient Record (${patient.maskedMobile})`
                    : 'Accredited Diagnostic Network'}
                </div>
              </div>
            </div>

            <div className="profile-details-grid">
              <div className="detail-field">
                <span className="field-label">Account Type</span>
                <strong className="field-val">
                  {doctor ? 'Clinical Doctor (NABL Staff)' : patient ? 'Patient Portal User' : 'Guest'}
                </strong>
              </div>

              <div className="detail-field">
                <span className="field-label">{doctor ? 'Username' : 'Registered Mobile'}</span>
                <strong className="field-val">
                  {doctor ? doctor.username : patient ? patient.maskedMobile : 'Not signed in'}
                </strong>
              </div>

              <div className="detail-field">
                <span className="field-label">Assigned Central Lab</span>
                <strong className="field-val">Company A Diagnostics (Central Hub)</strong>
              </div>

              <div className="detail-field">
                <span className="field-label">Data Protection & Privacy</span>
                <strong className="field-val">✓ DPDP Act 2023 Compliant</strong>
              </div>
            </div>

            <div className="modal-info-box">
              <span className="info-badge">🔒 End-to-End Security</span>
              <p>
                All laboratory reports are protected with single-use 256-bit expiring tokens (72-hour TTL).
                Reports cannot be forwarded to unauthorised third parties without phone-level OTP verification.
              </p>
            </div>
          </div>
        )}

        {/* 2. 24x7 Clinical Support Modal */}
        {activeModal === 'support' && (
          <div className="modal-content">
            <div className="modal-header">
              <div className="modal-avatar-big support-avatar">📞</div>
              <div>
                <h3 className="modal-title">24x7 Clinical Support Desk</h3>
                <div className="modal-subtitle">Always here to assist patients, physicians, and collection centres</div>
              </div>
            </div>

            <div className="support-cards-list">
              <div className="support-card-item highlight-card">
                <div className="support-card-icon">🚨</div>
                <div>
                  <strong>Emergency Panic Value Hotline</strong>
                  <div className="support-val">1800-419-LABS (Toll Free, 24x7)</div>
                  <div className="support-desc">Immediate physician contact for critical lab alerts</div>
                </div>
              </div>

              <div className="support-card-item">
                <div className="support-card-icon">💬</div>
                <div>
                  <strong>WhatsApp Patient Care</strong>
                  <div className="support-val">+91 90000 12345</div>
                  <div className="support-desc">Instant link recovery, report assistance, and regional languages</div>
                </div>
              </div>

              <div className="support-card-item">
                <div className="support-card-icon">🏠</div>
                <div>
                  <strong>Home Phlebotomy & Sample Collection</strong>
                  <div className="support-val">homecollection@companya-diagnostics.com</div>
                  <div className="support-desc">Certified technician dispatch within 60 minutes</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 3. Help & FAQs Modal */}
        {activeModal === 'help' && (
          <div className="modal-content">
            <div className="modal-header">
              <div className="modal-avatar-big help-avatar">💡</div>
              <div>
                <h3 className="modal-title">Patient Guide & Lab FAQs</h3>
                <div className="modal-subtitle">Understanding your reports, test flags, and security</div>
              </div>
            </div>

            <div className="faq-list">
              <div className="faq-item">
                <strong>How do I understand out-of-range lab results?</strong>
                <p>
                  Parameters outside the standard reference range are highlighted with ▲ HIGH or ▼ LOW.
                  Our system provides certified plain-language explanations in English, Telugu, and Hindi.
                </p>
              </div>

              <div className="faq-item">
                <strong>Why did my report arrive with an expiring 72-hour link?</strong>
                <p>
                  To comply with healthcare data privacy laws, report links automatically expire after 72 hours.
                  You can always log in with your phone number and OTP at any time to reopen your reports.
                </p>
              </div>

              <div className="faq-item">
                <strong>Can multiple family members share one phone number?</strong>
                <p>
                  Yes! In many families, parents and children use a shared phone number.
                  Our system safely groups all family members under that mobile number while maintaining individual test records.
                </p>
              </div>

              <div className="faq-item">
                <strong>How do I download the official signed PDF?</strong>
                <p>
                  Once you open your report, click the "Download PDF" button to download the laboratory-accredited digital PDF.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="modal-footer">
          <button
            type="button"
            className="btn small"
            onClick={() => setActiveModal(null)}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

