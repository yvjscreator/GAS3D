import { HalftoneLab } from '../components/halftone/HalftoneLab'
import { GarmentAdStudio } from '../components/studio/GarmentAdStudio'

export default function App() {
  const activeTool = new URLSearchParams(window.location.search).get('tool')

  if (activeTool === 'halftone') {
    return <HalftoneLab />
  }

  return <GarmentAdStudio />
}
