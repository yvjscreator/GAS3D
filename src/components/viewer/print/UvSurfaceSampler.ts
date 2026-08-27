import * as THREE from 'three'

export function sampleUvSurfacePoint(root: THREE.Object3D, uvPoint: THREE.Vector2, expectedLocalNormal: THREE.Vector3) {
  root.updateWorldMatrix(true, true)
  const expectedWorldNormal = expectedLocalNormal.clone().transformDirection(root.matrixWorld)
  const best: { point: THREE.Vector3 | null; score: number } = { point: null, score: -Infinity }

  root.traverse((item) => {
    if (!('isMesh' in item) || !item.isMesh) return
    const mesh = item as THREE.Mesh<THREE.BufferGeometry>
    const position = mesh.geometry.getAttribute('position')
    const uv = mesh.geometry.getAttribute('uv')
    const normal = mesh.geometry.getAttribute('normal')
    const index = mesh.geometry.index
    if (!position || !uv) return
    const count = index?.count ?? position.count

    for (let offset = 0; offset + 2 < count; offset += 3) {
      const ia = index ? index.getX(offset) : offset
      const ib = index ? index.getX(offset + 1) : offset + 1
      const ic = index ? index.getX(offset + 2) : offset + 2
      const ax = uv.getX(ia), ay = uv.getY(ia)
      const bx = uv.getX(ib), by = uv.getY(ib)
      const cx = uv.getX(ic), cy = uv.getY(ic)
      if (uvPoint.x < Math.min(ax, bx, cx) || uvPoint.x > Math.max(ax, bx, cx) || uvPoint.y < Math.min(ay, by, cy) || uvPoint.y > Math.max(ay, by, cy)) continue

      const denominator = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
      if (Math.abs(denominator) < 1e-10) continue
      const wa = ((by - cy) * (uvPoint.x - cx) + (cx - bx) * (uvPoint.y - cy)) / denominator
      const wb = ((cy - ay) * (uvPoint.x - cx) + (ax - cx) * (uvPoint.y - cy)) / denominator
      const wc = 1 - wa - wb
      if (wa < -0.0001 || wb < -0.0001 || wc < -0.0001) continue

      const point = new THREE.Vector3(
        position.getX(ia) * wa + position.getX(ib) * wb + position.getX(ic) * wc,
        position.getY(ia) * wa + position.getY(ib) * wb + position.getY(ic) * wc,
        position.getZ(ia) * wa + position.getZ(ib) * wb + position.getZ(ic) * wc,
      ).applyMatrix4(mesh.matrixWorld)
      let score = 0
      if (normal) {
        const worldNormal = new THREE.Vector3(
          normal.getX(ia) * wa + normal.getX(ib) * wb + normal.getX(ic) * wc,
          normal.getY(ia) * wa + normal.getY(ib) * wb + normal.getY(ic) * wc,
          normal.getZ(ia) * wa + normal.getZ(ib) * wb + normal.getZ(ic) * wc,
        ).normalize().transformDirection(mesh.matrixWorld)
        score = worldNormal.dot(expectedWorldNormal)
      }
      if (score > best.score) { best.point = point; best.score = score }
    }
  })
  return best.point
}
