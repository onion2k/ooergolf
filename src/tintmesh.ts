/**
 * The ground of a golf hole divided by the banks' tint: its rough and out of bounds each into a mesh for every step of the
 * hole's field, so each can be painted its step's colour (`tint.ts` says why it is meshes and not texture or colour in the
 * vertices). Kept apart from the field, which the grass reads and a page that draws nothing may load, since it builds meshes.
 */
import { MeshBuilder, type Mesh } from 'artshape-render/mesh/types';
import { FastMeshBuilder } from './fastmesh';
import { BANK_TINT, stepOf, type Tint } from './tint';

/**
 * A mesh of the ground divided into one mesh for each of the `steps` of a tint's field: each triangle goes whole to the step
 * the field has at its middle (the mean of its corners', which is what the ground is drawn by across it), and a corner shared
 * by the triangles of a step is one vertex of its mesh, as it was in the whole. A step no triangle is in is an empty mesh,
 * which the scene leaves out. Triangles are not cut along the line the field crosses a step at: that was tried, and the
 * ground came out a third as many again, and in vertices seven times as many, for a picture that differs from this one
 * by a few levels at a few in a thousand pixels (a bank's face, where the field moves most), and a frame cost 0.3 ms more.
 */
export function splitByTint(mesh: Mesh, tint: Tint): Mesh[] {
  const { positions: p, normals: nrm, uvs, indices: ix } = mesh;
  const steps = BANK_TINT.steps;
  const nv = p.length / 3,
    nt = ix.length / 3;
  // the field at every corner of the mesh
  const sv = new Float32Array(nv);
  for (let v = 0; v < nv; v++) sv[v] = tint.at(p[v * 3], p[v * 3 + 1]);
  const builders: MeshBuilder[] = Array.from({ length: steps }, () => new FastMeshBuilder());
  // the vertex of each step's mesh a corner of the whole is, made when a triangle first needs it
  const corners = new Array<Int32Array | undefined>(steps).fill(undefined);
  const cornerOf = (k: number, v: number) => {
    const ids = (corners[k] ??= new Int32Array(nv).fill(-1));
    if (ids[v] < 0)
      ids[v] = builders[k].vertex(
        p[v * 3],
        p[v * 3 + 1],
        p[v * 3 + 2],
        nrm[v * 3],
        nrm[v * 3 + 1],
        nrm[v * 3 + 2],
        uvs[v * 2],
        uvs[v * 2 + 1],
      );
    return ids[v];
  };
  for (let t = 0; t < nt; t++) {
    const a = ix[t * 3],
      b = ix[t * 3 + 1],
      c = ix[t * 3 + 2];
    const k = stepOf((sv[a] + sv[b] + sv[c]) / 3);
    builders[k].triangle(cornerOf(k, a), cornerOf(k, b), cornerOf(k, c));
  }
  return builders.map((m) => m.build());
}
