import type Konva from 'konva';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Group, Image as KImage, Layer, Line, Rect, Shape, Stage, Text } from 'react-konva';
import { explodeDimension, formatMm } from '../../core/drawing/dimensions';
import type { Primitive } from '../../core/drawing/types';
import type { Vec2 } from '../../core/geometry/vec';
import { createSketchRegion } from '../../core/model/factory';
import { createId } from '../../core/model/ids';
import type { Id, SketchRegion } from '../../core/model/types';
import { addPoint, addRegion, addSegment, batch, movePoint, rectangleOp, type Op } from '../../core/ops/operations';
import { adaptiveGridStep, snapPoint, type SnapResult, type SnapTarget } from '../../core/sketch/snap';
import { useDrawings, useModel } from '../../state/derived';
import { useStore } from '../../state/store';
import { blurFormFocus } from '../util/download';
import { facadeToPixel, loadImage, rectifyImage } from '../util/rectify';

interface View {
  scale: number; // px per mm
  ox: number;
  oy: number;
}

const C = {
  bg: '#1d2024',
  gridMinor: '#262a2f',
  gridMajor: '#30353b',
  wallFill: '#2b2f34',
  wallStroke: '#8a9099',
  dim: '#ff7a6b',
  anno: '#5fd08a',
  sketch: '#39c0ff',
  select: '#ff8a00',
  hover: '#8cc8ff',
  point: '#ffffff',
};

interface Chain {
  regionId: Id;
  firstId: Id;
  lastId: Id;
  last: Vec2;
}

