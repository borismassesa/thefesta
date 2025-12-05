import Image from 'next/image';
import { MARQUEE_CATEGORIES } from '../../app/home-data';

const VendorMarquee = () => {
  const items = [...MARQUEE_CATEGORIES, ...MARQUEE_CATEGORIES];

  return (
    <section className="relative mx-auto mt-10 w-full max-w-[1400px] overflow-hidden px-4 sm:px-6 lg:px-8">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Browse vendors by category</h2>
      </div>
      <div className="relative">
        <div className="marquee-track flex gap-6">
          {items.map((item, idx) => (
            <div
              key={`${item.title}-${idx}`}
              className="group relative h-full min-w-[260px] max-w-[320px] flex-shrink-0 overflow-hidden rounded-[18px] bg-white shadow-sm ring-1 ring-gray-100 transition-transform duration-300 hover:-translate-y-1 hover:shadow-lg dark:bg-slate-900/60 dark:ring-slate-800"
            >
              <div className="relative aspect-[4/3]">
                <Image
                  src={item.image}
                  alt={item.title || 'Wedding vendor category'}
                  fill
                  sizes="(min-width: 1024px) 20vw, 60vw"
                  className="object-cover"
                  priority={false}
                />
                <div className="absolute inset-0 rounded-[18px] border border-white/40 shadow-[0_8px_24px_rgba(0,0,0,0.06)]" />
              </div>
              <div className="px-4 py-3">
                <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{item.title}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default VendorMarquee;
