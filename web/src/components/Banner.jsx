import { motion } from 'framer-motion';

export function Banner({ kind = 'info', title, children }) {
  if (!children && !title) return null;
  return (
    <motion.div
      className={`banner ${kind}`}
      role={kind === 'bad' ? 'alert' : 'status'}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      {title && <h2>{title}</h2>}
      {children && <p>{children}</p>}
    </motion.div>
  );
}