export function Editor2D() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<View>({ scale: 0.15, ox: 80, oy: 520 });
  const [cursor, setCursor] = useState<SnapResult | null>(null);
  const [chain, setChain] = useState<Chain | null>(null);
  const [rectStart, setRectStart] = useState<Vec2 | null>(null);
  const [refCanvas, setRefCanvas] = useState<HTMLCanvasElement | null>(null);
  const panRef = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean; onClick?: () => void } | null>(null);
  const dragRef = useRef<{ regionId: Id; pointId: Id; started: boolean } | null>(null);
  const spaceRef = useRef(false);

  const model = useModel();
  const drawings = useDrawings();
  const facade = model.facade;
  const selection = useStore((s) => s.selection);
  const hover = useStore((s) => s.hover);
  const tool = useStore((s) => s.tool);
  const activeRegionId = useStore((s) => s.activeRegionId);
  const snaps = useStore((s) => s.snaps);
  const showDimensions = useStore((s) => s.showDimensions);

  const toScreen = useCallback((x: number, z: number) => ({ x: view.ox + x * view.scale, y: view.oy - z * view.scale }), [view]);
  const toModel = useCallback((sx: number, sy: number): Vec2 => ({ x: (sx - view.ox) / view.scale, y: (view.oy - sy) / view.scale }), [view]);

  // ---------------------------------------------------------------- sizing / fit
  useEffect(() => {
    const host = hostRef.current!;
    const ro = new ResizeObserver(() => setSize({ w: host.clientWidth || 1, h: host.clientHeight || 1 }));
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(() => {
    const padL = 110;
    const padB = 120;
    const pad = 40;
    const s = Math.min((size.w - padL - pad) / facade.width, (size.h - padB - pad) / facade.height);
    const scale = Math.max(s, 0.01);
    setView({
      scale,
      ox: padL + (size.w - padL - pad - facade.width * scale) / 2,
      oy: size.h - padB - (size.h - padB - pad - facade.height * scale) / 2,
    });
  }, [size, facade.width, facade.height]);

  const fittedFor = useRef('');
  useEffect(() => {
    const key = `${facade.id}|${size.w}x${size.h}`;
    if (fittedFor.current !== key) {
      fittedFor.current = key;
      fit();
    }
  }, [facade.id, size, fit]);

  useEffect(() => {
    const onFit = () => fit();
    window.addEventListener('kad:fit2d', onFit);
    return () => window.removeEventListener('kad:fit2d', onFit);
  }, [fit]);

  // ---------------------------------------------------------------- reference image
  const ref = facade.reference;
  useEffect(() => {
    let cancelled = false;
    if (!ref || !ref.visible) {
      setRefCanvas(null);
      return;
    }
    loadImage(ref.dataUrl)
      .then((img) => {
        if (!cancelled) setRefCanvas(rectifyImage(img, ref, facade));
      })
      .catch(() => setRefCanvas(null));
    return () => {
      cancelled = true;
    };
  }, [ref?.dataUrl, ref?.corners, ref?.visible, facade.width, facade.height]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------- sketch data
  const sketchRegions = facade.regions.filter((r): r is SketchRegion => r.source === 'sketch');
  const activeSketch = sketchRegions.find((r) => r.id === activeRegionId);

  const snapTargets = useMemo((): SnapTarget[] => {
    const t: SnapTarget[] = [];
    for (const r of sketchRegions) {
      for (const p of r.sketch.points) t.push({ p: { x: p.x, y: p.z }, pointId: r.id === activeRegionId ? p.id : undefined });
    }
    const corners = [
      [0, 0],
      [facade.width, 0],
      [facade.width, facade.height],
      [0, facade.height],
    ];
    for (const [x, y] of corners) t.push({ p: { x, y } });
    // solid vertices; the original instance of a sketch face is already covered by its
    // sketch points (and must not attract a point that is being dragged)
    const sketchIds = new Set(sketchRegions.map((r) => r.id));
    for (const s of model.solids) {
      if (sketchIds.has(s.regionId) && s.instance === 0) continue;
      for (const p of s.profile) t.push({ p: { x: p.x, y: p.y } });
    }
    return t;
  }, [sketchRegions, activeRegionId, facade.width, facade.height, model.solids]);

  const gridStep = adaptiveGridStep(view.scale);
  // snapping is finer than the drawn grid: the smallest "nice" step still ≥ 4 px on screen
  const snapStep = adaptiveGridStep(view.scale, 4);

  const snapAt = (sx: number, sy: number, exclude?: Id): SnapResult => {
    const raw = toModel(sx, sy);
    // polylines align to their previous point; a rectangle's opposite corner must not
    // align to its first corner (that would collapse it to zero width or height)
    const anchors: Vec2[] = chain ? [chain.last] : [];
    return snapPoint(raw, {
      pxPerMm: view.scale,
      targets: exclude ? snapTargets.filter((t) => t.pointId !== exclude) : snapTargets,
      anchors,
      gridStep: snapStep,
      settings: snaps,
    });
  };

  // ---------------------------------------------------------------- operations
  const store = useStore.getState;

  /** Ensures a sketch region is active, returning its id and the op that creates it if needed. */
  const ensureSketchRegion = (): { regionId: Id; createOp: Op | null } => {
    if (activeSketch) return { regionId: activeSketch.id, createOp: null };
    const region = createSketchRegion(facade.id, { name: `Sketch ${sketchRegions.length + 1}` });
    return { regionId: region.id, createOp: addRegion(facade.id, region) };
  };

  const imageCoords = (p: Vec2) => (ref ? facadeToPixel(ref, facade, p.x, p.y) : undefined);

  /** Returns an existing point id from the snap, or creates one. */
  const pointFor = (snap: SnapResult, ops: Op[], regionId: Id): Id => {
    if (snap.pointId && activeSketch?.id === regionId) return snap.pointId;
    const id = createId('pt');
    ops.push(addPoint(regionId, { id, x: snap.p.x, z: snap.p.y, image: imageCoords(snap.p) }));
    return id;
  };

  const handleToolClick = (snap: SnapResult) => {
    const { apply, setActiveRegion, select } = store();
    if (tool === 'point') {
      const { regionId, createOp } = ensureSketchRegion();
      const ops: Op[] = createOp ? [createOp] : [];
      const id = pointFor({ ...snap, pointId: undefined }, ops, regionId);
      if (apply(batch(...ops), 'Add point')) {
        setActiveRegion(regionId);
        select({ kind: 'point', id, regionId });
      }
    } else if (tool === 'line') {
      const { regionId, createOp } = ensureSketchRegion();
      const ops: Op[] = createOp ? [createOp] : [];
      if (!chain) {
        const id = pointFor(snap, ops, regionId);
        if (ops.length && !apply(batch(...ops), 'Start line')) return;
        setActiveRegion(regionId);
        setChain({ regionId, firstId: id, lastId: id, last: snap.p });
        return;
      }
      const id = pointFor(snap, ops, chain.regionId);
      if (id === chain.lastId) return;
      ops.push(addSegment(chain.regionId, createId('seg'), chain.lastId, id));
      if (!apply(batch(...ops), 'Add line')) return;
      if (id === chain.firstId) setChain(null); // closed the contour
      else setChain({ ...chain, lastId: id, last: snap.p });
    } else if (tool === 'rect') {
      if (!rectStart) {
        setRectStart(snap.p);
        return;
      }
      const { regionId, createOp } = ensureSketchRegion();
      const rect = rectangleOp(regionId, rectStart.x, rectStart.y, snap.p.x, snap.p.y);
      const ops: Op[] = createOp ? [createOp, rect.op] : [rect.op];
      if (apply(batch(...ops), 'Add rectangle')) {
        setActiveRegion(regionId);
        select({ kind: 'region', id: regionId });
      }
      setRectStart(null);
    }
  };

  // cancel in-progress tools on Escape or tool change
  useEffect(() => {
    setChain(null);
    setRectStart(null);
  }, [tool]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setChain(null);
        setRectStart(null);
      }
      if (e.code === 'Space') spaceRef.current = e.type === 'keydown';
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }, []);

  // ---------------------------------------------------------------- pointer handling
  const targetInfo = (target: Konva.Node): { kind: string; id: string; regionId: string } | null => {
    const name = target.name();
    if (!name) return null;
    const [kind, regionId, id] = name.split('|');
    return { kind, regionId, id };
  };

  const onMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    blurFormFocus();
    const stage = e.target.getStage()!;
    const pos = stage.getPointerPosition()!;
    const btn = e.evt.button;
    if (btn === 2) {
      setChain(null);
      setRectStart(null);
      return;
    }
    const info = targetInfo(e.target);
    const { select, setActiveRegion } = store();
    if (btn === 1 || spaceRef.current || (tool === 'select' && (!info || info.kind === 'wall'))) {
      // drag pans the view; a plain click selects the façade or clears the selection
      const onClick =
        tool !== 'select' || btn === 1 || spaceRef.current
          ? undefined
          : info?.kind === 'wall'
            ? () => select({ kind: 'facade', id: facade.id })
            : () => select(null);
      panRef.current = { sx: pos.x, sy: pos.y, ox: view.ox, oy: view.oy, moved: false, onClick };
      return;
    }
    if (tool !== 'select') {
      handleToolClick(snapAt(pos.x, pos.y));
      return;
    }
    if (!info) return;
    if (info.kind === 'point') {
      select({ kind: 'point', id: info.id, regionId: info.regionId });
      setActiveRegion(info.regionId);
      dragRef.current = { regionId: info.regionId, pointId: info.id, started: false };
    } else if (info.kind === 'segment') {
      select({ kind: 'segment', id: info.id, regionId: info.regionId });
      setActiveRegion(info.regionId);
    } else if (info.kind === 'solid') {
      select({ kind: 'solid', id: info.id, regionId: info.regionId });
      const region = facade.regions.find((r) => r.id === info.regionId);
      if (region?.source === 'sketch') setActiveRegion(region.id);
    }
  };

  const onMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage()!;
    const pos = stage.getPointerPosition()!;
    const pan = panRef.current;
    if (pan) {
      const dx = pos.x - pan.sx;
      const dy = pos.y - pan.sy;
      if (Math.abs(dx) + Math.abs(dy) > 2) pan.moved = true;
      setView((v) => ({ ...v, ox: pan.ox + dx, oy: pan.oy + dy }));
      return;
    }
    const drag = dragRef.current;
    const snap = snapAt(pos.x, pos.y, drag?.pointId);
    setCursor(snap);
    if (drag) {
      const { beginLive, applyLive } = store();
      if (!drag.started) {
        beginLive('Move point');
        drag.started = true;
      }
      applyLive(movePoint(drag.regionId, drag.pointId, snap.p.x, snap.p.y));
    } else if (tool === 'select') {
      const info = targetInfo(e.target);
      const id = info?.kind === 'solid' ? info.id : null;
      if (store().hover !== id) store().setHover(id);
    }
  };

  const onMouseUp = () => {
    const pan = panRef.current;
    panRef.current = null;
    dragRef.current = null;
    if (pan && !pan.moved) pan.onClick?.();
  };

  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const pos = e.target.getStage()!.getPointerPosition()!;
    const factor = Math.exp(-e.evt.deltaY * 0.0015);
    setView((v) => {
      const scale = Math.min(Math.max(v.scale * factor, 0.005), 20);
      const mx = (pos.x - v.ox) / v.scale;
      const my = (v.oy - pos.y) / v.scale;
      return { scale, ox: pos.x - mx * scale, oy: pos.y + my * scale };
    });
  };

  // ---------------------------------------------------------------- annotation primitives (from the elevation drawing)
  const elevation = drawings.find((d) => d.type === 'elevation');
  const annotations: Primitive[] = useMemo(() => {
    if (!elevation || !showDimensions) return [];
    const pseudoScale = 4 / view.scale; // 1 mm on "paper" = 4 px on screen
    return [
      ...elevation.dimensions.flatMap((d) => explodeDimension(d, pseudoScale)),
      ...elevation.primitives.filter((p) => p.layer === 'KAD-ANNO'),
    ];
  }, [elevation, showDimensions, view.scale]);

  // ---------------------------------------------------------------- render helpers
  const flat = (pts: Vec2[]) => pts.flatMap((p) => {
    const s = toScreen(p.x, p.y);
    return [s.x, s.y];
  });

  const wallTL = toScreen(0, facade.height);
  const isSolidSelected = (id: string, regionId: string) =>
    (selection?.kind === 'solid' && selection.id === id) || (selection?.kind === 'region' && selection.id === regionId);

  const cursorScreen = cursor ? toScreen(cursor.p.x, cursor.p.y) : null;
  const cursorStyle = tool === 'select' ? 'default' : 'crosshair';

  return (
    <div ref={hostRef} className="editor2d" style={{ cursor: cursorStyle }} onContextMenu={(e) => e.preventDefault()} data-testid="editor2d">
      <Stage width={size.w} height={size.h} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={() => setCursor(null)} onWheel={onWheel}>
        <Layer listening={false}>
          <Rect x={0} y={0} width={size.w} height={size.h} fill={C.bg} />
          <Shape
            sceneFunc={(ctx) => {
              const min = toModel(0, size.h);
              const max = toModel(size.w, 0);
              const step = gridStep;
              const major = step * 10;
              for (const [s, color] of [
                [step, C.gridMinor],
                [major, C.gridMajor],
              ] as const) {
                if (s * view.scale < 6) continue;
                ctx.beginPath();
                for (let x = Math.ceil(min.x / s) * s; x <= max.x; x += s) {
                  const sx = Math.round(view.ox + x * view.scale) + 0.5;
                  ctx.moveTo(sx, 0);
                  ctx.lineTo(sx, size.h);
                }
                for (let y = Math.ceil(min.y / s) * s; y <= max.y; y += s) {
                  const sy = Math.round(view.oy - y * view.scale) + 0.5;
                  ctx.moveTo(0, sy);
                  ctx.lineTo(size.w, sy);
                }
                ctx.setAttr('strokeStyle', color);
                ctx.setAttr('lineWidth', 1);
                ctx.stroke();
              }
              // axes at façade origin
              const o = toScreen(0, 0);
              ctx.beginPath();
              ctx.moveTo(o.x, o.y);
              ctx.lineTo(o.x + 40, o.y);
              ctx.setAttr('strokeStyle', '#e05555');
              ctx.setAttr('lineWidth', 2);
              ctx.stroke();
              ctx.beginPath();
              ctx.moveTo(o.x, o.y);
              ctx.lineTo(o.x, o.y - 40);
              ctx.setAttr('strokeStyle', '#4f9be0');
              ctx.stroke();
            }}
          />
        </Layer>

        <Layer>
          {/* wall / façade */}
          <Rect
            name={`wall|${facade.id}|${facade.id}`}
            x={wallTL.x}
            y={wallTL.y}
            width={facade.width * view.scale}
            height={facade.height * view.scale}
            fill={C.wallFill}
            stroke={selection?.kind === 'facade' ? C.select : C.wallStroke}
            strokeWidth={selection?.kind === 'facade' ? 2 : 1.25}
          />
          {refCanvas && ref && (
            <KImage
              image={refCanvas}
              x={wallTL.x}
              y={wallTL.y}
              width={facade.width * view.scale}
              height={facade.height * view.scale}
              opacity={ref.opacity}
              listening={false}
            />
          )}

          {/* components: front faces of the solids */}
          {model.solids.map((s) => {
            const sel = isSolidSelected(s.id, s.regionId);
            const hov = hover === s.id;
            return (
              <Line
                key={s.id}
                name={`solid|${s.regionId}|${s.id}`}
                points={flat(s.profile)}
                closed
                fill={s.material.color}
                opacity={refCanvas ? 0.55 : 0.92}
                stroke={sel ? C.select : hov ? C.hover : '#101214'}
                strokeWidth={sel ? 2.5 : hov ? 2 : 1}
                perfectDrawEnabled={false}
              />
            );
          })}

          {/* sketch segments and points */}
          {sketchRegions.map((r) => {
            const pts = new Map(r.sketch.points.map((p) => [p.id, p]));
            const active = r.id === activeRegionId;
            return (
              <Group key={r.id} opacity={active ? 1 : 0.55}>
                {r.sketch.segments.map((s) => {
                  const a = pts.get(s.a);
                  const b = pts.get(s.b);
                  if (!a || !b) return null;
                  const sel = selection?.kind === 'segment' && selection.id === s.id;
                  return (
                    <Line
                      key={s.id}
                      name={`segment|${r.id}|${s.id}`}
                      points={flat([{ x: a.x, y: a.z }, { x: b.x, y: b.z }])}
                      stroke={sel ? C.select : C.sketch}
                      strokeWidth={sel ? 3 : 1.5}
                      hitStrokeWidth={10}
                    />
                  );
                })}
                {r.sketch.points.map((p) => {
                  const s = toScreen(p.x, p.z);
                  const sel = selection?.kind === 'point' && selection.id === p.id;
                  return (
                    <Circle
                      key={p.id}
                      name={`point|${r.id}|${p.id}`}
                      x={s.x}
                      y={s.y}
                      radius={sel ? 5 : 4}
                      fill={sel ? C.select : C.point}
                      stroke={C.sketch}
                      strokeWidth={1.5}
                      hitStrokeWidth={8}
                    />
                  );
                })}
              </Group>
            );
          })}
        </Layer>

        <Layer listening={false}>
          {annotations.map((p, i) => {
            const color = p.layer === 'KAD-ANNO' ? C.anno : C.dim;
            if (p.type === 'line') {
              return <Line key={i} points={flat([p.a, p.b])} stroke={color} strokeWidth={0.8} dash={p.dashed ? [8, 5] : undefined} />;
            }
            if (p.type === 'polyline') return <Line key={i} points={flat(p.points)} closed={p.closed} stroke={color} strokeWidth={0.8} />;
            const s = toScreen(p.at.x, p.at.y);
            return (
              <Text
                key={i}
                x={s.x}
                y={s.y}
                text={p.text}
                fontSize={11}
                fontFamily="IBM Plex Mono, Menlo, monospace"
                fill={color}
                width={120}
                offsetX={60}
                offsetY={11}
                align="center"
                rotation={-p.rotation}
              />
            );
          })}

          {/* in-progress tool feedback */}
          {chain && cursor && (
            <Line points={flat([chain.last, cursor.p])} stroke={C.sketch} strokeWidth={1.25} dash={[6, 4]} />
          )}
          {rectStart && cursor && (
            <Line
              points={flat([rectStart, { x: cursor.p.x, y: rectStart.y }, cursor.p, { x: rectStart.x, y: cursor.p.y }])}
              closed
              stroke={C.sketch}
              strokeWidth={1.25}
              dash={[6, 4]}
            />
          )}
          {rectStart && cursor && (
            <Text
              x={toScreen(cursor.p.x, cursor.p.y).x + 12}
              y={toScreen(cursor.p.x, cursor.p.y).y + 8}
              text={`${formatMm(Math.abs(cursor.p.x - rectStart.x))} × ${formatMm(Math.abs(cursor.p.y - rectStart.y))}`}
              fontSize={11}
              fill={C.sketch}
            />
          )}
          {chain && cursor && (
            <Text
              x={toScreen(cursor.p.x, cursor.p.y).x + 12}
              y={toScreen(cursor.p.x, cursor.p.y).y + 8}
              text={formatMm(Math.hypot(cursor.p.x - chain.last.x, cursor.p.y - chain.last.y))}
              fontSize={11}
              fill={C.sketch}
            />
          )}
          {cursorScreen && tool !== 'select' && cursor && (
            <Rect
              x={cursorScreen.x - 5}
              y={cursorScreen.y - 5}
              width={10}
              height={10}
              stroke={cursor.kind === 'endpoint' || cursor.kind === 'vertex' ? '#ffd23f' : cursor.kind === 'axis' ? '#5fd08a' : '#cccccc'}
              strokeWidth={1.25}
              rotation={cursor.kind === 'axis' ? 45 : 0}
              offsetX={0}
            />
          )}
        </Layer>
      </Stage>
      <div className="editor-hud">
        {cursor ? (
          <span>
            X {formatMm(cursor.p.x)} · Z {formatMm(cursor.p.y)} mm{cursor.kind !== 'none' ? ` · snap: ${cursor.kind}` : ''}
          </span>
        ) : (
          <span>Façade {formatMm(facade.width)} × {formatMm(facade.height)} mm</span>
        )}
        <span className="muted">
          {' '}
          · grid {gridStep} mm · snap {snapStep} mm
        </span>
        {tool === 'line' && <span className="muted"> · click points, click the first point to close, Esc to finish</span>}
        {tool === 'rect' && <span className="muted"> · click two opposite corners</span>}
      </div>
    </div>
  );
}
