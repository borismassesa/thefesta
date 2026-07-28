import Link from 'next/link'
import { ShoppingBag, Mail, CreditCard, CheckCircle2, ChevronRight } from 'lucide-react'

export type CheckoutStep = 'cart' | 'contact' | 'payment' | 'confirmation'

type Step = {
  id: CheckoutStep
  label: string
  href: string
  Icon: typeof ShoppingBag
}

const STEPS: Step[] = [
  { id: 'cart', label: 'Cart', href: '/digital-cards/cart', Icon: ShoppingBag },
  { id: 'contact', label: 'Contact', href: '/digital-cards/address', Icon: Mail },
  { id: 'payment', label: 'Payment', href: '/digital-cards/checkout', Icon: CreditCard },
  { id: 'confirmation', label: 'Confirmation', href: '/digital-cards/confirmation', Icon: CheckCircle2 },
]

export default function CheckoutStepper({ current }: { current: CheckoutStep }) {
  const currentIdx = STEPS.findIndex((s) => s.id === current)

  return (
    <nav aria-label="Checkout progress" className="mb-8">
      {/* Compact sizing below sm: keeps all four steps on one row at 375px
          instead of orphaning "Confirmation" onto its own line */}
      <ol className="flex items-center justify-center gap-2 sm:gap-6 lg:gap-12 flex-wrap">
        {STEPS.map((step, i) => {
          const status: 'done' | 'current' | 'todo' =
            i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'todo'
          const isLink = status === 'done'
          const StepIcon = step.Icon

          const content = (
            <span className="flex flex-col items-center gap-1 sm:gap-1.5 group">
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors sm:h-12 sm:w-12 ${
                  status === 'current'
                    ? 'text-gray-900'
                    : status === 'done'
                      ? 'bg-emerald-50 text-emerald-600'
                      : 'text-gray-400'
                }`}
              >
                {status === 'done' ? (
                  <CheckCircle2 className="h-5 w-5 sm:h-[26px] sm:w-[26px]" strokeWidth={2} />
                ) : (
                  <StepIcon className="h-5 w-5 sm:h-[26px] sm:w-[26px]" strokeWidth={1.5} />
                )}
              </span>
              <span
                className={`text-[11px] sm:text-sm transition-colors ${
                  status === 'current'
                    ? 'font-bold text-gray-900'
                    : status === 'done'
                      ? 'font-semibold text-gray-900'
                      : 'font-medium text-gray-400'
                }`}
              >
                {step.label}
              </span>
            </span>
          )

          return (
            <li key={step.id} className="flex items-center gap-2 sm:gap-6 lg:gap-12">
              {isLink ? (
                <Link href={step.href} aria-current={undefined}>
                  {content}
                </Link>
              ) : (
                <span aria-current={status === 'current' ? 'step' : undefined}>{content}</span>
              )}
              {i < STEPS.length - 1 && (
                // self-start + margin centers the chevron on the icon circle
                // (h-9 / sm:h-12) rather than on the taller icon+label column
                <ChevronRight className="h-3.5 w-3.5 self-start mt-[11px] text-gray-300 sm:h-4 sm:w-4 sm:mt-4" aria-hidden="true" />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
