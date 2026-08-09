import Image from 'next/image'

const BLOCKS = [
  {
    n: '01',
    title: 'Close to the celebration.',
    copy: "We are not building an abstract marketplace. Our team sits with photographers in Masaki, walks venues in Arusha and answers couples on WhatsApp at 9pm. The product is shaped by the season, not by a roadmap written in a vacuum.",
    image: '/assets/images/couples_together.jpg',
    alt: 'A couple celebrating together',
  },
  {
    n: '02',
    title: 'Ambitious about the craft.',
    copy: 'Digital cards, guest lists, seating, payments, vendor storefronts. Each surface has to feel considered enough that a couple trusts it with the biggest day of their life. That bar is why the work here is genuinely hard.',
    image: '/assets/images/bridering.jpg',
    alt: 'Wedding rings',
  },
  {
    n: '03',
    title: 'Powered by a small team.',
    copy: 'Engineering, design, studio, operations and finance sit in one room. Decisions take hours, not quarters, and the person who spots the problem is usually the person who gets to fix it.',
    image: '/assets/images/mauzo_crew.jpg',
    alt: 'The OpusFesta team',
  },
]

export default function CareersStory() {
  return (
    <section
      id="life-here"
      className="mx-auto mt-12 max-w-[1200px] scroll-mt-24 border-t border-black/10 px-6 py-24 text-center"
    >
      <div className="mb-24 md:mb-32">
        <span className="mb-8 inline-block rounded-full border border-black/20 px-3 py-1 text-xs font-semibold uppercase tracking-widest">
          Life here
        </span>
        <h2 className="mb-6 text-4xl font-medium leading-tight tracking-tight md:text-[3.5rem]">
          Grounded work, ground breaking market.
        </h2>
        <p className="mx-auto max-w-2xl text-xl text-gray-700">
          We are early enough that your work is visible on day one, and far enough
          along that thousands of people already depend on it.
        </p>
      </div>

      {BLOCKS.map((block, i) => {
        const last = i === BLOCKS.length - 1
        const flip = i === 1
        return (
          <div
            key={block.n}
            className={`grid items-center gap-12 text-left md:grid-cols-2 md:gap-24 ${
              last ? '' : 'mb-28 md:mb-40'
            }`}
          >
            <div className={flip ? 'order-1 md:order-2' : ''}>
              <div className="mb-8 flex h-10 w-10 items-center justify-center rounded-full border border-black/20 text-sm font-medium">
                {block.n}
              </div>
              <h3 className="mb-6 text-4xl font-medium tracking-tight md:text-5xl">{block.title}</h3>
              <p className="max-w-md text-lg leading-relaxed text-gray-700">{block.copy}</p>
            </div>
            <div
              className={`relative h-[350px] w-full overflow-hidden rounded-[100px] md:h-[450px] ${
                flip ? 'order-2 md:order-1' : ''
              }`}
            >
              <Image
                src={block.image}
                alt={block.alt}
                fill
                sizes="(max-width: 768px) 100vw, 560px"
                className="object-cover"
              />
            </div>
          </div>
        )
      })}
    </section>
  )
}
