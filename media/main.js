
(function(){
  const vscode = acquireVsCodeApi();

  // Theme detection: derive light/dark based on computed editor background luminance
  (function applyThemeClass(){
    try {
      const bg = getComputedStyle(document.body).getPropertyValue('--vscode-editor-background').trim() || getComputedStyle(document.body).backgroundColor;
      const hexMatch = bg.match(/^#([0-9a-fA-F]{6})$/);
      let r,g,b;
      if (hexMatch) {
        const h = hexMatch[1]; r = parseInt(h.slice(0,2),16); g = parseInt(h.slice(2,4),16); b = parseInt(h.slice(4,6),16);
      } else {
        const rgbMatch = bg.match(/rgb[a]?\(([^)]+)\)/);
        if (rgbMatch) { [r,g,b] = rgbMatch[1].split(',').map(x=>parseFloat(x)); }
      }
      if (r!=null) {
        const lum = (0.2126*(r/255)**2.2 + 0.7152*(g/255)**2.2 + 0.0722*(b/255)**2.2);
        if (lum > 0.35) document.body.classList.add('light'); else document.body.classList.remove('light');
      }
    } catch {}
  })();

  const $ = (id)=>document.getElementById(id);

  let qubits = 1;
  let gates = [];
  let state = CarnotQSim.initState(qubits);
  runSim();

  // UI bindings
  $('qubits').addEventListener('change', (e)=>{
    qubits = Math.max(1, Math.min(4, parseInt(e.target.value,10)));
    // adjust target dropdown options
    const t = $('targetQubit');
    t.innerHTML = '';
    for (let i=0;i<qubits;i++){ const opt=document.createElement('option'); opt.value=String(i); opt.textContent=String(i); t.appendChild(opt); }
    resetState();
  });

  $('btnH').addEventListener('click', ()=> addGate({type:'H', target: currentTarget()}));
  $('btnX').addEventListener('click', ()=> addGate({type:'X', target: currentTarget()}));
  $('btnZ').addEventListener('click', ()=> addGate({type:'Z', target: currentTarget()}));
  $('btnRX').addEventListener('click', ()=> {
    const theta = parseFloat($('rxTheta').value||'0');
    addGate({type:'RX', target: currentTarget(), theta});
  });
  $('btnRZ').addEventListener('click', ()=> {
    const theta = parseFloat($('rzTheta').value||'0');
    addGate({type:'RZ', target: currentTarget(), theta});
  });
  $('btnCNOT').addEventListener('click', ()=> {
    if (qubits<2){ alert('Need at least 2 qubits for CNOT.'); return; }
    const ctrl = 0;
    const tgt = qubits > 1 ? 1 : 0;
    addGate({type:'CNOT', control: ctrl, target: tgt});
  });
  $('btnMeasure').addEventListener('click', ()=> addGate({type:'MEASURE'}));

  $('btnRun').addEventListener('click', runSim);
  $('btnClear').addEventListener('click', ()=>{ gates=[]; renderGates(); runSim(); });
  $('btnReset').addEventListener('click', ()=>{ resetState(); runSim(); });
  $('btnSample').addEventListener('click', ()=>{ CarnotQSim.sample(state); render(); });

  $('btnExplain').addEventListener('click', ()=>{
    const probs = CarnotQSim.probs(state);
    const qasm = CarnotQSim.toQasm(gates, qubits);
  const style = currentExplainStyle();
    vscode.postMessage({
      type:'explain',
      payload: {
    gates, qubits, state, probs, qasm, style
      }
    });
  });

  $('btnCopyQasm').addEventListener('click', ()=>{
    const qasm = CarnotQSim.toQasm(gates, qubits);
    vscode.postMessage({ type:'copyQasm', payload:{ qasm } });
  });

  $('btnCopyProbs').addEventListener('click', ()=>{
    const p = CarnotQSim.probs(state).map(x=>Number(x.toFixed(6)));
    vscode.postMessage({ type:'copyText', payload:{ label:'Probabilities', text: JSON.stringify(p) } });
  });

  $('btnCopyAmps').addEventListener('click', ()=>{
    const amps = state.map((a,i)=>({ idx:i, re:Number(a.re.toFixed(6)), im:Number(a.im.toFixed(6)) }));
    vscode.postMessage({ type:'copyText', payload:{ label:'Amplitudes', text: JSON.stringify(amps) } });
  });

  // Template menu
  const templateSelect = $('templateSelect');
  if (templateSelect) {
    templateSelect.addEventListener('change', ()=>{
      const val = templateSelect.value;
      if (!val) return;
      if (val === 'empty') {
        qubits = Math.max(1, Math.min(qubits,4));
        $('qubits').value = String(qubits);
        gates = [];
      } else if (val === 'bell') {
        qubits = 2; $('qubits').value = '2';
        gates = [ {type:'H', target:0}, {type:'CNOT', control:0, target:1} ];
      } else if (val === 'rxdemo') {
        qubits = 1; $('qubits').value = '1';
        gates = [ {type:'RX', target:0, theta: Math.PI/2}, {type:'RX', target:0, theta: Math.PI/2}, {type:'RX', target:0, theta: Math.PI/2}, {type:'RX', target:0, theta: Math.PI/2} ];
      }
      // refresh target options
      const tsel = $('targetQubit'); tsel.innerHTML='';
      for (let i=0;i<qubits;i++){ const o=document.createElement('option'); o.value=String(i); o.textContent=String(i); tsel.appendChild(o); }
      templateSelect.value='';
      renderGates(); runSim(); toast('Template loaded');
    });
  }

  $('btnSave').addEventListener('click', ()=>{
  const data = { version:1, qubits, gates };
    vscode.postMessage({ type:'saveCircuit', payload:{ data } });
  });

  $('btnLoad').addEventListener('click', ()=>{
    vscode.postMessage({ type:'loadCircuit' });
  });

  window.addEventListener('message', (event)=>{
    const msg = event.data;
    if (msg.type === 'explainResult') {
      setExplain(msg.text);
    } else if (msg.type === 'copyQasmResult') {
      if (msg.ok) toast('QASM copied to clipboard');
      else toast('Copy failed: ' + (msg.error||'unknown'));
    } else if (msg.type === 'copyTextResult') {
      if (msg.ok) toast((msg.label||'Data')+' copied');
      else toast('Copy failed: ' + (msg.error||'unknown'));
    } else if (msg.type === 'saveCircuitResult') {
      if (msg.ok) toast('Circuit saved'); else toast('Save failed: ' + (msg.error||'unknown'));
    } else if (msg.type === 'loadCircuitResult') {
      if (msg.ok && msg.data) {
        const parsed = validateCircuit(msg.data);
        if (!parsed.ok) { toast('Invalid circuit: '+parsed.error); return; }
        qubits = parsed.qubits;
        $('qubits').value = String(qubits);
        // refresh target options
        const tsel = $('targetQubit'); tsel.innerHTML = '';
        for (let i=0;i<qubits;i++){ const o=document.createElement('option'); o.value=String(i); o.textContent=String(i); tsel.appendChild(o); }
        gates = parsed.gates;
        renderGates(); runSim();
        toast('Circuit loaded');
      } else {
        toast('Load cancelled or failed');
      }
    }
  });

  // Keyboard shortcuts
  window.addEventListener('keydown', (e)=>{
    const tag = (e.target && (e.target.tagName||'')).toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    if (e.ctrlKey && e.key === 'Backspace') { gates=[]; renderGates(); runSim(); e.preventDefault(); return; }
    switch (e.key.toLowerCase()) {
      case 'h': addGate({type:'H', target: currentTarget()}); e.preventDefault(); break;
      case 'x': addGate({type:'X', target: currentTarget()}); e.preventDefault(); break;
      case 'z': addGate({type:'Z', target: currentTarget()}); e.preventDefault(); break;
      case 'r': addGate({type:'RX', target: currentTarget(), theta: parseFloat($('rxTheta').value||'0')}); e.preventDefault(); break;
      case 'm': addGate({type:'MEASURE'}); e.preventDefault(); break;
    }
  });

  function addGate(g){ gates.push(g); renderGates(); runSim(); }

  function runSim(){
    state = CarnotQSim.initState(qubits);
    for (const g of gates) {
      switch (g.type) {
        case 'H': CarnotQSim.applySingleQubitGate(state, qubits, g.target, CarnotQSim.H); break;
        case 'X': CarnotQSim.applySingleQubitGate(state, qubits, g.target, CarnotQSim.X); break;
        case 'Z': CarnotQSim.applySingleQubitGate(state, qubits, g.target, CarnotQSim.Z); break;
        case 'RX': CarnotQSim.applySingleQubitGate(state, qubits, g.target, CarnotQSim.rx(g.theta)); break;
        case 'RZ': CarnotQSim.applySingleQubitGate(state, qubits, g.target, CarnotQSim.rz(g.theta)); break;
        case 'CNOT': CarnotQSim.applyCNOT(state, qubits, g.control, g.target); break;
        case 'MEASURE': /* no-op here; use Sample to collapse */ break;
      }
    }
    CarnotQSim.normalize(state);
    render();
  }

  function resetState(){
    state = CarnotQSim.initState(qubits);
    render();
  }

  function render(){
    renderProbabilities();
    renderBloch();
    renderStatus();
    renderLessons();
  }

  function renderGates(){
    const el = $('gateList');
    el.innerHTML = '';
    const timeline = $('gateTimeline');
    if (timeline) {
      timeline.innerHTML = '';
      // build lane containers per qubit plus a measurement lane
      const laneCount = qubits; // measurement gates will appear on all lanes shaded
      for (let q=0;q<laneCount;q++){
        const lane = document.createElement('div'); lane.className='timeline-lane'; lane.dataset.qubit=String(q);
        const label = document.createElement('div'); label.className='lane-label'; label.textContent = 'q'+q;
        lane.appendChild(label);
        timeline.appendChild(lane);
      }
    }
    gates.forEach((g, idx)=>{
      const row = document.createElement('div'); row.className = 'row';
      const label = (()=>{
        switch (g.type) {
          case 'H':
          case 'X':
          case 'Z':
            return `${g.type} q${g.target}`;
          case 'RX':
          case 'RZ':
            return `${g.type}(${g.theta.toFixed(2)}) q${g.target}`;
          case 'CNOT':
            return `CNOT q${g.control}→q${g.target}`;
          case 'MEASURE':
            return `Measure (report only)`;
        }
      })();
      const a = document.createElement('div'); a.textContent = label;
      const b = document.createElement('div');
      const del = document.createElement('button');
      del.textContent = '×'; del.title = 'Remove';
      del.onclick = ()=>{ gates.splice(idx,1); renderGates(); runSim(); };
      b.appendChild(del);
      row.appendChild(a); row.appendChild(b);
      el.appendChild(row);

      // timeline badge
      if (timeline) {
        // determine lanes for this gate
        const laneTargets = [];
        if (g.type === 'CNOT') laneTargets.push(g.control, g.target); else if (g.type === 'MEASURE') laneTargets.push(0); else laneTargets.push(g.target);
        const mainLaneIndex = laneTargets[0];
        const laneEls = [...timeline.querySelectorAll('.timeline-lane')];
        const badge = document.createElement('div');
        badge.className = 'gate-badge';
        badge.dataset.type = g.type; badge.dataset.index = String(idx);
        let short = g.type;
        if (g.type === 'RX' || g.type === 'RZ') short += `(${g.theta.toFixed(2)})`;
        if (g.type === 'CNOT') short = 'CNOT';
        if (g.type === 'MEASURE') short = 'M';
        badge.textContent = short;
        const rm = document.createElement('span'); rm.className='rm'; rm.textContent='×'; rm.title='Remove gate';
        rm.onclick = (ev)=>{ ev.stopPropagation(); removeIndices([idx]); };
        badge.appendChild(rm);
        badge.title = label;
        badge.addEventListener('click', (ev)=>{
          if (ev.shiftKey) toggleSelect(idx); else if (ev.metaKey || ev.ctrlKey) toggleSelect(idx); else singleSelect(idx);
        });
        badge.draggable = true;
        badge.addEventListener('dragstart', (e)=>{
          if (!selection.has(idx)) singleSelect(idx);
          e.dataTransfer.setData('text/plain', [...selection].join(','));
          badge.classList.add('dragging');
          timeline.classList.add('drag-active');
        });
        badge.addEventListener('dragend', ()=>{
          timeline.classList.remove('drag-active');
          [...timeline.querySelectorAll('.gate-badge')].forEach(b=>b.classList.remove('dragging','drop-target'));
        });
        // lane drop area
        laneEls.forEach((laneEl)=>{
          laneEl.addEventListener('dragover', (e)=>{ e.preventDefault(); });
          laneEl.addEventListener('drop', (e)=>{
            e.preventDefault();
            const data = e.dataTransfer.getData('text/plain');
            if (!data) return;
            const indices = data.split(',').map(x=>parseInt(x,10)).filter(x=>isFinite(x));
            if (!indices.length) return;
            // drop at end of lane -> compute insertion index relative to gates order (after last of lane or at end)
            const targetLaneIdx = parseInt(laneEl.dataset.qubit,10) || 0;
            reorderSelection(indices, targetLaneIdx);
          });
        });
        laneEls[mainLaneIndex]?.appendChild(badge);
        // For multi-qubit gate (CNOT) add ghost copy on target lane (if different)
        if (g.type === 'CNOT' && g.control !== g.target) {
          const ghost = badge.cloneNode(true);
          ghost.classList.add('ghost');
          const rmBtn = ghost.querySelector('.rm'); if (rmBtn) rmBtn.remove();
          ghost.draggable=false; ghost.addEventListener('click',(ev)=>{ if (ev.shiftKey) toggleSelect(idx); else singleSelect(idx); });
          laneEls[g.target]?.appendChild(ghost);
        }
      }
    });
    updateSelectionStyles();
  }

  // Selection + reorder helpers
  const selection = new Set();
  function singleSelect(i){ selection.clear(); selection.add(i); updateSelectionStyles(); }
  function toggleSelect(i){ if (selection.has(i)) selection.delete(i); else selection.add(i); if (!selection.size) selection.add(i); updateSelectionStyles(); }
  function updateSelectionStyles(){
    const timeline = $('gateTimeline'); if (!timeline) return;
    timeline.querySelectorAll('.gate-badge').forEach(b=>{
      const idx = parseInt(b.dataset.index,10); if (selection.has(idx)) b.classList.add('selected'); else b.classList.remove('selected');
    });
  }
  function removeIndices(indices){
    indices.sort((a,b)=>b-a).forEach(i=>{ if (i>=0 && i<gates.length) gates.splice(i,1); });
    selection.clear();
    renderGates(); runSim();
  }
  function reorderSelection(indices, targetLane){
    // For now, lane drop only changes order, not retarget gates except single-qubit gates.
    // We keep relative ordering of non-selected gates; move selected block to end.
    const unique = Array.from(new Set(indices)).sort((a,b)=>a-b);
    const moving = unique.map(i=>gates[i]);
    // If dropping on a lane and all moving are single-qubit gates, retarget them.
    if (moving.every(g=>g.type!=='CNOT' && g.type!=='MEASURE')) {
      moving.forEach(g=>{ g.target = targetLane; });
    }
    // Rebuild gate list preserving order of non-selected
    const keep = gates.filter((_,i)=>!unique.includes(i));
    gates = keep.concat(moving);
    // Reselect newly moved items at their new indices
    selection.clear();
    for (let i=keep.length;i<gates.length;i++) selection.add(i);
    renderGates(); runSim();
  }

  // Keyboard reordering (arrow left/right to shift selection within list)
  document.addEventListener('keydown', (e)=>{
    if (!['ArrowLeft','ArrowRight','Delete','Backspace'].includes(e.key)) return;
    const timeline = $('gateTimeline'); if (!timeline || document.activeElement !== timeline) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && selection.size){ removeIndices([...selection]); e.preventDefault(); return; }
    if (!selection.size) return;
    const dir = e.key==='ArrowLeft' ? -1 : (e.key==='ArrowRight'?1:0);
    if (!dir) return;
    const sorted = [...selection].sort((a,b)=>a-b);
    if (dir<0 && sorted[0]===0) { e.preventDefault(); return; }
    if (dir>0 && sorted[sorted.length-1]===gates.length-1) { e.preventDefault(); return; }
    // move block
    const block = sorted.map(i=>gates[i]);
    const keep = gates.filter((_,i)=>!selection.has(i));
    // Compute new insertion index
    let insertIndex = dir<0 ? (sorted[0]-1) : (sorted[sorted.length-1]+1 - (sorted.length-1));
    // clamp
    if (insertIndex<0) insertIndex=0; if (insertIndex>keep.length) insertIndex=keep.length;
    gates = [...keep.slice(0,insertIndex), ...block, ...keep.slice(insertIndex)];
    // update selection indices
    selection.clear();
    for (let i=insertIndex; i<insertIndex+block.length; i++) selection.add(i);
    renderGates(); runSim();
    e.preventDefault();
  });

  function renderProbabilities(){
    const table = $('probTable');
    const p = CarnotQSim.probs(state);
    const dim = 1<<qubits;
    table.innerHTML = '<tr><th>State</th><th>Probability</th></tr>';
    for (let i=0; i<dim; i++) {
      const ket = '|' + i.toString(2).padStart(qubits,'0') + '\u27E9';
      const tr = document.createElement('tr');
      const td1 = document.createElement('td'); td1.textContent = ket;
      const td2 = document.createElement('td'); td2.textContent = (p[i]*100).toFixed(2) + '%';
      tr.appendChild(td1); tr.appendChild(td2);
      table.appendChild(tr);
    }
  }

  function renderBloch(){
    const target = Math.min(currentTarget(), qubits-1);
    const vec = CarnotQSim.blochVector(state, qubits, target);
    CarnotQBloch.drawBloch($('blochCanvas'), vec);
    $('blochMag').textContent = vec.mag.toFixed(4);
  }

  function renderStatus(){
    // Norm
    const norm = Math.sqrt(CarnotQSim.probs(state).reduce((a,b)=>a+b,0));
    $('normVal').textContent = norm.toFixed(4);
  }

  function setExplain(text){
    const el = $('explainBox');
    el.textContent = text;
  }

  function currentTarget(){ return parseInt($('targetQubit').value,10) || 0; }

  // Toast helper
  function toast(text, ttl=3000) {
    const host = $('toastHost');
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    host.appendChild(el);
    setTimeout(()=>{
      el.style.transition = 'opacity .3s, transform .3s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(4px)';
      setTimeout(()=> host.removeChild(el), 320);
    }, ttl);
  }

  function validateCircuit(obj){
    if (typeof obj !== 'object' || !obj) return {ok:false, error:'Not an object'};
  const q = Math.max(1, Math.min(4, parseInt(obj.qubits,10)||1));
    const allowed = new Set(['H','X','Z','RX','RZ','CNOT','MEASURE']);
    const gs = Array.isArray(obj.gates) ? obj.gates : [];
    const clean = [];
    for (const g of gs){
      if (!g || typeof g !== 'object') continue;
      if (!allowed.has(g.type)) continue;
      const cg = { type: g.type };
      if (g.type === 'CNOT') {
        const ctrl = parseInt(g.control,10);
        const tgt = parseInt(g.target,10);
        cg.control = (isFinite(ctrl) && ctrl>=0 && ctrl<q) ? ctrl : 0;
        let t2 = (isFinite(tgt) && tgt>=0 && tgt<q) ? tgt : (cg.control===0?1:0);
        if (t2 === cg.control) t2 = (cg.control+1)%q; // ensure different
        cg.target = t2;
      }
      else if (g.type === 'MEASURE') { /* no extra */ }
      else {
        cg.target = Math.max(0, Math.min(q-1, parseInt(g.target,10)||0));
        if (g.type === 'RX' || g.type === 'RZ') {
          const th = Number(g.theta); cg.theta = isFinite(th) ? th : Math.PI;
        }
      }
      clean.push(cg);
    }
    return {ok:true, qubits:q, gates:clean};
  }

  // Explain mode toggle setup
  (function initExplainModes(){
    const group = document.getElementById('explainModeGroup');
    if (!group) return;
    // restore persisted style
    try {
      const saved = vscode.getState && vscode.getState()?.explainStyle;
      if (saved) {
        group.querySelectorAll('.mode-btn').forEach(b=>{
          const st = b.getAttribute('data-style');
          if (st === saved) { b.classList.add('active'); b.setAttribute('aria-checked','true'); }
          else { b.classList.remove('active'); b.setAttribute('aria-checked','false'); }
        });
      }
    } catch {}
    group.addEventListener('click', (e)=>{
      const btn = e.target.closest('.mode-btn');
      if (!btn) return;
      group.querySelectorAll('.mode-btn').forEach(b=>{ b.classList.remove('active'); b.setAttribute('aria-checked','false'); });
      btn.classList.add('active');
      btn.setAttribute('aria-checked','true');
      try { vscode.setState && vscode.setState({ ...(vscode.getState()||{}), explainStyle: btn.getAttribute('data-style') }); } catch {}
    });
    // keyboard navigation (left/right)
    group.addEventListener('keydown', (e)=>{
      if (!['ArrowLeft','ArrowRight'].includes(e.key)) return;
      const buttons = [...group.querySelectorAll('.mode-btn')];
      const idx = buttons.findIndex(b=>b.classList.contains('active'));
      let next = idx + (e.key==='ArrowRight'?1:-1);
      if (next < 0) next = buttons.length-1; else if (next >= buttons.length) next = 0;
      buttons.forEach(b=>{ b.classList.remove('active'); b.setAttribute('aria-checked','false'); });
      buttons[next].classList.add('active'); buttons[next].setAttribute('aria-checked','true'); buttons[next].focus();
      try { vscode.setState && vscode.setState({ ...(vscode.getState()||{}), explainStyle: buttons[next].getAttribute('data-style') }); } catch {}
      e.preventDefault();
    });
  })();

  function currentExplainStyle(){
    const active = document.querySelector('.mode-btn.active');
    return active ? active.getAttribute('data-style') : 'developer';
  }

  // Lessons
  const lessons = [
    {
      title: 'Lesson 0 — Superposition (H on |0⟩)',
      setup: {qubits:1, gates:[{type:'H', target:0}]},
      pass: (state, qubits)=>{
        const p = CarnotQSim.probs(state);
        const tol = 0.15;
        return Math.abs(p[0]-0.5) < tol && Math.abs(p[1]-0.5) < tol;
      },
      hint: 'Set qubits=1. Add H on q0. Run. Expect ~50/50.'
    },
    {
      title: 'Lesson 1 — X flips |0⟩ to |1⟩',
      setup: {qubits:1, gates:[{type:'X', target:0}]},
      pass: (state, qubits)=>{
        const p = CarnotQSim.probs(state);
        return p[1] > 0.9;
      },
      hint: 'Set qubits=1. Add X on q0. Run. Expect |1⟩ ≈ 100%.'
    },
    {
      title: 'Lesson 2 — Bell State (H→CNOT)',
      setup: {qubits:2, gates:[{type:'H', target:0},{type:'CNOT', control:0, target:1}]},
      pass: (state, qubits)=>{
        const p = CarnotQSim.probs(state);
        const tol = 0.2;
        return Math.abs(p[0]-0.5) < tol && Math.abs(p[3]-0.5) < tol && p[1] < 0.05 && p[2] < 0.05;
      },
      hint: 'Set qubits=2. Add H on q0 then CNOT 0→1. Run. Expect |00⟩ and |11⟩ ~50% each.'
    },
    {
      title: 'Lesson 3 — RX(π) ≈ X (up to phase)',
      setup: {qubits:1, gates:[{type:'RX', target:0, theta:Math.PI}]},
      pass: (state, qubits)=>{
        const p = CarnotQSim.probs(state);
        return p[1] > 0.9;
      },
      hint: 'Set qubits=1. Add RX(pi) on q0. Run.'
    }
  ];

  function renderLessons(){
    const box = $('lessons');
    box.innerHTML = '';
    lessons.forEach((L, idx)=>{
      const el = document.createElement('div');
      el.className = 'lesson';
      const t = document.createElement('div'); t.className='section-title'; t.textContent = L.title; el.appendChild(t);
      const btns = document.createElement('div'); btns.className='gates';
      const load = document.createElement('button'); load.textContent = 'Load';
      load.onclick = ()=>{
        qubits = L.setup.qubits;
        $('qubits').value = String(qubits);
        // refresh target options
        const tsel = $('targetQubit');
        tsel.innerHTML = '';
        for (let i=0;i<qubits;i++){ const o=document.createElement('option'); o.value=String(i); o.textContent=String(i); tsel.appendChild(o); }
        gates = JSON.parse(JSON.stringify(L.setup.gates));
        renderGates(); runSim();
      };
      const check = document.createElement('button'); check.textContent = 'Check';
      check.onclick = ()=>{
        const ok = L.pass(state, qubits);
        const res = document.createElement('div');
        res.className = ok ? 'pass' : 'fail';
        res.textContent = ok ? '✓ Passed' : '✗ Not yet';
        el.appendChild(res);
      };
      const hint = document.createElement('div'); hint.className='small'; hint.textContent = L.hint;
  // Guided button (only for lesson 0 and 2)
  const guide = document.createElement('button'); guide.textContent='Guide';
  guide.onclick = ()=> startLessonGuide(idx);
  btns.appendChild(load); btns.appendChild(check); if (idx===0 || idx===2) btns.appendChild(guide);
      el.appendChild(btns);
      el.appendChild(hint);
      box.appendChild(el);
    });
  }

  // Self-test harness
  document.getElementById('btnSelfTest').addEventListener('click', ()=>{
    const results = [];
    // Test 1: H on |0> -> ~0.5,0.5
    let s = CarnotQSim.initState(1);
    CarnotQSim.applySingleQubitGate(s,1,0, CarnotQSim.H); CarnotQSim.normalize(s);
    let p = CarnotQSim.probs(s);
    results.push({name:'H on |0⟩', pass: Math.abs(p[0]-0.5)<0.15 && Math.abs(p[1]-0.5)<0.15});
    // Test 2: X on |0> -> |1>
    s = CarnotQSim.initState(1);
    CarnotQSim.applySingleQubitGate(s,1,0, CarnotQSim.X); CarnotQSim.normalize(s);
    p = CarnotQSim.probs(s);
    results.push({name:'X on |0⟩', pass: p[1] > 0.99});
    // Test 3: RX(pi) on |0> -> ~|1>
    s = CarnotQSim.initState(1);
    CarnotQSim.applySingleQubitGate(s,1,0, CarnotQSim.rx(Math.PI)); CarnotQSim.normalize(s);
    p = CarnotQSim.probs(s);
    results.push({name:'RX(π) on |0⟩', pass: p[1] > 0.99});
    // Test 4: H->CNOT on |00> -> Bell: |00> and |11> ~0.5 each
    s = CarnotQSim.initState(2);
    CarnotQSim.applySingleQubitGate(s,2,0, CarnotQSim.H);
    CarnotQSim.applyCNOT(s,2,0,1); CarnotQSim.normalize(s);
    p = CarnotQSim.probs(s);
    results.push({name:'Bell (H→CNOT)', pass: Math.abs(p[0]-0.5)<0.2 && Math.abs(p[3]-0.5)<0.2 && p[1] < 0.05 && p[2] < 0.05});
    document.getElementById('selfTestResults').textContent = results.map(r => `${r.pass?'✓':'✗'} ${r.name}`).join('\n');
  });

  // initial
  renderGates();
  renderLessons();

  /* Lesson overlay logic */
  const guides = {
    0: [
      { title:'Superposition', text:'Set qubits to 1 (already). Next, add an H gate on q0 using the H button or shortcut.', spotlight:'#btnH' },
      { title:'Run It', text:'Great! Now click Run (or press the button) to see ~50/50 probabilities.', spotlight:'#btnRun' },
      { title:'Observe Bloch', text:'The Bloch vector should point along +X. You just created (|0>+|1>)/√2. Close to finish.', spotlight:'#blochCanvas' }
    ],
    2: [
      { title:'Entanglement Setup', text:'Switch to 2 qubits. Add an H on q0 to create superposition.', spotlight:'#qubits' },
      { title:'Add CNOT', text:'Add a CNOT (0→1) to entangle the qubits into a Bell pair.', spotlight:'#btnCNOT' },
      { title:'Run & Inspect', text:'Run the circuit. You should see |00> and |11> at ~50% each.', spotlight:'#probTable' }
    ]
  };

  function startLessonGuide(lessonIdx){
    const steps = guides[lessonIdx]; if (!steps) return;
    let pointer = 0;
    const overlay = $('lessonOverlay');
    overlay.classList.remove('hidden');
    renderStep();
    function renderStep(){
      overlay.innerHTML='';
      const step = steps[pointer]; if (!step) { overlay.classList.add('hidden'); return; }
      const target = document.querySelector(step.spotlight);
      let rect; try { rect = target?.getBoundingClientRect(); } catch{}
      if (rect) {
        const spot = document.createElement('div'); spot.className='spotlight';
        spot.style.left = rect.left + 'px';
        spot.style.top = rect.top + 'px';
        spot.style.width = rect.width + 'px';
        spot.style.height = rect.height + 'px';
        overlay.appendChild(spot);
      }
      const pop = document.createElement('div'); pop.className='popover';
      pop.style.left = (rect ? Math.min(rect.left, window.innerWidth-300) : 40) + 'px';
      pop.style.top = (rect ? (rect.bottom + 8) : 60) + 'px';
      pop.innerHTML = `<h4>${step.title}</h4><div>${step.text}</div>`;
      const actions = document.createElement('div'); actions.className='actions';
      const btnSkip = document.createElement('button'); btnSkip.textContent='Skip'; btnSkip.onclick=finish;
      const btnNext = document.createElement('button'); btnNext.textContent = pointer === steps.length-1 ? 'Finish' : 'Next';
      btnNext.onclick = ()=>{ pointer++; if (pointer>=steps.length) finish(); else renderStep(); };
      actions.appendChild(btnSkip); actions.appendChild(btnNext); pop.appendChild(actions); overlay.appendChild(pop);
    }
    function finish(){ overlay.classList.add('hidden'); overlay.innerHTML=''; }
  }

})();
