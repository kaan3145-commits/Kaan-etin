import { applyHomography, invertHomography, pixelToFacadeTransform } from '../../core/calibration/homography';
import type { Facade, ReferenceImage } from '../../core/model/types';

const imageCache = new Map<string, Promise<HTMLImageElement>>();

export function loadImage(src: string): Promise<HTMLImageElement> {
  let p = imageCache.get(src);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not load image'));
      img.src = src;
    });
    imageCache.set(src, p);
  }
  return p;
}

/**
 * Perspective-corrects the reference image into façade space: every output
 * pixel is mapped façade → image pixel through the inverse calibration
 * homography and sampled bilinearly. The output covers exactly W × H mm.
 */
export function rectifyImage(img: HTMLImageElement, ref: ReferenceImage, facade: Pick<Facade, 'width' | 'height'>, maxSize = 1600): HTMLCanvasElement {
  const H = pixelToFacadeTransform(facade, ref.corners);
  const inv = invertHomography(H);
  const aspect = facade.width / facade.height;
  const outW = Math.round(aspect >= 1 ? maxSize : maxSize * aspect);
  const outH = Math.round(aspect >= 1 ? maxSize / aspect : maxSize);

  const src = document.createElement('canvas');
  src.width = img.naturalWidth;
  src.height = img.naturalHeight;
  const sctx = src.getContext('2d')!;
  sctx.drawImage(img, 0, 0);
  const sdata = sctx.getImageData(0, 0, src.width, src.height).data;
  const sw = src.width;
  const sh = src.height;

  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const octx = out.getContext('2d')!;
  const odata = octx.createImageData(outW, outH);
  const o = odata.data;
  for (let j = 0; j < outH; j++) {
    const z = (1 - (j + 0.5) / outH) * facade.height;
    for (let i = 0; i < outW; i++) {
      const x = ((i + 0.5) / outW) * facade.width;
      const p = applyHomography(inv, { x, y: z });
      const px = p.x - 0.5;
      const py = p.y - 0.5;
      const k = (j * outW + i) * 4;
      if (px < 0 || py < 0 || px >= sw - 1 || py >= sh - 1) {
        o[k + 3] = 0;
        continue;
      }
      const x0 = Math.floor(px);
      const y0 = Math.floor(py);
      const fx = px - x0;
      const fy = py - y0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + sw * 4;
      const i11 = i01 + 4;
      for (let c = 0; c < 4; c++) {
        o[k + c] =
          sdata[i00 + c] * (1 - fx) * (1 - fy) + sdata[i10 + c] * fx * (1 - fy) + sdata[i01 + c] * (1 - fx) * fy + sdata[i11 + c] * fx * fy;
      }
    }
  }
  octx.putImageData(odata, 0, 0);
  return out;
}

/** Façade-local (x, z) → image pixel, for recording where a point was digitised. */
export function facadeToPixel(ref: ReferenceImage, facade: Pick<Facade, 'width' | 'height'>, x: number, z: number) {
  const p = applyHomography(invertHomography(pixelToFacadeTransform(facade, ref.corners)), { x, y: z });
  return { px: Math.round(p.x * 10) / 10, py: Math.round(p.y * 10) / 10 };
}
