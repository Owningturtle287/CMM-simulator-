import { Raycaster, Vector3 } from 'three';

const sun = new Vector3(-0.48, 0.79, 0.4).normalize();
const fill = new Vector3(0.75, 0.45, -0.47).normalize();
const vertex = (x, y, z) => new Vector3(x, y, z);
const shapes = new WeakMap();
const boxFaces = [
  [0, 4, 7, 3], [5, 1, 2, 6], [7, 6, 2, 3],
  [0, 1, 5, 4], [4, 5, 6, 7], [1, 0, 3, 2],
];

function boxShape({ width, height, depth }) {
  const x = width / 2, y = height / 2, z = depth / 2;
  const vertices = [
    vertex(-x,-y,-z), vertex(x,-y,-z), vertex(x,y,-z), vertex(-x,y,-z),
    vertex(-x,-y,z), vertex(x,-y,z), vertex(x,y,z), vertex(-x,y,z),
  ];
  return boxFaces.map(face => face.map(index => vertices[index]));
}

function cylinderShape({ radiusTop, radiusBottom, height, radialSegments }) {
  const sides = Math.min(14, radialSegments);
  const ring = (radius, y) => Array.from({ length: sides }, (_, index) => {
    const angle = index * 2 * Math.PI / sides;
    return vertex(Math.sin(angle) * radius, y, Math.cos(angle) * radius);
  });
  const top = ring(radiusTop, height / 2);
  const bottom = ring(radiusBottom, -height / 2);
  return [
    top, bottom.slice().reverse(),
    ...top.map((v, i) => {
      const j = (i + 1) % sides;
      return [bottom[i], bottom[j], top[j], v];
    }),
  ];
}

function facesFor(mesh) {
  const geometry = mesh.geometry;
  if (!shapes.has(geometry)) {
    const data = geometry.parameters;
    if (geometry.type === 'CylinderGeometry') shapes.set(geometry, cylinderShape(data));
    else if (geometry.type === 'PlaneGeometry') {
      const x = data.width / 2, y = data.height / 2;
      shapes.set(geometry, [[vertex(-x,y,0), vertex(-x,-y,0), vertex(x,-y,0), vertex(x,y,0)]]);
    } else if (data.width && data.height && data.depth) shapes.set(geometry, boxShape(data));
    else shapes.set(geometry, []);
  }
  return shapes.get(geometry);
}

