
/* CarnotQ VS Code Extension (CommonJS) */
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

/** @param {vscode.ExtensionContext} context */
function activate(context) {
  const openCmd = vscode.commands.registerCommand('carnotq.openSandbox', () => {
    const panel = vscode.window.createWebviewPanel(
      'carnotqSandbox',
      'CarnotQ — Quantum Sandbox',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    panel.webview.html = getHtmlForWebview(context, panel.webview);

    panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'copyQasm': {
          try {
            await vscode.env.clipboard.writeText(message.payload?.qasm || '');
            panel.webview.postMessage({ type:'copyQasmResult', ok:true });
          } catch (err) {
            panel.webview.postMessage({ type:'copyQasmResult', ok:false, error: String(err) });
          }
        }
        break;
        case 'copyText': {
          try {
            const text = message.payload?.text || '';
            const label = message.payload?.label || 'Data';
            await vscode.env.clipboard.writeText(text);
            panel.webview.postMessage({ type:'copyTextResult', ok:true, label });
          } catch (err) {
            panel.webview.postMessage({ type:'copyTextResult', ok:false, error:String(err) });
          }
        }
        break;
        case 'saveCircuit': {
          try {
            const uri = await vscode.window.showSaveDialog({ filters:{ 'JSON':['json'] }, saveLabel:'Save Circuit JSON' });
            if (!uri) { panel.webview.postMessage({ type:'saveCircuitResult', ok:false, error:'cancelled' }); break; }
            const data = JSON.stringify(message.payload?.data || {}, null, 2);
            await vscode.workspace.fs.writeFile(uri, Buffer.from(data,'utf8'));
            panel.webview.postMessage({ type:'saveCircuitResult', ok:true });
          } catch (err) {
            panel.webview.postMessage({ type:'saveCircuitResult', ok:false, error: String(err) });
          }
        }
        break;
        case 'loadCircuit': {
          try {
            const sel = await vscode.window.showOpenDialog({ canSelectFiles:true, canSelectMany:false, filters:{ 'JSON':['json'] }, openLabel:'Load Circuit JSON' });
            if (!sel || !sel.length) { panel.webview.postMessage({ type:'loadCircuitResult', ok:false, error:'cancelled' }); break; }
            const uri = sel[0];
            const data = await vscode.workspace.fs.readFile(uri);
            const text = Buffer.from(data).toString('utf8');
            const json = JSON.parse(text);
            panel.webview.postMessage({ type:'loadCircuitResult', ok:true, data: json });
          } catch (err) {
            panel.webview.postMessage({ type:'loadCircuitResult', ok:false, error: String(err) });
          }
        }
        break;
        case 'explain':
          {
            const cfg = vscode.workspace.getConfiguration('carnotq');
            const apiKey = cfg.get('openai.apiKey', '');
            const model = cfg.get('openai.model', 'gpt-4o-mini');
            const includeMath = cfg.get('explain.includeMath', false);
            const style = message.payload?.style || 'developer';

            const prompt = buildExplainPrompt(message.payload, includeMath, style);
            if (!apiKey) {
              // Fallback: copy prompt to clipboard and inform user
              await vscode.env.clipboard.writeText(prompt);
              panel.webview.postMessage({
                type: 'explainResult',
                text: 'No API key configured. The explanation prompt has been copied to your clipboard. Paste it into ChatGPT (or your assistant).'
              });
              vscode.window.showInformationMessage('CarnotQ: Explain prompt copied to clipboard. Paste it into ChatGPT.');
            } else {
              try {
                const text = await callOpenAI(apiKey, model, prompt);
                panel.webview.postMessage({ type: 'explainResult', text });
              } catch (err) {
                console.error(err);
                await vscode.env.clipboard.writeText(prompt);
                panel.webview.postMessage({
                  type: 'explainResult',
                  text: 'OpenAI call failed. Copied the prompt to your clipboard. Paste into ChatGPT for the explanation.'
                });
                vscode.window.showWarningMessage('CarnotQ: OpenAI call failed. Prompt copied to clipboard.');
              }
            }
          }
          break;
      }
    });
  });

  context.subscriptions.push(openCmd);
}
exports.activate = activate;

function deactivate() {}
exports.deactivate = deactivate;

function getHtmlForWebview(context, webview) {
  const mediaRoot = vscode.Uri.joinPath(context.extensionUri, 'media');
  const indexPath = vscode.Uri.joinPath(mediaRoot, 'index.html');
  let html = fs.readFileSync(indexPath.fsPath, 'utf8');

  // Replace resource URIs
  const replaceUri = (p) => webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, p));
  html = html
    .replace(/{{styleUri}}/g, replaceUri('style.css'))
    .replace(/{{mainJsUri}}/g, replaceUri('main.js'))
    .replace(/{{simulatorJsUri}}/g, replaceUri('simulator.js'))
    .replace(/{{blochJsUri}}/g, replaceUri('bloch.js'))
    .replace(/{{cspSource}}/g, webview.cspSource);
  return html;
}

function buildExplainPrompt(payload, includeMath, styleSel) {
  const { gates, qubits, state, probs, qasm } = payload;
  const probsStr = (probs||[]).map(p => Number(p).toFixed(4)).join(', ');
  const ampPreview = (state || []).slice(0, 8).map(a => `(${Number(a.re).toFixed(4)} + ${Number(a.im).toFixed(4)}i)`).join(', ');

  let style = includeMath ? "You may include concise math (matrices, vectors) when it helps clarity." : "Avoid heavy math unless essential.";
  if (styleSel === 'eli5') style = "Explain like I'm 5, using simple language and intuitive analogies; avoid equations.";
  else if (styleSel === 'developer') style = "Explain for a software developer; prefer rotations, linear algebra intuition, and probabilities; minimal equations.";
  else if (styleSel === 'math') style = "Provide a concise, math-forward explanation with matrices/vectors and phases, but keep it under 200 words.";

  return [
    "System: You are a senior quantum tutor. Explain concepts to a classical developer. Prefer analogies to rotations, linear algebra, and parallelism. Keep it under 200 words unless asked.",
    "",
    `User:\nExplain this quantum circuit clearly.\nQubits: ${qubits}\nGates (in order): ${JSON.stringify(gates)}\nOpenQASM:\n${qasm || '(not provided)'}\n`,
    `Current amplitudes (first up to 8): ${ampPreview}`,
    `Probabilities: [${probsStr}]`,
    "Please cover: What each gate does, what the resulting state means, and how measurement relates to the probabilities. " + style
  ].join('\n');
}

async function callOpenAI(apiKey, model, prompt) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: 'You are a senior quantum tutor for developers.' },
        { role: 'user', content: prompt }
      ]
    })
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenAI HTTP ${res.status}: ${t}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  return text || 'No response from model.';
}
