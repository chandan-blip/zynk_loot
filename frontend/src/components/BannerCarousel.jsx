import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import { getBanners } from '../services/api';

const AUTO_INTERVAL = 5000;
const SWIPE_THRESHOLD = 50;

function BannerSlide({ banner, priority = false }) {
  const inner = (
    <div className="relative w-full aspect-[16/7] sm:aspect-[16/6] overflow-hidden rounded-xl bg-dark-700 select-none">
      <img
        src={banner.image_url}
        alt={banner.title || 'banner'}
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        draggable={false}
        // The first banner is above-the-fold — load eagerly with high
        // priority so the browser doesn't put it behind other resources.
        // Subsequent banners are pre-warmed via new Image() in the
        // parent, so by the time they swap in the browser already has
        // them cached.
        loading={priority ? 'eager' : 'eager'}
        fetchpriority={priority ? 'high' : 'auto'}
        decoding="async"
      />
      {banner.title && (
        <div className="absolute inset-x-0 bottom-0 p-3 sm:p-5 bg-gradient-to-t from-black/70 via-black/30 to-transparent">
          <p className="text-white font-bold text-sm sm:text-lg drop-shadow">{banner.title}</p>
        </div>
      )}
    </div>
  );

  if (!banner.link_url) return inner;

  const isExternal = /^https?:\/\//i.test(banner.link_url);
  if (isExternal) {
    return (
      <a href={banner.link_url} target="_blank" rel="noopener noreferrer" className="block">
        {inner}
      </a>
    );
  }
  return <Link to={banner.link_url} className="block">{inner}</Link>;
}

export default function BannerCarousel() {
  const [banners, setBanners] = useState([]);
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef(null);
  const touchDeltaX = useRef(0);

  useEffect(() => {
    getBanners()
      .then((res) => {
        const list = res.data?.data || [];
        setBanners(list);
        // Pre-warm every banner image into the browser cache so swapping
        // slides is instant. Without this, only the visible slide is in
        // the DOM (AnimatePresence mounts/unmounts), so each transition
        // starts a brand-new network fetch.
        list.forEach((b) => {
          if (!b?.image_url) return;
          const img = new Image();
          img.decoding = 'async';
          img.src = b.image_url;
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (paused || banners.length <= 1) return;
    const id = setInterval(() => {
      setDirection(1);
      setIndex((i) => (i + 1) % banners.length);
    }, AUTO_INTERVAL);
    return () => clearInterval(id);
  }, [paused, banners.length]);

  if (banners.length === 0) return null;

  const goTo = (next) => {
    if (banners.length === 0) return;
    const wrapped = (next + banners.length) % banners.length;
    setDirection(wrapped > index || (index === banners.length - 1 && wrapped === 0) ? 1 : -1);
    setIndex(wrapped);
  };

  const next = () => goTo(index + 1);
  const prev = () => goTo(index - 1);

  const onTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchDeltaX.current = 0;
    setPaused(true);
  };
  const onTouchMove = (e) => {
    if (touchStartX.current == null) return;
    touchDeltaX.current = e.touches[0].clientX - touchStartX.current;
  };
  const onTouchEnd = () => {
    const delta = touchDeltaX.current;
    touchStartX.current = null;
    touchDeltaX.current = 0;
    setPaused(false);
    if (Math.abs(delta) < SWIPE_THRESHOLD) return;
    if (delta < 0) next(); else prev();
  };

  const onDragEnd = (_, info) => {
    setPaused(false);
    if (Math.abs(info.offset.x) < SWIPE_THRESHOLD) return;
    if (info.offset.x < 0) next(); else prev();
  };

  const slideVariants = {
    enter: (dir) => ({ x: dir > 0 ? '100%' : '-100%', opacity: 0.6 }),
    center: { x: 0, opacity: 1 },
    exit: (dir) => ({ x: dir > 0 ? '-100%' : '100%', opacity: 0.6 }),
  };

  const banner = banners[index];

  return (
    <div
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div className="relative overflow-hidden rounded-xl">
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.div
            key={banner.id}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ x: { type: 'spring', stiffness: 280, damping: 30 }, opacity: { duration: 0.2 } }}
            drag={banners.length > 1 ? 'x' : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragStart={() => setPaused(true)}
            onDragEnd={onDragEnd}
            className="cursor-grab active:cursor-grabbing"
          >
            <BannerSlide banner={banner} priority={index === 0} />
          </motion.div>
        </AnimatePresence>
      </div>

      {banners.length > 1 && (
        <>
          <button
            onClick={prev}
            aria-label="Previous banner"
            className="hidden sm:flex items-center justify-center absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur-sm border border-white/10"
          >
            <FiChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={next}
            aria-label="Next banner"
            className="hidden sm:flex items-center justify-center absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur-sm border border-white/10"
          >
            <FiChevronRight className="w-5 h-5" />
          </button>

          <div className="absolute bottom-2 left-0 right-0 flex items-center justify-center gap-1.5 pointer-events-none">
            {banners.map((b, i) => (
              <button
                key={b.id}
                onClick={() => goTo(i)}
                aria-label={`Go to banner ${i + 1}`}
                className={`pointer-events-auto h-1.5 rounded-full transition-all ${
                  i === index ? 'bg-white w-5' : 'bg-white/40 w-1.5 hover:bg-white/60'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
