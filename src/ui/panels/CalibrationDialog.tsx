import { useEffect, useState } from 'react';
import { Circle, Image as KImage, Layer, Line, Stage, Text } from 'react-konva';
import type { PixelPoint } from '../../core/model/types';
import * as ops from '../../core/ops/operations';
import { useModel } from '../../state/derived';
import { useStore } from '../../state/store';
import { loadImage } from '../util/rectify';

const LABELS = ['BL', 'BR', 'TR', 'TL'];
const W = 760;
const H = 520;

/**
 * Four-corner calibration: the user drags the handles onto the façade corners in
 * the photo. The resulting homography rectifies the image onto the measured façade.
 */
export function CalibrationDialog() {
  const model = useModel();
  const apply = useStore((s) => s.apply);
  const setCalibrating = useStore((s) => s.setCalibrating);
  const facade = model.facade;
  const ref = facade.reference;
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [corners, setCorners] = useState<PixelPoint[]>(ref?.corners ?? []);

  useEffect(() => {
    if (ref) loadImage(ref.dataUrl).then(setImg);
  }, [ref?.dataUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ref) return null;
  const s = Math.min((W - 40) / ref.pixelWidth, (H - 40) / ref.pixelHeight);
  const ox = (W - ref.pixelWidth * s) / 2;
  const oy = (H - ref.pixelHeight * s) / 2;
  const toScreen = (c: PixelPoint) => ({ x: ox + c.px * s, y: oy + c.py * s });

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <header>
          <h2>Calibrate reference image</h2>
          <p>
            Drag the four handles onto the façade corners in the photo (BL = bottom-left). The image is perspective-corrected onto the measured{' '}
            {facade.width} × {facade.height} mm façade.
          </p>
        </header>
        <Stage width={W} height={H} className="calib-stage">
          <Layer>
            {img && <KImage image={img} x={ox} y={oy} width={ref.pixelWidth * s} height={ref.pixelHeight * s} />}
            <Line points={corners.flatMap((c) => [toScreen(c).x, toScreen(c).y])} closed stroke="#ff8a00" strokeWidth={1.5} fill="rgba(255,138,0,0.08)" />
            {corners.map((c, i) => {
              const p = toScreen(c);
              return (
                <Circle
                  key={i}
                  x={p.x}
                  y={p.y}
                  radius={8}
                  fill="rgba(255,138,0,0.35)"
                  stroke="#ff8a00"
                  strokeWidth={2}
                  draggable
                  onDragMove={(e) => {
                    const px = Math.min(Math.max((e.target.x() - ox) / s, 0), ref.pixelWidth);
                    const py = Math.min(Math.max((e.target.y() - oy) / s, 0), ref.pixelHeight);
                    setCorners((cs) => cs.map((q, k) => (k === i ? { px: Math.round(px), py: Math.round(py) } : q)));
                  }}
                />
              );
            })}
            {corners.map((c, i) => {
              const p = toScreen(c);
              return <Text key={`t${i}`} x={p.x + 10} y={p.y - 18} text={LABELS[i]} fill="#ffffff" fontSize={13} fontStyle="bold" listening={false} />;
            })}
          </Layer>
        </Stage>
        <footer>
          <button onClick={() => setCalibrating(false)}>Cancel</button>
          <button
            className="primary"
            onClick={() => {
              if (apply(ops.setReferenceProps(facade.id, { corners: corners as typeof ref.corners }), 'Calibrate reference image')) setCalibrating(false);
            }}
          >
            Apply calibration
          </button>
        </footer>
      </div>
    </div>
  );
}
