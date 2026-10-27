import type { Facade, Id, KadDocument, Region, Space } from './types';

export function allFacades(doc: KadDocument): Facade[] {
  return doc.project.spaces.flatMap((s) => s.facades);
}

export function findSpace(doc: KadDocument, id: Id): Space | undefined {
  return doc.project.spaces.find((s) => s.id === id);
}

export function findFacade(doc: KadDocument, id: Id): Facade | undefined {
  return allFacades(doc).find((f) => f.id === id);
}

export function findRegion(doc: KadDocument, id: Id): { facade: Facade; region: Region } | undefined {
  for (const facade of allFacades(doc)) {
    const region = facade.regions.find((r) => r.id === id);
    if (region) return { facade, region };
  }
  return undefined;
}

export function firstFacade(doc: KadDocument): Facade {
  const f = allFacades(doc)[0];
  if (!f) throw new Error('Document has no façade');
  return f;
}
