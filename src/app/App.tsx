import { useEffect, useState } from 'react'
import { GarmentAdStudio } from '../components/studio/GarmentAdStudio'
import { SubtitleStudio } from '../components/subtitles/SubtitleStudio'

type AppTool = 'garment' | 'subtitles'

const currentTool = (): AppTool => window.location.hash === '#/subtitles' ? 'subtitles' : 'garment'

export default function App() {
  const [tool, setTool] = useState<AppTool>(currentTool)

  useEffect(() => {
    const sync = () => setTool(currentTool())
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  const openTool = (next: AppTool) => {
    if (next === 'subtitles') window.location.hash = '/subtitles'
    else window.history.replaceState(null, '', window.location.pathname + window.location.search)
    setTool(next)
  }

  return <>
    <nav className="gas-tool-switcher" aria-label="Herramientas GAS3D">
      <button className={tool === 'garment' ? 'active' : ''} onClick={() => openTool('garment')}>3D Studio</button>
      <button className={tool === 'subtitles' ? 'active' : ''} onClick={() => openTool('subtitles')}>Subtítulos</button>
    </nav>
    {tool === 'subtitles' ? <SubtitleStudio /> : <GarmentAdStudio />}
  </>
}
