## CarnotQ — Quantum Sandbox (VS Code Extension)

An in-editor learning playground for quantum computing fundamentals. Build small circuits, view a per‑qubit gate timeline, inspect the Bloch vector, copy QASM / probabilities / amplitudes, load templates, and generate adaptive explanations (ELI5 / Dev / Math).

---

### Quickstart
1. Clone the repo.
2. `npm install`
3. Press **F5** in VS Code to launch the Extension Development Host.
4. Run **“CarnotQ: Open Quantum Sandbox”** from the Command Palette.

Package a VSIX:
```bash
npm run package
```

Publish (after setting publisher & PAT):
```bash
vsce publish
```

---

### Templates (New Circuit menu)
- **Empty** – Clears gates, keeps current qubit count.
- **Bell** – 2‑qubit H(0) + CNOT(0→1) entanglement starter.
- **RX Demo** – Four successive RX(π/2) on q0 (full 2π rotation accumulated).

---

### Keyboard Shortcuts (Webview)
- H / X / Z – add gate on current target.
- R – add RX(θ) (θ from the RX input field).
- M – add Measure placeholder.
- Ctrl+Backspace – clear all gates.

---

### Feature Highlights
- Gates: H, X, Z, RX(θ), RZ(θ), CNOT, Measure, Reset, Sample.
- Up to **4 qubits** (state‑vector simulation, 2^n up to 16 amplitudes).
- Per‑qubit **timeline** with multi‑select drag & keyboard reordering.
- **Copy**: QASM, probabilities, amplitudes (JSON) + toasts.
- **Explain**: ELI5 / Developer / Math modes (OpenAI key optional; falls back to copying prompt).
- **Lessons & Guided Overlays**: Superposition, X flip, Bell pair, RX(π) concept; guided steps for select lessons.
- **Self‑Test** button: quick correctness sanity tests.
- **Save/Load** circuit JSON with basic validation & versioning.
- **Theme-aware** styling (light/dark via VS Code theme vars).

---

### OpenAI Integration (Optional)
Set in VS Code Settings → CarnotQ:
- API Key, Model (default `gpt-4o-mini`).
Without a key, the prompt is copied for manual use.

---

### Development Scripts
```bash
npm test       # Run simulator harness tests
npm run package # Build VSIX (npx vsce package)
```

---

### Security & Privacy
- Only sends data when you explicitly click Explain with a configured key.
- No telemetry; all simulation runs locally.

---

### License
MIT
