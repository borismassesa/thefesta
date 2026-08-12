import { Apple, Play } from 'lucide-react'

export default function GetApp() {
  return (
    <section className="relative py-32 px-6 overflow-hidden">
      <div className="absolute inset-0 z-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://images.unsplash.com/photo-1519225421980-715cb0215aed?auto=format&fit=crop&w=2000&q=80"
          alt="Abstract wedding"
          className="w-full h-full object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#FFFFFF]/70 to-[#FFFFFF]/90"></div>
      </div>

      <div className="relative z-10 max-w-4xl mx-auto bg-[#FFFFFF] rounded-[var(--opus-radius-xlarge)] p-12 md:p-20 text-center shadow-2xl">
        <h2 className="text-6xl md:text-[80px] font-black tracking-tighter uppercase leading-[0.85] mb-12 text-[#1A1A1A]">
          GET THE APP FOR
          <br />
          PLANNING
          <br />
          ON THE GO
        </h2>

        <div className="flex flex-col items-center justify-center gap-8">
          <div className="flex items-center gap-4 bg-[#FFFFFF] p-4 rounded-2xl border border-gray-100">
            <div className="text-left">
              <p className="text-sm font-bold text-gray-500 uppercase">Scan to</p>
              <p className="text-sm font-bold text-gray-500 uppercase">get</p>
              <p className="text-sm font-bold text-[#1A1A1A] uppercase">OpusFesta</p>
            </div>
            <div className="w-24 h-24 bg-white p-2 rounded-xl shadow-sm border border-gray-200 flex items-center justify-center">
              <div className="w-full h-full bg-[url('https://upload.wikimedia.org/wikipedia/commons/d/d0/QR_code_for_mobile_English_Wikipedia.svg')] bg-cover"></div>
            </div>
          </div>

          <div className="flex gap-4">
            <button data-opus-button="primary" data-opus-button-size="large" className="bg-[#1A1A1A] text-white px-6 py-3 rounded-xl flex items-center gap-2 hover:bg-black transition-colors">
              <Apple size={24} />
              <div className="text-left">
                <p className="text-[10px] leading-none text-gray-300">Download on the</p>
                <p className="text-sm font-bold leading-tight">App Store</p>
              </div>
            </button>
            <button data-opus-button="primary" data-opus-button-size="large" className="bg-[#1A1A1A] text-white px-6 py-3 rounded-xl flex items-center gap-2 hover:bg-black transition-colors">
              <Play size={20} />
              <div className="text-left">
                <p className="text-[10px] leading-none text-gray-300">GET IT ON</p>
                <p className="text-sm font-bold leading-tight">Google Play</p>
              </div>
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
