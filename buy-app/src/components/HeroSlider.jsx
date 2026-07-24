import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useData } from "../context/DataContext";
import { imageUrl } from "../utils/upload";

const AUTOPLAY_MS = 5500;

// Slides come from the admin app (Hero slides page) and can each be
// tagged "shop" or "food" so the right banner shows depending on which
// side of the app the customer is browsing. Falls back to a sensible
// default if the admin hasn't added any slides yet, so the homepage
// never looks broken out of the box.
const FALLBACK_SLIDE = {
  id: "fallback",
  eyebrow: "Welcome",
  title: "Every stall in the market,\nunder one roof.",
  subtitle: "Shop thousands of products from independent vendors across Liberia, with Mobile Money checkout.",
  emoji: "🛍️",
  buttonText: "Start shopping",
  buttonLink: "/category/cat-phones",
};

export default function HeroSlider({ mode = "shop" }) {
  const { heroSlides } = useData();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const slides = useMemo(() => {
    const active = heroSlides.filter((s) => s.active !== false);
    const matched = active.filter((s) => (s.theme || "shop") === mode);
    const pool = matched.length > 0 ? matched : active;
    return pool.length > 0 ? pool : [FALLBACK_SLIDE];
  }, [heroSlides, mode]);

  useEffect(() => {
    if (index >= slides.length) setIndex(0);
  }, [slides.length, index]);

  useEffect(() => {
    if (paused || slides.length <= 1) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % slides.length), AUTOPLAY_MS);
    return () => clearInterval(t);
  }, [paused, slides.length]);

  const eyebrowClass = mode === "food" ? "text-coral" : "text-mango";

  return (
    <section
      className="max-w-7xl mx-auto px-4 pt-4 md:pt-6"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="relative overflow-hidden rounded-2xl bg-grad-indigo text-white shadow-lift">
        <div
          className="flex transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {slides.map((slide) => (
            <div key={slide.id} className="w-full shrink-0 grid md:grid-cols-[1.2fr_1fr] gap-8 items-center px-6 sm:px-10 py-10 md:py-14">
              <div>
                {slide.eyebrow && (
                  <p className={`font-display italic text-lg sm:text-xl ${eyebrowClass} mb-2`}>
                    {slide.eyebrow}
                  </p>
                )}
                <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-semibold leading-[1.08] whitespace-pre-line">
                  {slide.title}
                </h1>
                {slide.subtitle && (
                  <p className="mt-4 text-white/70 max-w-md text-sm sm:text-base">{slide.subtitle}</p>
                )}
                <div className="mt-6 flex flex-wrap gap-3">
                  {slide.buttonText && slide.buttonLink && (
                    <Link
                      to={slide.buttonLink}
                      className="bg-mango hover:bg-mango-400 text-indigo-950 font-semibold px-5 py-3 rounded-md text-sm"
                    >
                      {slide.buttonText}
                    </Link>
                  )}
                  {slide.buttonText2 && slide.buttonLink2 && (
                    <Link
                      to={slide.buttonLink2}
                      className="border border-white/30 hover:bg-white/10 px-5 py-3 rounded-md text-sm font-medium"
                    >
                      {slide.buttonText2}
                    </Link>
                  )}
                </div>
              </div>
              <div className="hidden md:flex items-center justify-center">
                {slide.image ? (
                  <img
                    src={imageUrl(slide.image)}
                    alt=""
                    className="w-full max-h-72 object-cover rounded-xl"
                  />
                ) : (
                  <div className="w-full aspect-square max-w-xs rounded-full bg-white/10 flex items-center justify-center">
                    <span className="text-[6rem] leading-none">{slide.emoji || "🛍️"}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {slides.length > 1 && (
          <>
            <button
              aria-label="Previous slide"
              onClick={() => setIndex((i) => (i - 1 + slides.length) % slides.length)}
              className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 items-center justify-center rounded-full bg-white/15 hover:bg-white/25 text-white"
            >
              ‹
            </button>
            <button
              aria-label="Next slide"
              onClick={() => setIndex((i) => (i + 1) % slides.length)}
              className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 items-center justify-center rounded-full bg-white/15 hover:bg-white/25 text-white"
            >
              ›
            </button>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
              {slides.map((slide, i) => (
                <button
                  key={slide.id}
                  aria-label={`Go to slide ${i + 1}`}
                  onClick={() => setIndex(i)}
                  className={`h-1.5 rounded-full transition-all ${
                    i === index ? "w-6 bg-mango" : "w-2.5 bg-white/40 hover:bg-white/60"
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
