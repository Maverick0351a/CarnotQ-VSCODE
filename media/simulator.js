
/** Minimal quantum simulator for 1–2 qubits.
 * Now supports both browser (window.CarnotQSim) and Node (module.exports).
 */
(function() {
  const root = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : global);
  const C = {
    add: (a,b)=>({re:a.re+b.re, im:a.im+b.im}),
    sub: (a,b)=>({re:a.re-b.re, im:a.im-b.im}),
    mul: (a,b)=>({re:a.re*b.re - a.im*b.im, im:a.re*b.im + a.im*b.re}),
    scale: (a,s)=>({re:a.re*s, im:a.im*s}),
    conj: (a)=>({re:a.re, im:-a.im}),
    mag2: (a)=>a.re*a.re + a.im*a.im,
    zero: ()=>({re:0, im:0}),
    from: (re,im=0)=>({re,im})
  };

  function initState(n) {
    const dim = 1<<n;
    const s = Array(dim).fill(C.zero());
    s[0] = C.from(1,0); // |0..0>
    return s;
  }

  function cloneState(state) { return state.map(z => ({re:z.re, im:z.im})); }

  function applySingleQubitGate(state, n, target, mat) {
    // mat is 2x2 complex matrix: [[a,b],[c,d]]
    const dim = 1<<n;
    const stride = 1<<target;
  const a = mat[0][0], b = mat[0][1], c = mat[1][0], d = mat[1][1];
    for (let base=0; base<dim; base+= (stride<<1)) {
      for (let i=0; i<stride; i++) {
        const i0 = base + i;
        const i1 = i0 + stride;
        const v0 = state[i0];
        const v1 = state[i1];
        state[i0] = C.add( C.mul(a, v0), C.mul(b, v1) );
        state[i1] = C.add( C.mul(c, v0), C.mul(d, v1) );
      }
    }
  }

  function applyCNOT(state, n, control, target) {
    if (control === target) return;
    const dim = 1<<n;
    const cMask = 1<<control;
    const tMask = 1<<target;
    for (let i=0; i<dim; i++) {
      if ((i & cMask) !== 0 && (i & tMask) === 0) {
        const j = i | tMask;
        // swap amplitudes of i and j
        const tmp = state[i];
        state[i] = state[j];
        state[j] = tmp;
      }
    }
  }

  function normalize(state) {
    const s = state.reduce((acc,z)=>acc + C.mag2(z), 0);
    const norm = Math.sqrt(s);
    if (norm === 0) return 0;
    for (let i=0; i<state.length; i++) {
      state[i].re /= norm; state[i].im /= norm;
    }
    return norm;
  }

  function probs(state) {
    return state.map(C.mag2);
  }

  function rx(theta) {
    const c = Math.cos(theta/2), s = Math.sin(theta/2);
    return [[C.from(c,0), C.from(0,-s)], [C.from(0,-s), C.from(c,0)]];
  }
  function rz(theta) {
    const p = -theta/2;
    return [[C.from(Math.cos(p), Math.sin(p)), C.from(0,0)], [C.from(0,0), C.from(Math.cos(-p), Math.sin(-p))]];
  }

  const H = [[C.from(1/Math.SQRT2,0), C.from(1/Math.SQRT2,0)],[C.from(1/Math.SQRT2,0), C.from(-1/Math.SQRT2,0)]];
  const X = [[C.from(0,0), C.from(1,0)],[C.from(1,0), C.from(0,0)]];
  const Z = [[C.from(1,0), C.from(0,0)],[C.from(0,0), C.from(-1,0)]];

  function sample(state) {
    const p = probs(state);
    const r = Math.random();
    let acc = 0, idx = 0;
    for (let i=0;i<p.length;i++){ acc += p[i]; if (r<=acc){ idx=i; break; } }
    // collapse
    for (let i=0;i<state.length;i++){ state[i] = {re:0, im:0}; }
    state[idx] = {re:1, im:0};
    return idx;
  }

  /** Reduced density matrix for a single target qubit (0..n-1) */
  function reducedDensityMatrix(state, n, target) {
    const dim = 1<<n;
    const mask = 1<<target;

    let rho00 = C.zero(), rho11 = C.zero(), rho01 = C.zero();
    for (let k=0; k<dim; k++) {
      if ((k & mask) === 0) {
        const k1 = k | mask;
        const a = state[k];
        const b = state[k1];
        const aa = C.mag2(a);
        const bb = C.mag2(b);
        rho00 = C.add(rho00, C.from(aa,0));
        rho11 = C.add(rho11, C.from(bb,0));
        // off-diagonal
        const abstar = C.mul(a, C.conj(b));
        rho01 = C.add(rho01, abstar);
      }
    }
    const rho10 = C.conj(rho01);
    return [[rho00, rho01],[rho10, rho11]];
  }

  function blochVector(state, n, target) {
    const rho = reducedDensityMatrix(state, n, target);
    const rho00 = rho[0][0].re;
    const rho11 = rho[1][1].re;
    const rho01 = rho[0][1];
    const x = 2 * rho01.re;
    const y = 2 * rho01.im;
    const z = rho00 - rho11;
    const mag = Math.sqrt(x*x + y*y + z*z);
    return {x,y,z,mag};
  }

  // QASM (minimal subset)
  function toQasm(gates, qubits) {
    const lines = [`OPENQASM 2.0;`, `qreg q[${qubits}];`];
    for (const g of gates) {
      switch (g.type) {
        case 'H': lines.push(`h q[${g.target}];`); break;
        case 'X': lines.push(`x q[${g.target}];`); break;
        case 'Z': lines.push(`z q[${g.target}];`); break;
        case 'RX': lines.push(`rx(${g.theta.toFixed(6)}) q[${g.target}];`); break;
        case 'RZ': lines.push(`rz(${g.theta.toFixed(6)}) q[${g.target}];`); break;
        case 'CNOT': lines.push(`cx q[${g.control}],q[${g.target}];`); break;
        case 'MEASURE': lines.push(`// measure (simulated in-app)`); break;
      }
    }
    return lines.join('\n');
  }

  const api = {
    C, initState, cloneState, applySingleQubitGate, applyCNOT, normalize, probs,
    rx, rz, H, X, Z, sample, blochVector, toQasm
  };
  // Attach to global (browser) and export for Node/CommonJS
  root.CarnotQSim = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
