import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Home, Sparkles, History } from "lucide-react";

type NavOverlayProps = {
  isOpen: boolean;
  onClose: () => void;
};

const links = [
  { to: "/", label: "Home", Icon: Home },
  { to: "/generate", label: "Enter studio", Icon: Sparkles },
  { label: "History", Icon: History, onClick: true },
];

export default function NavOverlay({ isOpen, onClose }: NavOverlayProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="nav-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <motion.nav
            className="nav-overlay-inner"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            {links.map((item, i) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 * i, duration: 0.3 }}
              >
                {item.to ? (
                  <Link
                    to={item.to}
                    className="nav-overlay-link"
                    onClick={onClose}
                  >
                    <item.Icon size={20} />
                    <span>{item.label}</span>
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="nav-overlay-link"
                    onClick={() => {
                      onClose();
                      if (item.onClick) {
                        window.dispatchEvent(new CustomEvent("open-history"));
                      }
                    }}
                  >
                    <item.Icon size={20} />
                    <span>{item.label}</span>
                  </button>
                )}
              </motion.div>
            ))}
          </motion.nav>
          <button
            type="button"
            className="nav-overlay-backdrop"
            onClick={onClose}
            aria-label="Close menu"
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
