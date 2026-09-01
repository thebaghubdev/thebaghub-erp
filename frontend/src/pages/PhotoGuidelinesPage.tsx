const GUIDES = [
  {
    src: "/photo-guide/guide-01.png",
    alt: "Photo guide: bags — angles and details to capture",
  },
  {
    src: "/photo-guide/guide-02.png",
    alt: "Photo guide: bags — close-ups and hardware",
  },
  {
    src: "/photo-guide/guide-03.png",
    alt: "Photo guide: shoes — angles to photograph",
  },
  {
    src: "/photo-guide/guide-04.png",
    alt: "Photo guide: shoes — details and condition",
  },
  {
    src: "/photo-guide/guide-05.png",
    alt: "Photo guide: accessories and jewelry",
  },
] as const;

export function PhotoGuidelinesPage() {
  return (
    <div className="min-h-svh bg-[#faf8f5] font-[Georgia,'Times_New_Roman',serif] leading-[1.45] text-[#5c4033]">
      <div className="mx-auto max-w-4xl px-4 py-6 pb-12">
        <header className="mb-7 flex flex-wrap justify-between gap-5 border-b border-[#d4c4b0] pb-5 text-[0.8125rem]">
          <div>
            <div className="mb-1.5 text-[1.375rem] font-semibold tracking-[0.06em]">
              THE BAG HUB
            </div>
            <div>
              The Grove Retail Row, 201 2nd Floor, E. Rodriguez Jr., Ave. Pasig
              City
            </div>
          </div>
          <div>
            <div>Tel: +63 917 838 6242</div>
            <div>
              <a href="mailto:thebaghubph@gmail.com" className="text-[#5c4033]">
                thebaghubph@gmail.com
              </a>
            </div>
          </div>
        </header>

        <h1 className="mb-7 text-center text-[clamp(0.95rem,2.8vw,1.2rem)] font-bold uppercase tracking-[0.1em]">
          Guide on taking photos of your items
        </h1>

        <div className="flex flex-col gap-8">
          {GUIDES.map((guide) => (
            <img
              key={guide.src}
              src={guide.src}
              alt={guide.alt}
              loading="lazy"
              decoding="async"
              className="block h-auto w-full rounded shadow-[0_4px_28px_rgba(0,0,0,0.09)]"
            />
          ))}
        </div>

        <footer className="mx-auto mt-9 max-w-xl border-t border-[#d4c4b0] pt-5 text-center text-[0.8125rem]">
          <p>
            Please state the flaws that cannot be captured in photos such as,
            but not limited to moldy smell and loose clasp.
          </p>
        </footer>
      </div>
    </div>
  );
}
