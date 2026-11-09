import { motion } from 'framer-motion';
import './background.css';

/**
 * Modern floating background elements with subtle mesh gradients,
 * floating geometric medical nodes, and smooth parallax motion.
 * Respects prefers-reduced-motion and stays strictly behind content.
 */
export function BackgroundElements() {
  return (
    <div className="modern-bg-container" aria-hidden="true">
      {/* Ambient glowing gradient mesh orbs */}
      <motion.div
        className="glow-orb orb-emerald"
        animate={{
          x: [0, 45, -30, 0],
          y: [0, -60, 35, 0],
          scale: [1, 1.15, 0.9, 1],
        }}
        transition={{
          duration: 22,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
      <motion.div
        className="glow-orb orb-amber"
        animate={{
          x: [0, -50, 40, 0],
          y: [0, 40, -50, 0],
          scale: [1, 0.9, 1.18, 1],
        }}
        transition={{
          duration: 26,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 2,
        }}
      />
      <motion.div
        className="glow-orb orb-teal"
        animate={{
          x: [0, 35, -45, 0],
          y: [0, 50, -30, 0],
          scale: [0.95, 1.12, 1, 0.95],
        }}
        transition={{
          duration: 30,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 4,
        }}
      />
      <motion.div
        className="glow-orb orb-rose"
        animate={{
          x: [0, -30, 25, 0],
          y: [0, -35, 45, 0],
          scale: [1, 1.08, 0.92, 1],
        }}
        transition={{
          duration: 24,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 1,
        }}
      />

      {/* Floating subtle medical/tech geometric elements */}
      <div className="floating-symbols">
        {/* Floating cross 1 */}
        <motion.svg
          className="symbol cross-1"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          animate={{
            y: [-15, 15, -15],
            rotate: [0, 90, 180, 270, 360],
          }}
          transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
        >
          <path d="M12 5v14M5 12h14" />
        </motion.svg>

        {/* Floating cross 2 */}
        <motion.svg
          className="symbol cross-2"
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          animate={{
            y: [20, -20, 20],
            rotate: [360, 270, 180, 90, 0],
          }}
          transition={{ duration: 24, repeat: Infinity, ease: 'linear' }}
        >
          <path d="M12 4v16M4 12h16" />
        </motion.svg>

        {/* Floating Hexagon Molecule */}
        <motion.svg
          className="symbol hex-1"
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          animate={{
            y: [0, -25, 10, 0],
            x: [0, 15, -15, 0],
            rotate: [0, 60, 120, 180, 240, 300, 360],
          }}
          transition={{ duration: 32, repeat: Infinity, ease: 'linear' }}
        >
          <path d="M12 2l8.66 5v10L12 22l-8.66-5V7L12 2z" />
          <circle cx="12" cy="12" r="2" fill="currentColor" />
        </motion.svg>

        {/* Floating Pulse wave */}
        <motion.svg
          className="symbol pulse-1"
          width="64"
          height="32"
          viewBox="0 0 64 32"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          animate={{
            x: [-10, 20, -10],
            opacity: [0.35, 0.7, 0.35],
          }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
        >
          <path d="M2 16h16l4-10 6 20 5-14 3 4h26" />
        </motion.svg>

        {/* Floating DNA node dots */}
        <motion.div
          className="symbol dna-cluster"
          animate={{
            y: [10, -20, 10],
            opacity: [0.4, 0.8, 0.4],
          }}
          transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
        >
          <div className="dna-dot d1" />
          <div className="dna-connector" />
          <div className="dna-dot d2" />
        </motion.div>
      </div>

      {/* Subtle fine mesh background grid overlay */}
      <div className="mesh-grid-overlay" />
    </div>
  );
}

