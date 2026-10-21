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

  return <>
    {/* Each studio owns its compact header and the shared AppLauncher. */}
    {tool === 'subtitles' ? <SubtitleStudio /> : tool === 'images' ? <ImagesStudio /> : tool === 'collage' ? <CollageCreator /> : tool === 'halftone' ? <HalftoneLab /> : <GarmentAdStudio />}
  </>
}
