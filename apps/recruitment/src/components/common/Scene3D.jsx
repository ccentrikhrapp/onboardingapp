import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/* A small branded 3D piece — a smooth coral core with an orbiting blue
   ring, the app's own two accent colors, not a generic gem. Used wherever
   an empty state or landing moment would otherwise be just an icon.
   One lightweight scene, capped pixel ratio, disposed on unmount. */
export default function Scene3D({ size = 140 }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return undefined;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 10);
    camera.position.set(0, 0.3, 4.2);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(size, size);
    el.appendChild(renderer.domElement);

    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1, 2),
      new THREE.MeshStandardMaterial({ color: 0xe8603c, roughness: 0.4, metalness: 0.1 })
    );
    scene.add(core);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.7, 0.1, 16, 100),
      new THREE.MeshStandardMaterial({ color: 0x4267c7, roughness: 0.3, metalness: 0.2 })
    );
    ring.rotation.x = Math.PI / 2.4;
    ring.rotation.y = Math.PI / 8;
    scene.add(ring);

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(3, 3, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffd9c7, 0.6);
    rim.position.set(-3, -1, -2);
    scene.add(rim);

    let frame; let t = 0;
    const animate = () => {
      t += 0.012;
      core.rotation.y += 0.006;
      core.rotation.x += 0.003;
      core.position.y = Math.sin(t) * 0.08;
      ring.rotation.z += 0.004;
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      core.geometry.dispose(); core.material.dispose();
      ring.geometry.dispose(); ring.material.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [size]);

  return <div className="ta-scene3d" ref={mountRef} style={{ width: size, height: size }} aria-hidden="true" />;
}
