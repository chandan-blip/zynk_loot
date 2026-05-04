import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  FaTelegram, FaInstagram, FaFacebook, FaWhatsapp, FaYoutube,
  FaTwitter, FaDiscord, FaTiktok, FaLinkedin, FaGlobe, FaEnvelope, FaGithub,
} from 'react-icons/fa';
import { getSocialLinks } from '../services/api';

export const ICON_OPTIONS = [
  { value: 'telegram',  label: 'Telegram',  Icon: FaTelegram,  color: '#229ED9' },
  { value: 'instagram', label: 'Instagram', Icon: FaInstagram, color: '#E1306C' },
  { value: 'facebook',  label: 'Facebook',  Icon: FaFacebook,  color: '#1877F2' },
  { value: 'whatsapp',  label: 'WhatsApp',  Icon: FaWhatsapp,  color: '#25D366' },
  { value: 'youtube',   label: 'YouTube',   Icon: FaYoutube,   color: '#FF0000' },
  { value: 'twitter',   label: 'Twitter/X', Icon: FaTwitter,   color: '#1DA1F2' },
  { value: 'discord',   label: 'Discord',   Icon: FaDiscord,   color: '#5865F2' },
  { value: 'tiktok',    label: 'TikTok',    Icon: FaTiktok,    color: '#000000' },
  { value: 'linkedin',  label: 'LinkedIn',  Icon: FaLinkedin,  color: '#0A66C2' },
  { value: 'github',    label: 'GitHub',    Icon: FaGithub,    color: '#181717' },
  { value: 'email',     label: 'Email',     Icon: FaEnvelope,  color: '#EA4335' },
  { value: 'website',   label: 'Website',   Icon: FaGlobe,     color: '#6B7280' },
];

const ICON_MAP = ICON_OPTIONS.reduce((acc, o) => { acc[o.value] = o; return acc; }, {});

const STORAGE_KEY = 'floating_social_pos_v1';

export default function FloatingSocialIcons() {
  const [links, setLinks] = useState([]);
  const [position, setPosition] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') return saved;
    } catch {}
    return { x: 0, y: 0 };
  });
  const constraintsRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    getSocialLinks()
      .then(res => { if (!cancelled) setLinks(res.data?.data || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!links.length) return null;

  return (
    <div
      ref={constraintsRef}
      className="fixed top-16 bottom-24 lg:bottom-4 left-0 right-0 max-w-[1400px] mx-auto pointer-events-none z-40"
    >
      <motion.div
        drag
        dragConstraints={constraintsRef}
        dragMomentum={false}
        dragElastic={0.1}
        initial={false}
        animate={{ x: position.x, y: position.y }}
        onDragEnd={(_, info) => {
          const next = { x: position.x + info.offset.x, y: position.y + info.offset.y };
          setPosition(next);
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
        }}
        whileDrag={{ scale: 1.05 }}
        className="absolute bottom-2 right-4 flex flex-col gap-2 cursor-grab active:cursor-grabbing touch-none pointer-events-auto"
      >
        {links.map((link) => {
          const meta = ICON_MAP[link.icon] || ICON_MAP.website;
          const Icon = meta.Icon;
          const bg = link.color || meta.color;
          return (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                // Prevent click after drag
                if (Math.abs(position.x) > 5 || Math.abs(position.y) > 5) {
                  // still allow click — drag persisted, but if it was dragged just now framer-motion handles it
                }
                e.stopPropagation();
              }}
              draggable={false}
              title={link.name}
              className="w-12 h-12 rounded-full shadow-lg flex items-center justify-center text-white hover:scale-110 active:scale-95 transition-transform border border-white/10 backdrop-blur-sm"
              style={{ backgroundColor: bg }}
            >
              <Icon className="w-5 h-5 pointer-events-none" />
            </a>
          );
        })}
      </motion.div>
    </div>
  );
}
