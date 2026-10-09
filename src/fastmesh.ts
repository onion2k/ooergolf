/**
 * A mesh builder that writes into typed arrays it grows by doubling, for the passes over a whole hole's ground and water,
 * which lay hundreds of thousands of vertices: the package's own builder pushes each number on to a list of doubles and
 * copies the lists into typed arrays at the end, which on a long golf hole was a good part of the time it took to begin.
 * It builds the very bytes the package's does (a float is rounded to the same float whenever it is written), and is a
 * `MeshBuilder` to anything that is handed one.
 */
import { MeshBuilder, type Mesh } from 'artshape-render/mesh/types';

export class FastMeshBuilder extends MeshBuilder {
  private p = new Float32Array(768);
  private n = new Float32Array(768);
  private t = new Float32Array(512);
  private ix = new Uint32Array(768);
  private nv = 0;
  private ni = 0;

  override get vertexCount() {
    return this.nv;
  }
  override get triangleCount() {
    return this.ni / 3;
  }

  override vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number) {
    const at = this.nv++;
    if (at * 3 + 3 > this.p.length) {
      this.p = grown(this.p);
      this.n = grown(this.n);
      this.t = grown(this.t);
    }
    const a = at * 3,
      b = at * 2;
    this.p[a] = x;
    this.p[a + 1] = y;
    this.p[a + 2] = z;
    this.n[a] = nx;
    this.n[a + 1] = ny;
    this.n[a + 2] = nz;
    this.t[b] = u;
    this.t[b + 1] = v;
    return at;
  }

  override triangle(a: number, b: number, c: number) {
    if (this.ni + 3 > this.ix.length) this.ix = grown(this.ix);
    this.ix[this.ni++] = a;
    this.ix[this.ni++] = b;
    this.ix[this.ni++] = c;
  }

  override quad(a: number, b: number, c: number, d: number) {
    if (this.ni + 6 > this.ix.length) this.ix = grown(this.ix);
    const ix = this.ix;
    let k = this.ni;
    ix[k++] = a;
    ix[k++] = b;
    ix[k++] = c;
    ix[k++] = a;
    ix[k++] = c;
    ix[k++] = d;
    this.ni = k;
  }

  override build(): Mesh {
    return {
      positions: this.p.slice(0, this.nv * 3),
      normals: this.n.slice(0, this.nv * 3),
      uvs: this.t.slice(0, this.nv * 2),
      indices: this.ix.slice(0, this.ni),
    };
  }
}

/** A typed array twice as long, with what the first held. */
function grown<T extends Float32Array | Uint32Array>(a: T): T {
  const bigger = new (a.constructor as new (n: number) => T)(a.length * 2);
  bigger.set(a);
  return bigger;
}
