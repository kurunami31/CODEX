import { useRef, useEffect, useCallback } from 'react';

export default function Background3D({ className = '', style = {} }) {
  const canvasRef = useRef(null);
  const mouse = useRef({ x: 0.5, y: 0.5 });
  const raf = useRef(null);

  const handleMouseMove = useCallback((e) => {
    mouse.current.x = e.clientX / window.innerWidth;
    mouse.current.y = e.clientY / window.innerHeight;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let w, h;

    function resize() {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', handleMouseMove);

    const accent = [14, 208, 182];
    const accent2 = [10, 176, 155];

    // --- Floating shapes ---
    const shapes = Array.from({ length: 18 }, () => ({
      x: Math.random(),
      y: Math.random(),
      z: Math.random() * 0.6 + 0.2,
      size: Math.random() * 18 + 8,
      rotX: Math.random() * Math.PI * 2,
      rotY: Math.random() * Math.PI * 2,
      rotSpeedX: (Math.random() - 0.5) * 0.008,
      rotSpeedY: (Math.random() - 0.5) * 0.012,
      type: Math.random() > 0.5 ? 'cube' : 'octa',
      opacity: Math.random() * 0.25 + 0.08,
    }));

    // --- Particles ---
    const particles = Array.from({ length: 50 }, () => ({
      x: Math.random(),
      y: Math.random(),
      z: Math.random() * 0.5 + 0.1,
      r: Math.random() * 1.5 + 0.4,
      drift: (Math.random() - 0.5) * 0.0003,
      phase: Math.random() * Math.PI * 2,
    }));

    function project(x, y, z) {
      const mx = (mouse.current.x - 0.5) * 40 * z;
      const my = (mouse.current.y - 0.5) * 20 * z;
      const scale = 0.5 + z * 0.5;
      return {
        px: x * w + mx,
        py: y * h + my,
        scale,
        depth: z,
      };
    }

    function drawCube(cx, cy, size, rotX, rotY, alpha) {
      const s = size * 0.5;
      const verts = [
        [-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],
        [-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1],
      ];
      const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
      const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
      const projected = verts.map(([vx, vy, vz]) => {
        let y1 = vy * cosX - vz * sinX;
        let z1 = vy * sinX + vz * cosX;
        let x1 = vx * cosY + z1 * sinY;
        let z2 = -vx * sinY + z1 * cosY;
        return [cx + x1 * s, cy + y1 * s, z2];
      });
      const edges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
      ctx.strokeStyle = `rgba(${accent[0]},${accent[1]},${accent[2]},${alpha})`;
      ctx.lineWidth = 1;
      edges.forEach(([a, b]) => {
        ctx.beginPath();
        ctx.moveTo(projected[a][0], projected[a][1]);
        ctx.lineTo(projected[b][0], projected[b][1]);
        ctx.stroke();
      });
    }

    function drawOcta(cx, cy, size, rotX, rotY, alpha) {
      const s = size * 0.55;
      const verts = [[0,-1,0],[1,0,0],[0,0,1],[-1,0,0],[0,0,-1],[0,1,0]];
      const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
      const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
      const projected = verts.map(([vx, vy, vz]) => {
        let y1 = vy * cosX - vz * sinX;
        let z1 = vy * sinX + vz * cosX;
        let x1 = vx * cosY + z1 * sinY;
        return [cx + x1 * s, cy + y1 * s];
      });
      const edges = [[0,1],[0,2],[0,3],[0,4],[5,1],[5,2],[5,3],[5,4],[1,2],[2,3],[3,4],[4,1]];
      ctx.strokeStyle = `rgba(${accent2[0]},${accent2[1]},${accent2[2]},${alpha})`;
      ctx.lineWidth = 0.8;
      edges.forEach(([a, b]) => {
        ctx.beginPath();
        ctx.moveTo(projected[a][0], projected[a][1]);
        ctx.lineTo(projected[b][0], projected[b][1]);
        ctx.stroke();
      });
    }

    function drawGrid(t) {
      const horizonY = h * 0.38;
      const gridLines = 14;
      const vanishX = w * 0.5 + (mouse.current.x - 0.5) * 30;
      ctx.strokeStyle = `rgba(${accent[0]},${accent[1]},${accent[2]},0.06)`;
      ctx.lineWidth = 1;
      for (let i = 0; i <= gridLines; i++) {
        const frac = i / gridLines;
        const y = horizonY + (h - horizonY) * Math.pow(frac, 1.6);
        const spread = 0.15 + frac * 0.85;
        const lx = vanishX - w * 0.6 * spread;
        const rx = vanishX + w * 0.6 * spread;
        ctx.beginPath();
        ctx.moveTo(lx, y);
        ctx.lineTo(rx, y);
        ctx.stroke();
      }
      const vertLines = 16;
      for (let i = 0; i <= vertLines; i++) {
        const frac = i / vertLines;
        const topX = vanishX + (frac - 0.5) * 20;
        const botX = vanishX + (frac - 0.5) * w * 1.1;
        ctx.beginPath();
        ctx.moveTo(topX, horizonY);
        ctx.lineTo(botX, h);
        ctx.stroke();
      }
    }

    let time = 0;

    function frame() {
      time += 1;
      ctx.clearRect(0, 0, w, h);

      // Grid floor
      drawGrid(time);

      // Shapes sorted by depth (back to front)
      const sorted = [...shapes].sort((a, b) => a.z - b.z);
      sorted.forEach((s) => {
        s.rotX += s.rotSpeedX;
        s.rotY += s.rotSpeedY;
        const p = project(s.x, s.y, s.z);
        const sz = s.size * p.scale;
        const alpha = s.opacity * (0.5 + s.z * 0.5);
        if (s.type === 'cube') {
          drawCube(p.px, p.py, sz, s.rotX, s.rotY, alpha);
        } else {
          drawOcta(p.px, p.py, sz, s.rotX, s.rotY, alpha);
        }
      });

      // Particles
      particles.forEach((p) => {
        p.y += Math.sin(time * 0.01 + p.phase) * 0.00015;
        p.x += p.drift;
        if (p.x < -0.05) p.x = 1.05;
        if (p.x > 1.05) p.x = -0.05;
        const proj = project(p.x, p.y, p.z);
        const r = p.r * proj.scale;
        const alpha = 0.15 + p.z * 0.2;
        ctx.fillStyle = `rgba(${accent[0]},${accent[1]},${accent[2]},${alpha})`;
        ctx.beginPath();
        ctx.arc(proj.px, proj.py, r, 0, Math.PI * 2);
        ctx.fill();
      });

      // Subtle connecting lines between nearby shapes
      ctx.lineWidth = 0.4;
      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          const a = sorted[i], b = sorted[j];
          const pa = project(a.x, a.y, a.z);
          const pb = project(b.x, b.y, b.z);
          const dx = pa.px - pb.px;
          const dy = pa.py - pb.py;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 160) {
            const alpha = (1 - dist / 160) * 0.06 * Math.min(a.z, b.z);
            ctx.strokeStyle = `rgba(${accent[0]},${accent[1]},${accent[2]},${alpha})`;
            ctx.beginPath();
            ctx.moveTo(pa.px, pa.py);
            ctx.lineTo(pb.px, pb.py);
            ctx.stroke();
          }
        }
      }

      raf.current = requestAnimationFrame(frame);
    }

    raf.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [handleMouseMove]);

  return (
    <canvas
      ref={canvasRef}
      className={`bg-3d ${className}`}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
        ...style,
      }}
    />
  );
}
