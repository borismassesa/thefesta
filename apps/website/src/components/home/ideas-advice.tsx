import Image from 'next/image';
import Link from 'next/link';
import { ArrowRightIcon } from '@heroicons/react/24/outline';

// Category configuration with images
const CATEGORY_CONFIG = [
  {
    name: 'Planning Basics',
    image: 'https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?auto=format&fit=crop&w=200&q=80',
  },
  {
    name: 'Wedding Ceremony',
    image: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=200&q=80',
  },
  {
    name: 'Wedding Reception',
    image: 'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=200&q=80',
  },
  {
    name: 'Wedding Services',
    image: 'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=200&q=80',
  },
  {
    name: 'Wedding Fashion',
    image: 'https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&w=200&q=80',
  },
  {
    name: 'Health and Beauty',
    image: 'https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?auto=format&fit=crop&w=200&q=80',
  },
];

// Sample articles data (will be passed as props from page.tsx)
const DEFAULT_ARTICLES = [
  {
    title: 'Wedding Registry 101',
    category: 'Wedding Registry',
    image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1200&q=80',
    readTime: '8 min read',
  },
  {
    title: 'The Ultimate Wedding Registry Checklist',
    category: 'Wedding Registry',
    image: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=1200&q=80',
    readTime: '10 min read',
  },
  {
    title: '25 Awesome Spring Wedding Ideas',
    category: 'Trends & Tips',
    image: 'https://images.unsplash.com/photo-1499955085172-a104c9463ece?auto=format&fit=crop&w=1200&q=80',
    readTime: '6 min read',
  },
  {
    title: '50 Things Wedding Guests Should NEVER Do',
    category: 'Etiquette',
    image: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80',
    readTime: '12 min read',
  },
];

interface IdeasAdviceProps {
  articles?: typeof DEFAULT_ARTICLES;
  categories?: typeof CATEGORY_CONFIG;
}

const IdeasAdvice = ({ articles = DEFAULT_ARTICLES, categories = CATEGORY_CONFIG }: IdeasAdviceProps) => {
  return (
    <section className="py-16 px-6 bg-festa-base">
      <div className="max-w-7xl mx-auto">
        {/* Header Section */}
        <div className="mb-12">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-slate-900 dark:text-white mb-4">
            Ideas and tips
          </h2>
          <p className="text-base text-slate-600 dark:text-slate-400 max-w-2xl">
            Get inspired with the latest trends and advice from our wedding experts
          </p>
        </div>

        {/* Category Circles */}
        <div className="grid grid-cols-3 sm:flex sm:items-center sm:justify-between gap-6 sm:gap-4 mb-16">
          {categories.map((category) => {
            return (
              <Link
                key={category.name}
                href={`/ideas?category=${encodeURIComponent(category.name)}` as any}
                className="flex flex-col items-center gap-2 sm:gap-3 group cursor-pointer"
              >
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all duration-200 group-hover:scale-105 relative">
                  <Image
                    src={category.image}
                    alt={category.name}
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                </div>
                <span className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 text-center max-w-[90px] leading-tight">
                  {category.name}
                </span>
              </Link>
            );
          })}
        </div>

        {/* Article Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {articles.map((article, index) => (
            <Link
              key={index}
              href={`/ideas/${article.title.toLowerCase().replace(/\s+/g, '-')}` as any}
              className="group cursor-pointer"
            >
              <article>
                {/* Image */}
                <div className="relative aspect-[4/3] rounded-xl overflow-hidden mb-4 bg-slate-100 dark:bg-slate-800">
                  <Image
                    src={article.image}
                    alt={article.title}
                    fill
                    sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </div>

                {/* Content */}
                <div className="px-1">
                  {/* Category Tag */}
                  <span className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {article.category}
                  </span>

                  {/* Title */}
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mt-2 leading-tight group-hover:text-dribbble-pink transition-colors line-clamp-2">
                    {article.title}
                  </h3>

                  {/* Read Time */}
                  {article.readTime && (
                    <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 block">
                      {article.readTime}
                    </span>
                  )}
                </div>
              </article>
            </Link>
          ))}
        </div>

        {/* Browse All Button */}
        <div className="flex justify-center">
          <Link
            href={"/ideas" as any}
            className="inline-flex items-center gap-2 px-8 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-sm font-medium text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm hover:shadow-md"
          >
            Browse all articles
            <ArrowRightIcon className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
};

export default IdeasAdvice;
