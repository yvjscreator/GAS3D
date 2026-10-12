import { useEffect, useState } from 'react'
import { GarmentAdStudio } from '../components/studio/GarmentAdStudio'
import { SubtitleStudio } from '../components/subtitles/SubtitleStudio'
import { ImagesStudio } from '../components/images/ImagesStudio'

type AppTool = 'garment' | 'subtitles' | 'images'

const currentTool = (): AppTool => {
  if (window.location.hash === '#/subtitles') return 'subtitles'
  if (window.location.hash === '#/images') return 'images'
  return 'garment'
}

export default function App() {
  const [tool, setTool] = useState<AppTool>(currentTool)

  useEffect(() => {
    const sync = () => setTool(currentTool())
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  const openTool = (next: AppTool) => {
    if (next === 'subtitles') window.location.hash = '/subtitles'
    else if (next === 'images') window.location.hash = '/images'
    else window.location.hash = ''
    setTool(next)
  }

  return <>
    <nav className={tool === 'subtitles' ? 'gas-tool-switcher subtitle-tool-switcher' : 'gas-tool-switcher'} aria-label="Herramientas GAS3D">
      <button className={tool === 'garment' ? 'active' : ''} onClick={() => openTool('garment')}>3D Studio</button>
      <button className={tool === 'subtitles' ? 'active' : ''} onClick={() => openTool('subtitles')}>Subtítulos</button>
      <button className={tool === 'images' ? 'active' : ''} onClick={() => openTool('images')}>Images</button>
    </nav>
    {tool === 'subtitles' ? <SubtitleStudio /> : tool === 'images' ? <ImagesStudio /> : <GarmentAdStudio />}
  </>
}
