export function StudioLights() {
  return <>
    <ambientLight intensity={0.62} />
    <directionalLight position={[4, 5, 5]} intensity={2.15} />
    <directionalLight position={[-5, 2, 3]} intensity={1.05} />
    <directionalLight position={[0, 3, -5]} intensity={1.55} />
  </>
}