function outline(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (const p of points.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.closePath();
}

function drawDecal(ctx, image, [a, b, , d]) {
  if (!image?.width || !image?.height) return;
  ctx.save();
  ctx.transform((d.x - a.x) / image.width, (d.y - a.y) / image.width,
    (b.x - a.x) / image.height, (b.y - a.y) / image.height, a.x, a.y);
  ctx.drawImage(image, 0, 0);
  ctx.restore();
}

function drawFace(ctx, surface, patterns) {
  const { face, normal, material } = surface;
  const light = Math.max(0, normal.dot(sun));
  const rim = Math.max(0, normal.dot(fill));
  outline(ctx, face);
  if (material.map?.isCanvasTexture) {
    const image = material.map.image;
    if (!patterns.has(image)) {
      const pattern = ctx.createPattern(image, 'repeat');
      pattern?.setTransform(new DOMMatrix().scale(0.29));
      patterns.set(image, pattern);
    }
    const pattern = patterns.get(image);
    if (pattern) {
      ctx.fillStyle = pattern;
      ctx.fill();
    }
    ctx.fillStyle = light > 0.4 ? `rgba(188,210,223,${light * 0.18})` : `rgba(0,9,16,${(0.46 - light) * 0.56})`;
    ctx.fill();
    return;
  }
  const shade = 0.60 + 0.48 * light + 0.16 * rim;
  const color = material.color.clone();
  if (material.metalness > 0.55) {
    const top = Math.min(...face.map(p => p.y));
    const bottom = Math.max(...face.map(p => p.y));
    const gradient = ctx.createLinearGradient(0, top, 0, Math.max(top + 0.1, bottom));
    const tint = factor => color.clone().multiplyScalar(shade * factor).getStyle();
    gradient.addColorStop(0, tint(0.72));
    gradient.addColorStop(0.28, tint(1.37));
    gradient.addColorStop(0.61, tint(0.95));
    gradient.addColorStop(1, tint(0.67));
    ctx.fillStyle = gradient;
  } else ctx.fillStyle = color.multiplyScalar(shade).getStyle();
  ctx.fill();
  ctx.strokeStyle = 'rgba(21,34,48,0.10)';
  ctx.lineWidth = 0.50;
  ctx.stroke();
}

export function createSoftwareView() {
  const domElement = document.createElement('canvas');
  const ctx = domElement.getContext('2d', { alpha: false });
  if (!ctx) throw Error('No canvas graphics context is available.');
  const scale = Math.min(window.devicePixelRatio, 1.5);
  let width = 1, height = 1;
  const direction = new Vector3();
  const raycaster = new Raycaster();
  const patterns = new WeakMap();

  function render(scene, camera) {
    scene.updateMatrixWorld();
    camera.updateMatrixWorld();
    camera.getWorldDirection(direction);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const project = point => {
      const p = point.clone().project(camera);
      return { x: (p.x + 1) * width / 2, y: (1 - p.y) * height / 2, depth: p.z };
    };
    const world = (x, y, z) => project(vertex(x, y, z));
    const background = ctx.createLinearGradient(0, 0, 0, height);
    background.addColorStop(0, '#edf1f5');
    background.addColorStop(1, '#cbd4dc');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);

    ctx.lineWidth = 0.7;
    ctx.strokeStyle = 'rgba(124,146,164,0.25)';
    ctx.beginPath();
    for (let i = -8; i <= 8; i++) {
      const a = world(i / 2, -0.703, -4), b = world(i / 2, -0.703, 4);
      const c = world(-4, -0.703, i / 2), d = world(4, -0.703, i / 2);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
    }
    ctx.stroke();
    for (let i = 11; i > 0; i--) {
      const edge = i * 0.018;
      outline(ctx, [
        world(-0.83 - edge, -0.702, -0.88 - edge), world(0.96 + edge, -0.702, -0.88 - edge),
        world(0.96 + edge, -0.702, 0.94 + edge), world(-0.83 - edge, -0.702, 0.94 + edge),
      ]);
      ctx.fillStyle = 'rgba(35,53,68,0.027)';
      ctx.fill();
    }

    const surfaces = [];
    const solids = [];
    const decals = [];
    scene.traverseVisible(mesh => {
      if (!mesh.isMesh) return;
      const { geometry, material, matrixWorld } = mesh;
      if (geometry.type === 'PlaneGeometry' && !material.transparent) return;
      if (!material.transparent) solids.push(mesh);
      if (geometry.type === 'SphereGeometry') {
        const center = new Vector3().setFromMatrixPosition(matrixWorld);
        const p = project(center);
        const e = project(center.add(vertex(0, geometry.parameters.radius, 0)));
        surfaces.push({ center: p, radius: Math.max(0.8, Math.hypot(p.x - e.x, p.y - e.y)), depth: p.depth });
        return;
      }
      for (const points of facesFor(mesh)) {
        const transformed = points.map(p => p.clone().applyMatrix4(matrixWorld));
        const normal = transformed[1].clone().sub(transformed[0])
          .cross(transformed[2].clone().sub(transformed[0])).normalize();
        if (normal.dot(direction) > -0.00001) continue;
        const face = transformed.map(project);
        if (face.every(p => p.x < 0) || face.every(p => p.x > width) ||
            face.every(p => p.y < 0) || face.every(p => p.y > height)) continue;
        if (material.transparent) {
          decals.push({ face, material, center: new Vector3().setFromMatrixPosition(matrixWorld) });
        } else {
          const depth = face.reduce((sum, p) => sum + p.depth, 0) / face.length;
          surfaces.push({ face, normal, material, depth });
        }
      }
    });
    surfaces.sort((a, b) => b.depth - a.depth);
    for (const surface of surfaces) {
      if (surface.center) {
        const { x, y } = surface.center;
        ctx.beginPath();
        ctx.arc(x, y, surface.radius, 0, 2 * Math.PI);
        ctx.fillStyle = '#ab1440';
        ctx.fill();
      } else drawFace(ctx, surface, patterns);
    }
    for (const { face, material, center } of decals) {
      raycaster.setFromCamera(center.clone().project(camera), camera);
      raycaster.far = raycaster.ray.origin.distanceTo(center) - 0.001;
      if (!raycaster.intersectObjects(solids, false).length) drawDecal(ctx, material.map.image, face);
    }
  }

  return {
    domElement,
    setSize(w, h) {
      width = w;
      height = h;
      domElement.width = Math.round(width * scale);
      domElement.height = Math.round(height * scale);
    },
    render,
  };
}
