import { ShieldCheck, Calendar, Users } from 'lucide-react'
import Reveal from '@/components/ui/Reveal'

export default function StressFree() {
  return (
    <section className="py-14 sm:py-20 md:py-24 px-4 sm:px-6 max-w-6xl mx-auto">

      {/* Top: text + image */}
      <div className="flex flex-col md:flex-row items-center gap-10 sm:gap-12 md:gap-16 mb-12 sm:mb-16 md:mb-20">

        <Reveal direction="left" className="flex-1 w-full text-center md:text-left">
          <span className="text-[var(--accent)] text-xs font-bold uppercase tracking-widest">
            Planning made simple
          </span>
          <h2 className="text-[2.4rem] sm:text-5xl md:text-6xl lg:text-[72px] font-black tracking-tighter uppercase leading-[0.9] mt-3 sm:mt-4 mb-4 sm:mb-6 text-[#1A1A1A]">
            Stress-free<br />planning.
          </h2>
          <p className="text-base sm:text-lg text-gray-600 mb-6 sm:mb-8 max-w-sm sm:max-w-md mx-auto md:mx-0 font-medium leading-relaxed">
            Plan your wedding without the chaos. We handle the details so you can enjoy the moment.
          </p>
          <div className="flex flex-wrap justify-center md:justify-start gap-2 sm:gap-3">
            {['Smart checklists', 'Vendor management', 'Guest tracking', 'Budget planning'].map((tag) => (
              <span key={tag} className="bg-gray-100 text-gray-600 text-xs font-bold px-3 py-1.5 rounded-full">
                {tag}
              </span>
            ))}
          </div>
        </Reveal>

        <Reveal direction="right" delay={0.1} className="flex-1 flex justify-center w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/images/authentic_couple.jpg"
            alt="Authentic couple"
            className="w-[280px] sm:w-full sm:max-w-sm md:max-w-md rounded-3xl object-cover aspect-square shadow-2xl"
            style={{ clipPath: 'polygon(20% 0%, 80% 0%, 100% 20%, 100% 80%, 80% 100%, 20% 100%, 0% 80%, 0% 20%)' }}
          />
        </Reveal>

      </div>

      {/* Bottom: feature items */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-10 md:gap-12 border-t border-gray-200 pt-10 sm:pt-14 md:pt-16">
        {[
          {
            Icon: ShieldCheck,
            title: 'Dedicated support',
            body: 'Our support team works to keep your planning smooth every step of the way',
          },
          {
            Icon: Calendar,
            title: 'Smart checklists',
            body: 'We use smart checklists to ensure you never miss a deadline or important detail',
          },
          {
            Icon: Users,
            title: 'Guest sync',
            body: 'Keep your guest data and RSVPs perfectly synced and secure in one place',
          },
        ].map(({ Icon, title, body }) => (
          <div key={title} className="flex gap-4 sm:flex-col sm:gap-0">
            <div className="w-11 h-11 sm:w-12 sm:h-12 shrink-0 rounded-full border border-gray-200 flex items-center justify-center sm:mb-6">
              <Icon className="text-[#1A1A1A]" size={18} />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg mb-1.5 sm:mb-3 text-[#1A1A1A]">{title}</h3>
              <p className="text-gray-600 text-sm sm:text-[15px] font-medium leading-relaxed">{body}</p>
            </div>
          </div>
        ))}
      </div>

      {/* CTA — after reading content + proof */}
      <div className="flex justify-center sm:justify-start mt-10 sm:mt-12">
        <button data-opus-button="primary" data-opus-button-size="large" className="w-full sm:w-auto bg-[#1A1A1A] hover:bg-[#333333] text-white px-8 py-3.5 sm:py-4 rounded-full font-bold transition-colors text-sm sm:text-base">
          Start planning today
        </button>
      </div>

    </section>
  )
}
