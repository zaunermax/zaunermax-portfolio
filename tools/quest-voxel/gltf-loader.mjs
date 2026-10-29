// Shared production decoding for the verifier and render comparison.
import { createRequire } from 'node:module';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

// Resolve the actual transitive dependency used by the installed drei, not an
// independently installed newer decoder that could conceal incompatibility.
const dreiRequire = createRequire(import.meta.resolve('@react-three/drei'));
const stdlib = await import(dreiRequire.resolve('three-stdlib').replace(/index\.cjs$/, 'index.js'));
const dreiDecoder = typeof stdlib.MeshoptDecoder === 'function' ? stdlib.MeshoptDecoder() : stdlib.MeshoptDecoder;

export async function loadBytes(bytes, drei = false) {
  const loader = drei ? new stdlib.GLTFLoader().setMeshoptDecoder(dreiDecoder)
    : new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
}
