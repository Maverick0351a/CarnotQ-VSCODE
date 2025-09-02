
/** Simple 2D Bloch display: circle with x-z projection, y shown as side gauge. */
(function() {
  function drawBloch(canvas, vec) {
    const ctx = canvas.getContext('2d');
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    ctx.clearRect(0,0,w,h);

    // Layout
    const pad = 16;
    const size = Math.min(w - 120, h - pad*2);
    const cx = pad + size/2;
    const cy = pad + size/2;
    const r = size/2;

    // Sphere outline
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0,0,r,0,Math.PI*2);
    ctx.stroke();

    // Axes
    ctx.strokeStyle = '#555';
    // z-axis
    ctx.beginPath(); ctx.moveTo(0,-r); ctx.lineTo(0,r); ctx.stroke();
    // x-axis
    ctx.beginPath(); ctx.moveTo(-r,0); ctx.lineTo(r,0); ctx.stroke();

    // Meridians / Equator
    ctx.setLineDash([4,4]);
    ctx.beginPath(); ctx.ellipse(0,0,r, r*0.5, 0, 0, Math.PI*2); ctx.stroke(); // equator perspective
    ctx.setLineDash([]);

    // Vector (project x,z)
    const vx = clamp(vec.x, -1, 1);
    const vz = clamp(vec.z, -1, 1);
    const px = vx * r;
    const pz = -vz * r;
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(px,pz); ctx.stroke();
    // head
    ctx.fillStyle = '#ddd';
    ctx.beginPath(); ctx.arc(px,pz,4,0,Math.PI*2); ctx.fill();
    ctx.restore();

    // Side gauge for y
    const gx = pad + size + 32;
    const gy = pad;
    const gh = size;
    ctx.strokeStyle = '#666';
    ctx.strokeRect(gx, gy, 16, gh);
    const gyMid = gy + gh/2;
    // zero line
    ctx.beginPath(); ctx.moveTo(gx, gyMid); ctx.lineTo(gx+16, gyMid); ctx.strokeStyle = '#555'; ctx.stroke();
    // fill from mid proportional to y
    ctx.fillStyle = '#ddd';
    const yclamped = clamp(vec.y, -1, 1);
    if (yclamped >= 0) {
      const hpos = (gh/2) * yclamped;
      ctx.fillRect(gx, gyMid - hpos, 16, hpos);
    } else {
      const hneg = (gh/2) * (-yclamped);
      ctx.fillRect(gx, gyMid, 16, hneg);
    }
  }

  function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

  window.CarnotQBloch = { drawBloch };
})();
