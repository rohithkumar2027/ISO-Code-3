import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useSession } from '../lib/SessionContext';
import { LeafMark } from '../components/Mark';
import './home.css';

export default function Home() {
  const { patient } = useSession();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('all');

  const packages = [
    {
      id: 'cbc',
      name: 'Complete Hemogram (CBC + ESR)',
      badge: 'Most Popular',
      category: 'routine',
      price: '₹350',
      tat: '2 Hours TAT',
      parameters: '24 Parameters including Haemoglobin, TLC, DLC, Platelet Count, RBC Indices, PCV, MCV',
      desc: 'Essential baseline screening for infection, anaemia, clotting ability, and general immune response.',
    },
    {
      id: 'diabetes',
      name: 'Comprehensive Diabetic Health Panel',
      badge: 'Essential',
      category: 'specialty',
      price: '₹599',
      tat: '3 Hours TAT',
      parameters: 'HbA1c (Glycated Haemoglobin), Estimated Average Glucose (eAG), Fasting Plasma Glucose',
      desc: 'Gold-standard monitoring of 3-month glycaemic control, diabetes progression, and cardiovascular risk.',
    },
    {
      id: 'lipid',
      name: 'Advanced Cardiac Lipid Profile',
      badge: 'Preventative',
      category: 'routine',
      price: '₹799',
      tat: '4 Hours TAT',
      parameters: 'Total Cholesterol, HDL (Good), LDL (Bad), VLDL, Triglycerides, Non-HDL Cholesterol, Risk Ratio',
      desc: 'Comprehensive cardiovascular assessment for arterial health, metabolic syndrome, and lipid abnormalities.',
    },
    {
      id: 'thyroid',
      name: 'Total Thyroid Function Panel (TFT)',
      badge: 'Hormonal',
      category: 'specialty',
      price: '₹499',
      tat: '3 Hours TAT',
      parameters: 'TSH (Ultrasensitive), Total Triiodothyronine (T3), Total Thyroxine (T4)',
      desc: 'Sensitive detection of hypothyroidism, hyperthyroidism, metabolic rate shifts, and endocrine health.',
    },
    {
      id: 'renal',
      name: 'Kidney Function & Electrolytes (KFT)',
      badge: 'Clinical',
      category: 'specialty',
      price: '₹850',
      tat: '3 Hours TAT',
      parameters: 'Serum Creatinine, Blood Urea Nitrogen, Uric Acid, Serum Sodium, Potassium, Chloride',
      desc: 'Critical renal filtration evaluation and biological electrolyte balance monitoring.',
    },
    {
      id: 'master',
      name: 'Executive Whole Body Health Package',
      badge: 'Comprehensive',
      category: 'full',
      price: '₹1,999',
      tat: '6 Hours TAT',
      parameters: '68 Parameters covering CBC, Liver Function, Kidney Function, Lipid Profile, Thyroid, Glucose, Urine Routine',
      desc: 'Annual master screening covering all vital organ systems, metabolic markers, and preventative wellness.',
    },
  ];

  const filteredPackages = packages.filter((p) => {
    if (activeTab === 'routine') return p.category === 'routine';
    if (activeTab === 'specialty') return p.category === 'specialty';
    if (activeTab === 'full') return p.category === 'full';
    return true;
  });

  return (
    <div className="home-business-wrapper">
      {/* Top Notification Announcement */}
      <div className="top-announcement">
        <div className="container announcement-inner">
          <span className="announcement-badge">Live System</span>
          <span>
            NABL Accredited & ISO 15189:2022 Certified Pathology · WhatsApp Patient Digital Delivery Active
          </span>
          <Link to="/doctor" className="announcement-link">
            Open Doctor Workstation →
          </Link>
        </div>
      </div>

      {/* Hero Section */}
      <section className="hero-section">
        <div className="container hero-container">
          <div className="hero-content">
            <div className="hero-eyebrow">
              <span className="pulsing-radar" />
              <span>Next-Generation Diagnostic Pathology Network</span>
            </div>

            <h1 className="hero-title">
              Precision Diagnostics, <br />
              <span className="gradient-text">Delivered to Your Fingertips.</span>
            </h1>

            <p className="hero-lede">
              Company A Diagnostics delivers certified clinical reports within hours.
              Patients receive secure 256-bit expiring links on WhatsApp and SMS, unlocked with a one-time code,
              and explained in clear, plain-language Telugu, Hindi, or English.
            </p>

            {/* Main Action Buttons */}
            <div className="hero-actions">
              <Link to={patient ? '/reports' : '/login'} className="btn hero-btn-primary">
                {patient ? 'View Your Reports →' : 'See Your Reports (Patient Login) →'}
              </Link>
              <Link to="/doctor" className="btn hero-btn-secondary">
                🩺 Doctor & Lab Console
              </Link>
              <a href="/dev/outbox" target="_blank" rel="noreferrer" className="btn hero-btn-tertiary">
                Outbox Simulator ↗
              </a>
            </div>

            {/* Trust Badges */}
            <div className="trust-badges-row">
              <div className="trust-badge-item">
                <span className="trust-icon">✓</span>
                <span>NABL & ISO 15189 Certified</span>
              </div>
              <div className="trust-badge-item">
                <span className="trust-icon">✓</span>
                <span>256-Bit Cryptographic Expiring Links</span>
              </div>
              <div className="trust-badge-item">
                <span className="trust-icon">✓</span>
                <span>DPDP Act 2023 Compliant</span>
              </div>
              <div className="trust-badge-item">
                <span className="trust-icon">✓</span>
                <span>English, తెలుగు & हिन्दी Support</span>
              </div>
            </div>
          </div>

          {/* Hero Visual Card */}
          <div className="hero-card-preview">
            <div className="card floating-preview-card">
              <div className="preview-card-header">
                <div className="preview-brand">
                  <LeafMark className="preview-leaf" />
                  <div>
                    <strong>Company A Central Lab</strong>
                    <div className="preview-sub">Order #ORD-71204 · Dispatched</div>
                  </div>
                </div>
                <span className="pill ready">● WhatsApp Delivered</span>
              </div>

              <div className="preview-patient-info">
                <div className="patient-avatar">LP</div>
                <div>
                  <div className="patient-name-title">Lakshmi Prasanna K (54y, F)</div>
                  <div className="patient-meta-text">Ref: Dr. S. Ramanaiah · Sample: Fasting Blood</div>
                </div>
              </div>

              <div className="preview-finding-box">
                <div className="finding-preview-top">
                  <span className="finding-name">Serum Cholesterol</span>
                  <span className="finding-alert">▲ HIGH (245 mg/dL)</span>
                </div>
                <p className="finding-plain-text">
                  "Your total cholesterol is higher than the recommended level (125 - 200 mg/dL).
                  Eating less saturated fat and staying active can help bring it down. Please discuss these results with your doctor."
                </p>
                <div className="lang-preview-chips">
                  <span className="lang-chip-active">English</span>
                  <span className="lang-chip-inactive">తెలుగు</span>
                  <span className="lang-chip-inactive">हिन्दी</span>
                </div>
              </div>

              <div className="preview-card-footer">
                <div className="footer-token-info">🔒 72h Expiring Token · OTP Verified</div>
                <Link to="/login" className="btn small primary-btn">Test Live View</Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Demo Jump Section */}
      <section className="demo-launcher-section">
        <div className="container">
          <div className="demo-launcher-bar">
            <div className="demo-label">
              <span className="demo-indicator" />
              <strong>Quick Demo Workflows (Click to Explore):</strong>
            </div>

            <div className="demo-links-wrap">
              <button
                type="button"
                className="demo-pill-btn"
                onClick={() => navigate('/login')}
              >
                👤 Patient Login (`9000000001`)
              </button>
              <button
                type="button"
                className="demo-pill-btn critical-pill"
                onClick={() => navigate('/login')}
              >
                ⚠ Critical Value Demo (`9000000002`)
              </button>
              <Link to="/doctor" className="demo-pill-btn doctor-pill">
                🩺 Doctor Workstation (/doctor)
              </Link>
              <a href="/staff" target="_blank" rel="noreferrer" className="demo-pill-btn staff-pill">
                🏢 Front Desk Console (/staff)
              </a>
              <a href="/dev/outbox" target="_blank" rel="noreferrer" className="demo-pill-btn outbox-pill">
                📱 Message Outbox (/dev/outbox)
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Metrics Counter Section */}
      <section className="metrics-strip">
        <div className="container metrics-grid">
          <div className="metric-box">
            <div className="metric-number">5.2M+</div>
            <div className="metric-label">Reports Delivered</div>
            <div className="metric-desc">Across 240+ collection centres</div>
          </div>
          <div className="metric-box">
            <div className="metric-number">&lt; 2 Hrs</div>
            <div className="metric-label">Routine TAT</div>
            <div className="metric-desc">From barcode scan to doctor sign-off</div>
          </div>
          <div className="metric-box">
            <div className="metric-number">99.4%</div>
            <div className="metric-label">WhatsApp Delivery</div>
            <div className="metric-desc">With automated instant SMS failover</div>
          </div>
          <div className="metric-box">
            <div className="metric-number">100%</div>
            <div className="metric-label">Quality Assured</div>
            <div className="metric-desc">NABL & ISO 15189 international standard</div>
          </div>
        </div>
      </section>

      {/* How it Works Section */}
      <section className="workflow-section">
        <div className="container">
          <div className="section-head text-center">
            <span className="eyebrow">SEAMLESS LAB TO PATIENT JOURNEY</span>
            <h2 className="display-lg">How Our Digital Diagnostic System Works</h2>
            <p className="lede center-lede">
              A fully automated pipeline connecting laboratory instruments, clinical pathologists, and patients without paper bottlenecks.
            </p>
          </div>

          <div className="steps-grid">
            <div className="step-card">
              <div className="step-badge">Step 1</div>
              <div className="step-icon">🧪</div>
              <h3>Automated LIS Ingestion</h3>
              <p>
                Sample is accessioned at the collection centre. Automated laboratory analyzers run test panels
                and export raw calibration telemetry into our watched secure directory.
              </p>
            </div>

            <div className="step-card">
              <div className="step-badge">Step 2</div>
              <div className="step-icon">🔬</div>
              <h3>Pathologist Sign-off</h3>
              <p>
                Our certified MD Pathologists review telemetry in the Lab Workstation.
                Normal vs abnormal values are flagged, plain-language summaries generated, and panic values immediately flagged for verbal callback.
              </p>
            </div>

            <div className="step-card">
              <div className="step-badge">Step 3</div>
              <div className="step-icon">📲</div>
              <h3>Encrypted WhatsApp Link</h3>
              <p>
                When signed, a 256-bit cryptographically random token (72-hour TTL) is generated.
                The patient receives an instant WhatsApp notification with an anti-forwarding security guarantee.
              </p>
            </div>

            <div className="step-card">
              <div className="step-badge">Step 4</div>
              <div className="step-icon">🌐</div>
              <h3>Plain-Language Clarity</h3>
              <p>
                Patient unlocks with an instant OTP. Out-of-range biomarkers are explained in clean, understandable English, Telugu,
                or Hindi, empowering patients without medical jargon.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Diagnostic Packages Directory */}
      <section className="packages-section">
        <div className="container">
          <div className="section-head text-center">
            <span className="eyebrow">COMPREHENSIVE TEST DIRECTORY</span>
            <h2 className="display-lg">Popular Diagnostic & Wellness Packages</h2>
            <p className="lede center-lede">
              Certified clinical diagnostics with rapid turnaround times and complimentary digital summary interpretations.
            </p>
          </div>

          {/* Category Tabs */}
          <div className="package-tabs">
            <button
              type="button"
              className={`package-tab-btn ${activeTab === 'all' ? 'active' : ''}`}
              onClick={() => setActiveTab('all')}
            >
              All Packages
            </button>
            <button
              type="button"
              className={`package-tab-btn ${activeTab === 'routine' ? 'active' : ''}`}
              onClick={() => setActiveTab('routine')}
            >
              Routine Hematology & Lipids
            </button>
            <button
              type="button"
              className={`package-tab-btn ${activeTab === 'specialty' ? 'active' : ''}`}
              onClick={() => setActiveTab('specialty')}
            >
              Diabetic & Metabolic Specialty
            </button>
            <button
              type="button"
              className={`package-tab-btn ${activeTab === 'full' ? 'active' : ''}`}
              onClick={() => setActiveTab('full')}
            >
              Master Whole Body Screening
            </button>
          </div>

          {/* Package Cards Grid */}
          <div className="packages-grid">
            {filteredPackages.map((pkg) => (
              <div key={pkg.id} className="card package-card">
                <div className="pkg-header">
                  <span className="pkg-badge">{pkg.badge}</span>
                  <span className="pkg-tat">{pkg.tat}</span>
                </div>

                <h3 className="pkg-title">{pkg.name}</h3>
                <div className="pkg-price-row">
                  <span className="pkg-price">{pkg.price}</span>
                  <span className="pkg-tax">Inc. all taxes & digital report</span>
                </div>

                <p className="pkg-desc">{pkg.desc}</p>

                <div className="pkg-parameters-box">
                  <strong>Includes:</strong> {pkg.parameters}
                </div>

                <div className="pkg-card-actions">
                  <Link to="/doctor" className="btn small secondary">
                    View in Doctor Console
                  </Link>
                  <Link to="/login" className="btn small primary-btn">
                    Book / View Reports
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Enterprise & Clinical Advantages */}
      <section className="features-section">
        <div className="container">
          <div className="section-head text-center">
            <span className="eyebrow">ENGINEERED FOR PATIENTS & HOSPITALS</span>
            <h2 className="display-lg">Built with Clinical Rigour & Privacy by Design</h2>
          </div>

          <div className="features-grid">
            <div className="feature-item">
              <div className="feature-icon">🛡️</div>
              <h4>No App Download Required</h4>
              <p>
                Eliminates patient friction. Reports render instantly on any smartphone browser in lightweight,
                high-speed HTML with zero JavaScript weight and no bloated app installation.
              </p>
            </div>

            <div className="feature-item">
              <div className="feature-icon">👨‍👩‍👧‍👦</div>
              <h4>Family Shared Mobile Support</h4>
              <p>
                In Indian households, elderly parents and children frequently share a single mobile number.
                Our architecture partitions individual patient orders securely under one phone number.
              </p>
            </div>

            <div className="feature-item">
              <div className="feature-icon">🚨</div>
              <h4>Emergency Panic Protocol</h4>
              <p>
                When life-threatening values are detected (e.g. Potassium ≥ 6.5 mmol/L), AI wording is strictly suppressed,
                an emergency banner is rendered, and an urgent front-desk callback is queued.
              </p>
            </div>

            <div className="feature-item">
              <div className="feature-icon">🇮🇳</div>
              <h4>Accredited Local Languages</h4>
              <p>
                Empowers patients in their mother tongue with certified medical phrasing in English, Telugu (తెలుగు),
                and Hindi (हिन्दी) verified by regional clinical pathologists.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Corporate Call To Action */}
      <section className="cta-banner-section">
        <div className="container">
          <div className="cta-card">
            <div className="cta-text">
              <h2 className="cta-title">Ready to Experience Modern Diagnostic Care?</h2>
              <p className="cta-desc">
                Access your laboratory reports immediately or test our pathologist sign-off workflow in real-time.
              </p>
            </div>
            <div className="cta-buttons">
              <Link to="/login" className="btn cta-btn-white">
                Enter Patient Portal →
              </Link>
              <Link to="/doctor" className="btn cta-btn-transparent">
                Open Doctor Station 🩺
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Corporate Footer */}
      <footer className="business-footer">
        <div className="container footer-container">
          <div className="footer-col brand-col">
            <div className="footer-brand">
              <span className="footer-icon">⚕</span>
              <strong>Company A Diagnostics</strong>
            </div>
            <p className="footer-manifesto">
              Empowering healthcare providers and patients across India with secure, automated, and empathetic diagnostic report delivery.
            </p>
            <div className="footer-cert-tags">
              <span>NABL Certificate #MC-2941</span>
              <span>ISO 15189:2022</span>
              <span>DPDP 2023</span>
            </div>
          </div>

          <div className="footer-col">
            <h4>Quick Navigation</h4>
            <ul>
              <li><Link to="/login">Patient Report Portal</Link></li>
              <li><Link to="/doctor">Doctor & Pathologist Station</Link></li>
              <li><a href="/staff">Staff & Front Desk Console</a></li>
              <li><a href="/dev/outbox">Simulated Messaging Outbox</a></li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>Diagnostic Centres</h4>
            <ul>
              <li>Hyderabad Central (Banjara Hills)</li>
              <li>Bengaluru Hub (Indiranagar)</li>
              <li>Chennai Regional (Anna Nagar)</li>
              <li>Mumbai South (Fort & Bandra)</li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>Clinical Support</h4>
            <div className="support-phone">📞 1800-419-LABS (24x7)</div>
            <div className="support-email">✉ clinical.support@companya-diagnostics.com</div>
            <div className="support-hours">Emergency Panic Desk: 24 Hours / 365 Days</div>
          </div>
        </div>

        <div className="footer-bottom">
          <div className="container footer-bottom-inner">
            <p>© 2026 Company A Diagnostics Private Limited. All Rights Reserved. ISO 15189:2022 Accredited.</p>
            <div className="footer-links-row">
              <span>Privacy & DPDP Policy</span>
              <span>Clinical Disclaimer</span>
              <span>Terms of Laboratory Service</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
