import { useEffect, useState } from 'react'
import { GarmentAdStudio } from '../components/studio/GarmentAdStudio'
import { SubtitleStudio } from '../components/subtitles/SubtitleStudio'
import { ImagesStudio } from '../components/images/ImagesStudio'
import { CollageCreator } from '../components/collage/CollageCreator'
import { HalftoneLab } from '../components/halftone/HalftoneLab'

type AppTool = 'garment' | 'subtitles' | 'images' | 'collage' | 'halftone'

const currentTool = (): AppTool => {
  if (window.location.hash === '#/subtitles') return 'subtitles'
  if (window.location.hash === '#/images') return 'images'
  if (window.location.hash === '#/collage') return 'collage'
  if (window.location.hash === '#/halftone') return 'halftone'
  if (!window.location.hash && new URLSearchParams(window.location.search).get('tool') === 'halftone') return 'halftone'
  return 'garment'
}

export default function App() {
  const [tool, setTool] = useState<AppTool>(currentTool)
  useEffect(() => {
    const sync = () => setTool(currentTool())
    window.addEventListener('hashchange', sync)
    window.addEventListener('popstate', sync)
    return () => {
      window.removeEventListener('hashchange', sync)
      window.removeEventListener('popstate', sync)
    }
  }, [])

  const openTool = (next: AppTool) => {
    if (next === 'subtitles') window.location.hash = '/subtitles'
    else if (next === 'images') window.location.hash = '/images'
    else if (next === 'collage') window.location.hash = '/collage'
    else if (next === 'halftone') window.location.hash = '/halftone'
    else window.location.hash = '/garment'
    setTool(next)
  }

  return <>
    <nav className={tool === 'subtitles' ? 'gas-tool-switcher subtitle-tool-switcher' : tool === 'collage' ? 'gas-tool-switcher collage-tool-switcher' : 'gas-tool-switcher'} aria-label="Herramientas GAS3D">
      <button className={tool === 'garment' ? 'active' : ''} onClick={() => openTool('garment')}>3D Studio</button>
      <button className={tool === 'subtitles' ? 'active' : ''} onClick={() => openTool('subtitles')}>Subtítulos</button>
      <button className={tool === 'images' ? 'active' : ''} onClick={() => openTool('images')}>Images</button>
      <button className={tool === 'collage' ? 'active' : ''} onClick={() => openTool('collage')}>Collage</button>
      <button className={tool === 'halftone' ? 'active' : ''} onClick={() => openTool('halftone')}>Halftone Lab</button>
    </nav>
    {tool === 'subtitles' ? <SubtitleStudio /> : tool === 'images' ? <ImagesStudio /> : tool === 'collage' ? <CollageCreator /> : tool === 'halftone' ? <HalftoneLab /> : <GarmentAdStudio />}
  </>
}
