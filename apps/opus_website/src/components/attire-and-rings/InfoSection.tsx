export function InfoSection() {
  return (
    <div className="bg-[#faeddf]/40 py-16 mt-12 text-gray-800">
      <div className="max-w-3xl mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-serif font-medium mb-4 text-gray-900">About Attire &amp; Rings on OpusFesta</h2>
          <p className="text-[15px] text-gray-700 max-w-2xl mx-auto leading-relaxed">
            A curated marketplace connecting couples in Tanzania with trusted bridal boutiques, jewellers, and tailors — so finding your wedding-day look is simple, transparent, and stress-free.
          </p>
        </div>

        <div className="space-y-10 text-left max-w-2xl mx-auto mb-16">
          <div>
            <h3 className="font-medium text-lg text-gray-900 mb-2">What you&apos;ll find here</h3>
            <p className="leading-relaxed text-[15px]">
              Browse wedding dresses, groom suits and tuxedos, engagement rings, wedding bands, and accessories from boutiques in Dar es Salaam, Arusha, Zanzibar, and beyond. Every shop on OpusFesta is verified, so you know who you&apos;re working with before you book a fitting.
            </p>
          </div>

          <div>
            <h3 className="font-medium text-lg text-gray-900 mb-2">How it works</h3>
            <p className="leading-relaxed text-[15px]">
              Save the pieces you love, message vendors directly through the platform, and book an in-person fitting or consultation when you&apos;re ready. Payments are handled in TZS via mobile money (M-Pesa, Airtel, Tigo) or card — no hidden fees.
            </p>
          </div>

          <div>
            <h3 className="font-medium text-lg text-gray-900 mb-2">Why couples choose OpusFesta</h3>
            <p className="leading-relaxed text-[15px]">
              Verified local vendors, transparent pricing, and real reviews from couples who&apos;ve walked down the aisle. Whether you want a bespoke gown, a tailored three-piece, or a custom-set diamond band, you&apos;ll find a maker who fits your style and budget.
            </p>
          </div>
        </div>

        <div className="text-center">
          <h3 className="text-xl font-medium text-gray-900 mb-6">Have a question? We&apos;re here to help.</h3>
          <button data-opus-button="tertiary" data-opus-button-size="medium" className="border border-gray-900 text-gray-900 font-medium px-6 py-2.5 rounded-full hover:shadow-md transition bg-transparent hover:bg-white">
            Go to Help Centre
          </button>
        </div>
      </div>
    </div>
  )
}
