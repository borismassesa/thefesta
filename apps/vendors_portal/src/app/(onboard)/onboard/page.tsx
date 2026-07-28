import VerticalChooserClient from './VerticalChooserClient'

// /onboard used to redirect straight to the category grid, which meant a vendor
// picked "Décor & gifts" out of a flat list next to "Photographer" with no idea
// the two lead to entirely different surfaces. It now asks the vertical
// question first and the category grid is filtered by the answer.
export default function OnboardIndex() {
  return <VerticalChooserClient />
}
