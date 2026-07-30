import type { Metadata } from 'next'
import Navbar from '@/components/navbar'
import Footer from '@/components/footer'
import PlanningToolsHero from '@/components/planning-tools/PlanningToolsHero'

export const metadata: Metadata = {
  title: 'Planning Tools | OpusFesta',
  description:
    'Checklists, budgets, guest lists and seating charts. Every moving piece of your wedding in one place.',
}

export default function PlanningToolsPage() {
  return (
    <>
      <Navbar />
      <PlanningToolsHero />
      <Footer />
    </>
  )
}
