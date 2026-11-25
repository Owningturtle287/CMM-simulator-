import { Color, Matrix4, Raycaster, Vector3 } from 'three';

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
    if (geometry.userData.canvasFaces) shapes.set(geometry, geometry.userData.canvasFaces);
    else if (geometry.type === 'CylinderGeometry') shapes.set(geometry, cylinderShape(data));
    else if (geometry.type === 'PlaneGeometry') {
      const x = data.width / 2, y = data.height / 2;
      shapes.set(geometry, [[vertex(-x,y,0), vertex(-x,-y,0), vertex(x,-y,0), vertex(x,y,0)]]);
    } else if (data?.width && data.height && data.depth) shapes.set(geometry, boxShape(data));
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
  const projected = new WeakMap();
  const viewProjection = new Matrix4();
  const previousView = new Matrix4();
  const backdrop = document.createElement('canvas');
  const backgroundContext = backdrop.getContext('2d', { alpha: false });
  let cameraRevision = 0;
  let resetView = true;

  function sceneBackground(project) {
    const ctx = backgroundContext;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
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
        world(-0.86 - edge, -0.702, -0.98 - edge), world(0.95 + edge, -0.702, -0.98 - edge),
        world(0.95 + edge, -0.702, 0.95 + edge), world(-0.86 - edge, -0.702, 0.95 + edge),
      ]);
      ctx.fillStyle = 'rgba(35,53,68,0.027)';
      ctx.fill();
    }
  }

  function render(scene, camera) {
    scene.updateMatrixWorld();
    camera.updateMatrixWorld();
    viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const project = point => {
      const p = point.clone().applyMatrix4(viewProjection);
      return { x: (p.x + 1) * width / 2, y: (1 - p.y) * height / 2, depth: p.z };
    };
    if (resetView || !previousView.equals(viewProjection)) {
      previousView.copy(viewProjection);
      camera.getWorldDirection(direction);
      sceneBackground(project);
      cameraRevision++;
      resetView = false;
    }
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.drawImage(backdrop, 0, 0, width, height);

    const surfaces = [];
    const solids = [];
    const decals = [];
    scene.traverseVisible(mesh => {
      if (!mesh.isMesh) return;
      const { geometry, material, matrixWorld } = mesh;
      if (geometry.type === 'PlaneGeometry' && !material.transparent) return;
      let entry = projected.get(mesh);
      if (!entry || entry.revision !== cameraRevision || !entry.matrix.equals(matrixWorld)) {
        entry = { revision: cameraRevision, matrix: matrixWorld.clone(), faces: [] };
        projected.set(mesh, entry);
        if (geometry.type === 'SphereGeometry') {
          const center = new Vector3().setFromMatrixPosition(matrixWorld);
          const p = project(center);
          const e = project(center.add(vertex(0, geometry.parameters.radius, 0)));
          const radius = Math.max(0.8, Math.hypot(p.x - e.x, p.y - e.y));
          const paint = ctx.createRadialGradient(p.x - radius * 0.28, p.y - radius * 0.32,
            radius * 0.12, p.x, p.y, radius);
          paint.addColorStop(0, material.color.clone().lerp(new Color(0xffffff), 0.26).getStyle());
          paint.addColorStop(1, material.color.clone().multiplyScalar(0.42).getStyle());
          entry.faces.push({ center: p, radius, depth: p.depth, paint });
        } else {
          const bounds = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
          for (const points of facesFor(mesh)) {
            const transformed = points.map(p => p.clone().applyMatrix4(matrixWorld));
            const normal = transformed[1].clone().sub(transformed[0])
              .cross(transformed[2].clone().sub(transformed[0])).normalize();
            if (normal.dot(direction) > -0.00001) continue;
            const face = transformed.map(project);
            if (face.every(p => p.x < 0) || face.every(p => p.x > width) ||
                face.every(p => p.y < 0) || face.every(p => p.y > height)) continue;
            if (material.transparent) {
              const center = new Vector3().setFromMatrixPosition(matrixWorld);
              entry.faces.push({ face, material, center, screen: project(center) });
              continue;
            }
            for (const p of face) {
              bounds.left = Math.min(bounds.left, p.x);
              bounds.right = Math.max(bounds.right, p.x);
              bounds.top = Math.min(bounds.top, p.y);
              bounds.bottom = Math.max(bounds.bottom, p.y);
            }
            const depth = face.reduce((sum, p) => sum + p.depth, 0) / face.length;
            entry.faces.push({ face, normal, material, depth });
          }
          if (!material.transparent && entry.faces.length) entry.solid = { mesh, bounds };
        }
      }
      if (entry.solid) solids.push(entry.solid);
      if (material.transparent) decals.push(...entry.faces);
      else surfaces.push(...entry.faces);
    });
    surfaces.sort((a, b) => b.depth - a.depth);
    for (const surface of surfaces) {
      if (surface.center) {
        const { x, y } = surface.center;
        ctx.beginPath();
        ctx.arc(x, y, surface.radius, 0, 2 * Math.PI);
        ctx.fillStyle = surface.paint;
        ctx.fill();
      } else drawFace(ctx, surface, patterns);
    }
    for (const { face, material, center, screen } of decals) {
      raycaster.setFromCamera(center.clone().applyMatrix4(viewProjection), camera);
      raycaster.far = raycaster.ray.origin.distanceTo(center) - 0.001;
      const candidates = solids.filter(({ bounds }) =>
        screen.x >= bounds.left && screen.x <= bounds.right && screen.y >= bounds.top && screen.y <= bounds.bottom);
      if (!raycaster.intersectObjects(candidates.map(({ mesh }) => mesh), false).length) {
        drawDecal(ctx, material.map.image, face);
      }
    }
  }

  return {
    domElement,
    setSize(w, h) {
      width = w;
      height = h;
      domElement.width = Math.round(width * scale);
      domElement.height = Math.round(height * scale);
      backdrop.width = domElement.width;
      backdrop.height = domElement.height;
      resetView = true;
    },
    render,
  };
}
