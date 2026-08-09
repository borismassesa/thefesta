import Link from 'next/link'
import Reveal from '@/components/ui/Reveal'
import type { FooterStrings } from '@/lib/cms/ui-strings-fallback'

// Footer labels are CMS-editable + bilingual (resolved server-side and passed
// in as `strings`). Hrefs stay hardcoded — only the visible text is editable.
type FooterColumn = { title: string; links: { label: string; href: string }[] }

// Careers lives on the marketplace site, not on this subdomain.
const MARKETPLACE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3006'

function buildColumns(s: FooterStrings): FooterColumn[] {
  return [
    {
      title: s.col_products,
      links: [
        { label: s.link_invitations, href: '/digital-cards' },
        { label: s.link_guests, href: '/guests-and-rsvp' },
        { label: s.link_website, href: '/websites' },
      ],
    },
    {
      title: s.col_templates,
      links: [
        { label: s.link_save_the_dates, href: '/digital-cards/save-the-date' },
        { label: s.link_wedding_invitations, href: '/digital-cards/wedding' },
        { label: s.link_send_off, href: '/digital-cards/send-off' },
        { label: s.link_kadi_michango, href: '/digital-cards/kadi-za-michango' },
      ],
    },
    {
      title: s.col_help,
      links: [
        { label: s.link_help_centre, href: '/help' },
        { label: s.link_pricing, href: '/pricing' },
        { label: s.link_contact, href: '/contact' },
      ],
    },
    {
      title: s.col_company,
      links: [
        { label: s.link_about, href: 'https://opusfesta.com' },
        { label: s.link_careers, href: `${MARKETPLACE_URL}/careers` },
        { label: s.link_press, href: '/contact' },
        { label: s.link_status, href: '/help' },
      ],
    },
  ]
}

export default function Footer({ strings }: { strings: FooterStrings }) {
  const columns = buildColumns(strings)
  return (
    <footer className="bg-white pt-20 pb-12 px-6 border-t border-gray-200">
      <div className="max-w-6xl mx-auto">

        {/* Links grid */}
        <Reveal direction="none" margin="-40px" className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-16 text-sm">
          {columns.map((col) => (
            <div key={col.title}>
              <h4 className="font-bold mb-4 text-[#1A1A1A]">{col.title}</h4>
              <ul className="space-y-3 text-gray-500">
                {col.links.map((link) => (
                  <li key={`${col.title}-${link.label}-${link.href}`}>
                    <Link href={link.href} className="hover:text-[#1A1A1A] transition-colors">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Reveal>

        {/* Watermark — CSS parallax, decorative only */}
        <div className="relative mb-8 py-8 -mx-6 overflow-hidden flex justify-center">
          <p
            aria-hidden="true"
            className="footer-watermark pointer-events-none whitespace-nowrap select-none text-center text-[14vw] md:text-[11vw] lg:text-[9vw] xl:text-[8.2vw] 2xl:text-[7.4vw] font-serif font-bold leading-none text-gray-100"
          >
            OpusPass
          </p>
        </div>

        <style>{`
          @keyframes footer-drift {
            from { transform: translateY(30px); }
            to   { transform: translateY(-30px); }
          }
          .footer-watermark {
            animation: footer-drift linear both;
            animation-timeline: scroll(root);
          }
          @media (prefers-reduced-motion: reduce) {
            .footer-watermark { animation: none; }
          }
        `}</style>

        <div className="flex flex-col items-center gap-4 md:flex-row md:justify-between md:gap-0 mt-8 pt-8 border-t border-gray-100 text-xs text-gray-400">
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 md:justify-start">
            <Link href="/terms" className="hover:text-[#1A1A1A] transition-colors">{strings.legal_terms}</Link>
            <Link href="/privacy" className="hover:text-[#1A1A1A] transition-colors">{strings.legal_privacy}</Link>
            <Link href="/cookies" className="hover:text-[#1A1A1A] transition-colors">{strings.legal_cookies}</Link>
            <Link href="/copyright" className="hover:text-[#1A1A1A] transition-colors">{strings.legal_copyright}</Link>
          </div>
          <span>{strings.copyright}</span>
          <div className="flex gap-4">
            {/* WhatsApp */}
            <a href="https://wa.me/255799242471" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="text-gray-400 hover:text-[#1A1A1A] transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.6 6.32A7.85 7.85 0 0 0 12.05 4a7.93 7.93 0 0 0-6.86 11.9L4 20l4.2-1.1a7.93 7.93 0 0 0 3.85 1h.01a7.93 7.93 0 0 0 6.7-12.58zM12.05 18.55a6.58 6.58 0 0 1-3.36-.92l-.24-.14-2.49.65.67-2.42-.16-.25a6.58 6.58 0 1 1 12.21-3.48 6.58 6.58 0 0 1-6.63 6.56zm3.6-4.93c-.2-.1-1.17-.58-1.35-.64s-.31-.1-.45.1-.51.64-.62.78-.23.15-.43.05a5.4 5.4 0 0 1-1.59-.98 5.96 5.96 0 0 1-1.1-1.37c-.12-.2 0-.3.09-.4.09-.09.2-.23.3-.34.1-.12.13-.2.2-.34.07-.13.03-.25-.02-.35-.05-.1-.45-1.08-.62-1.48-.16-.38-.33-.33-.45-.34h-.38a.74.74 0 0 0-.54.25 2.25 2.25 0 0 0-.7 1.67c0 .99.72 1.94.82 2.07.1.13 1.42 2.17 3.43 3.04.48.21.85.33 1.14.43.48.15.91.13 1.26.08.38-.06 1.17-.48 1.34-.94.16-.46.16-.86.11-.94-.05-.09-.18-.13-.38-.23z"/></svg>
            </a>
            {/* Instagram */}
            <a href="https://www.instagram.com/opusfesta/" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="text-gray-400 hover:text-[#1A1A1A] transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>
            </a>
            {/* TikTok */}
            <a href="https://www.tiktok.com/@opusfesta" target="_blank" rel="noopener noreferrer" aria-label="TikTok" className="text-gray-400 hover:text-[#1A1A1A] transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z"/></svg>
            </a>
            {/* Facebook */}
            <a href="https://www.facebook.com/OpusFesta" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="text-gray-400 hover:text-[#1A1A1A] transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
            </a>
          </div>
        </div>

      </div>
    </footer>
  )
}
