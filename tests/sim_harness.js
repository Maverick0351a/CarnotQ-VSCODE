// Simple test harness for CarnotQSim (run via `npm test`)
// Tests: H on |0>, X on |0>, RX(pi) on |0>, H then CNOT on |00>

const path = require('path');
const sim = require(path.join(__dirname, '..', 'media', 'simulator.js'));

function approxEqual(a, b, eps=1e-10) { return Math.abs(a-b) < eps; }
function complexApprox(z, re, im=0, eps=1e-10) { return approxEqual(z.re, re, eps) && approxEqual(z.im, im, eps); }

function snapshot(state) {
  return state.map(z => ({ re: Number(z.re.toFixed(6)), im: Number(z.im.toFixed(6)) }));
}

function testSingle(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
  } catch (e) {
    console.error(`[FAIL] ${name}: ${e.message}`);
    process.exitCode = 1;
  }
}

// 1. H on |0> => (|0>+|1>)/sqrt(2)
// Probabilities 0.5,0.5

testSingle('H on |0>', () => {
  const n=1; const state = sim.initState(n);
  sim.applySingleQubitGate(state, n, 0, sim.H);
  const p = sim.probs(state);
  if (!approxEqual(p[0], 0.5, 1e-9) || !approxEqual(p[1],0.5,1e-9)) throw new Error('Prob mismatch: '+p);
});

// 2. X on |0> => |1>

testSingle('X on |0> -> |1>', () => {
  const n=1; const state = sim.initState(n);
  sim.applySingleQubitGate(state, n, 0, sim.X);
  const p = sim.probs(state);
  if (!approxEqual(p[0],0) || !approxEqual(p[1],1)) throw new Error('Prob mismatch: '+p);
});

// 3. RX(pi) on |0> => -i|1> (global phase -i) so probs still 0,1

testSingle('RX(pi) on |0> -> |1> (phase)', () => {
  const n=1; const state = sim.initState(n);
  const gate = sim.rx(Math.PI);
  sim.applySingleQubitGate(state, n, 0, gate);
  const p = sim.probs(state);
  if (!approxEqual(p[0],0,1e-9) || !approxEqual(p[1],1,1e-9)) throw new Error('Prob mismatch: '+p);
});

// 4. H on q0 then CNOT(q0->q1) starting |00> => Bell (|00>+|11>)/sqrt(2)

function amplitudeIndex(bits) { return parseInt(bits,2); }

testSingle('H->CNOT on |00> -> Bell', () => {
  const n=2; const state = sim.initState(n);
  sim.applySingleQubitGate(state, n, 0, sim.H); // H on qubit 0
  sim.applyCNOT(state, n, 0, 1); // control 0 target 1
  const p = sim.probs(state);
  const idx00 = 0; // 00
  const idx11 = 3; // 11
  if (!approxEqual(p[idx00],0.5,1e-9) || !approxEqual(p[idx11],0.5,1e-9)) throw new Error('Bell probs mismatch: '+p);
  // off states ~0
  if (p[1] > 1e-10 || p[2] > 1e-10) throw new Error('Unexpected population in 01/10');
});

// 5. 3-qubit GHZ: H q0; CNOT 0->1; CNOT 0->2 => (|000>+|111>)/sqrt(2)
testSingle('3-qubit GHZ (H, CNOT0->1, CNOT0->2)', () => {
  const n=3; const state = sim.initState(n);
  sim.applySingleQubitGate(state,n,0,sim.H);
  sim.applyCNOT(state,n,0,1);
  sim.applyCNOT(state,n,0,2);
  const p = sim.probs(state);
  if (!approxEqual(p[0],0.5,1e-9) || !approxEqual(p[7],0.5,1e-9)) throw new Error('GHZ probs mismatch: '+p);
  for (let i=1;i<7;i++){ if (p[i] > 1e-10) throw new Error('Unexpected population at '+i); }
});

// Produce snapshots for user visibility
console.log('\nAmplitude snapshots:');
(function showSnapshots(){
  // a) H |0>
  let s = sim.initState(1); sim.applySingleQubitGate(s,1,0,sim.H); console.log('H|0> amplitudes:', snapshot(s), 'probs:', sim.probs(s).map(x=>+x.toFixed(6)));
  // b) X |0>
  s = sim.initState(1); sim.applySingleQubitGate(s,1,0,sim.X); console.log('X|0> amplitudes:', snapshot(s), 'probs:', sim.probs(s).map(x=>+x.toFixed(6)));
  // c) RX(pi)|0>
  s = sim.initState(1); sim.applySingleQubitGate(s,1,0,sim.rx(Math.PI)); console.log('RX(pi)|0> amplitudes:', snapshot(s), 'probs:', sim.probs(s).map(x=>+x.toFixed(6)));
  // d) Bell
  s = sim.initState(2); sim.applySingleQubitGate(s,2,0,sim.H); sim.applyCNOT(s,2,0,1); console.log('Bell (H->CNOT)|00> amplitudes:', snapshot(s), 'probs:', sim.probs(s).map(x=>+x.toFixed(6)));
  // e) GHZ
  s = sim.initState(3); sim.applySingleQubitGate(s,3,0,sim.H); sim.applyCNOT(s,3,0,1); sim.applyCNOT(s,3,0,2); console.log('GHZ (3q) amplitudes (first 8):', snapshot(s).slice(0,8), 'probs:', sim.probs(s).map(x=>+x.toFixed(6)));
})();

if (process.exitCode === 1) {
  console.error('\nSome tests failed.');
} else {
  console.log('\nAll simulator tests passed.');
}
