// =============================================================================
// props.js — OPTIONAL add-on: draws the rings in the pool (one or several, each its own colour).
// To remove: delete this file and ../rov_props.py. app.js loads it with a dynamic
// import() that quietly does nothing if the file is missing.
// =============================================================================
export class Props {
  constructor(scene, THREE) {
    this.scene = scene;
    this.THREE = THREE;
    this.items = [];
  }

  update(list, dt) {                       // list = state.props from the sim
    const T = this.THREE, a = 1 - Math.exp(-dt * 20);
    (list || []).forEach((p, i) => {
      let it = this.items[i];
      if (!it) {
        if (p.type !== "ring") return;
        const mat = new T.MeshStandardMaterial({ color: p.color ?? 0xff6a00, roughness: 0.45, emissive: 0x000000 });
        const mesh = new T.Mesh(new T.TorusGeometry(p.r, p.tube, 14, 44), mat);   // ring plane = x/up, like the sim
        mesh.position.set(p.x, -p.depth, -p.y);
        this.scene.add(mesh);
        it = this.items[i] = { mesh, mat };
      }
      it.mesh.position.lerp(new T.Vector3(p.x, -p.depth, -p.y), a);
      it.mesh.rotation.y = p.yaw;
      it.mat.emissive.setHex(p.held || p.hooked ? 0x552200 : 0x000000);   // glows a little when gripped / hooked
    });
  }
}
