import * as THREE from "three"

/** One tileable pulp/fiber sample shared by every paper surface in a view.
 * Channels separate soft pulp clouds, short fibers and fine grain. */
export function paperPulpTexture(size = 256): THREE.DataTexture {
  const pixels = new Uint8Array(size * size * 4)
  const hash = (x: number, y: number) => {
    let value = Math.imul(x + 71, 374761393) ^ Math.imul(y + 19, 668265263)
    value = Math.imul(value ^ (value >>> 13), 1274126177)
    return ((value ^ (value >>> 16)) >>> 0) / 4294967296
  }
  const noise = (x: number, y: number, cells: number) => {
    const u = x / size * cells, v = y / size * cells
    const ix = Math.floor(u), iy = Math.floor(v)
    const sx = u - ix, sy = v - iy
    const a = sx * sx * (3 - 2 * sx), b = sy * sy * (3 - 2 * sy)
    const at = (dx: number, dy: number) => hash((ix + dx) % cells, (iy + dy) % cells)
    return (at(0, 0) * (1 - a) + at(1, 0) * a) * (1 - b) + (at(0, 1) * (1 - a) + at(1, 1) * a) * b
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const at = (y * size + x) * 4
    pixels[at] = Math.round(255 * (.7 * noise(x, y, 8) + .3 * noise(x, y, 32)))
    pixels[at + 1] = 128
    pixels[at + 2] = Math.round(90 + hash(x, y) * 76)
    pixels[at + 3] = 255
  }
  for (let i = 0; i < 3800; i++) {
    const x = Math.floor(hash(i, 37) * size), y = Math.floor(hash(i, 89) * size)
    const length = 2 + Math.floor(hash(i, 121) * 7)
    const value = hash(i, 9) > .45 ? 205 : 66
    for (let step = 0; step < length; step++) {
      const px = (x + step) % size, py = (y + Math.floor(step * (hash(i, 17) - .5))) % size
      pixels[(((py + size) % size) * size + px) * 4 + 1] = value
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = true
  texture.needsUpdate = true
  texture.name = "paper-pulp-and-fibers"
  return texture
}

/** Add paper grain without replacing printed arrows, floor patterns or colors.
 * World coordinates keep grain the same size on a desk, wall and ground;
 * instancing uses each piece's transform. Sprites and unlit text stay crisp.
 * The weak set never keeps retired drawing materials alive. */
export function createPaperSurfaces() {
  const texture = paperPulpTexture()
  const treated = new WeakSet<THREE.Material>()
  return {
    apply(root: THREE.Object3D) {
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (!(material instanceof THREE.MeshLambertMaterial) || treated.has(material)) continue
          treated.add(material)
          const previous = material.onBeforeCompile
          const previousKey = material.customProgramCacheKey()
          material.onBeforeCompile = (shader, renderer) => {
            previous.call(material, shader, renderer)
            shader.uniforms.paperPulp = { value: texture }
            shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vPaperPosition;")
              .replace("#include <project_vertex>", `#include <project_vertex>
                vec4 paperPosition = vec4(transformed, 1.0);
                #ifdef USE_BATCHING
                  paperPosition = batchingMatrix * paperPosition;
                #endif
                #ifdef USE_INSTANCING
                  paperPosition = instanceMatrix * paperPosition;
                #endif
                vPaperPosition = (modelMatrix * paperPosition).xyz;`)
            shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
              uniform sampler2D paperPulp;
              varying vec3 vPaperPosition;`)
              .replace("#include <color_fragment>", `#include <color_fragment>
                vec3 paperAxis = abs(normalize(cross(dFdx(vPaperPosition), dFdy(vPaperPosition))));
                paperAxis = pow(paperAxis, vec3(4.0));
                paperAxis /= max(dot(paperAxis, vec3(1.0)), .0001);
                vec3 paperPoint = vPaperPosition * .5;
                vec3 paperGrain = texture2D(paperPulp, paperPoint.yz).rgb * paperAxis.x
                  + texture2D(paperPulp, paperPoint.xz).rgb * paperAxis.y
                  + texture2D(paperPulp, paperPoint.xy).rgb * paperAxis.z;
                float paperTone = (paperGrain.r - .5) * .24 + (paperGrain.g - .5) * .14 + (paperGrain.b - .5) * .04;
                diffuseColor.rgb *= 1.0 + paperTone;
                float paperHeight = (paperGrain.r - .5) * .012 + (paperGrain.g - .5) * .006;`)
              .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
                vec3 paperDx = dFdx(-vViewPosition), paperDy = dFdy(-vViewPosition);
                vec3 paperR1 = cross(paperDy, normal), paperR2 = cross(normal, paperDx);
                float paperDet = dot(paperDx, paperR1) * faceDirection;
                vec3 paperGrad = sign(paperDet) * (dFdx(paperHeight) * paperR1 + dFdy(paperHeight) * paperR2);
                normal = normalize(abs(paperDet) * normal - paperGrad);`)
          }
          material.customProgramCacheKey = () => previousKey + ":paper-pulp-v1"
          material.needsUpdate = true
        }
      })
    },
    dispose() { texture.dispose() },
  }
}
