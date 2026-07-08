const express = require('express');
const mqtt    = require('mqtt');
const { WebSocketServer } = require('ws');
const http    = require('http');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocketServer({ server });

const MQTT_BROKER = 'mqtt://localhost:1883';
const PORTA_WEB   = 3000;
const COMANDOS_VALIDOS = ['CONFIRMAR', 'TESTE', 'REARMAR'];

// Estado
const estado = {
  alarme: 'OFF',
  manha:  'PENDENTE',
  noite:  'PENDENTE',
  status: 'OFFLINE'
};

// MQTT
const mqttClient = mqtt.connect(MQTT_BROKER);

mqttClient.on('connect', () => {
  console.log('MQTT conectado');
  mqttClient.subscribe('astra/#');
});

mqttClient.on('error', (err) => {
  console.error('Erro MQTT:', err.message);
});

mqttClient.on('message', (topic, message) => {
  const msg = message.toString();

  if (topic === 'astra/alarme') estado.alarme = msg;
  if (topic === 'astra/manha')  estado.manha  = msg;
  if (topic === 'astra/noite')  estado.noite  = msg;
  if (topic === 'astra/status') estado.status = msg;

  // Notifica todos os navegadores conectados
  const payload = JSON.stringify(estado);
  wss.clients.forEach(c => {
    if (c.readyState === 1) c.send(payload);
  });
});

// Envia o estado atual assim que um navegador conecta
// (antes disso, a tela ficava com "--" até a próxima mensagem MQTT)
wss.on('connection', (ws) => {
  ws.send(JSON.stringify(estado));
});

// Página web
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ASTRA SPECTRE</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0d0d0d;
      color: #e0e0e0;
      font-family: 'Courier New', monospace;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 24px 16px;
    }
    h1 { font-size: 1.4rem; letter-spacing: 4px; color: #00e5ff; text-transform: uppercase; margin-bottom: 4px; }
    .sub { font-size: 0.7rem; color: #555; letter-spacing: 2px; margin-bottom: 28px; }
    .card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 10px; padding: 20px 24px; width: 100%; max-width: 400px; margin-bottom: 16px; }
    .card h2 { font-size: 0.7rem; letter-spacing: 3px; color: #555; text-transform: uppercase; margin-bottom: 16px; }
    .dose-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #222; }
    .dose-row:last-child { border-bottom: none; }
    .dose-time { font-size: 1.1rem; color: #aaa; }
    .badge { font-size: 0.75rem; font-weight: bold; letter-spacing: 1px; padding: 4px 12px; border-radius: 20px; }
    .ok       { background: #0a3d1f; color: #00e676; border: 1px solid #00e676; }
    .pendente { background: #3d1a00; color: #ff9100; border: 1px solid #ff9100; }
    .alarme   { background: #3d0000; color: #ff1744; border: 1px solid #ff1744; animation: pulsar 0.8s infinite alternate; }
    .offline  { background: #222; color: #555; border: 1px solid #333; }
    @keyframes pulsar { from { opacity: 1; } to { opacity: 0.4; } }
    .status-row { display: flex; align-items: center; gap: 10px; font-size: 0.85rem; }
    .dot { width: 10px; height: 10px; border-radius: 50%; }
    .dot-on      { background: #ff1744; box-shadow: 0 0 6px #ff1744; animation: pulsar 0.8s infinite alternate; }
    .dot-off     { background: #2a2a2a; }
    .dot-online  { background: #00e676; box-shadow: 0 0 6px #00e676; }
    .dot-offline { background: #555; }
    .btn { display: block; width: 100%; padding: 12px; border: none; border-radius: 8px; font-family: 'Courier New', monospace; font-size: 0.85rem; letter-spacing: 2px; text-transform: uppercase; cursor: pointer; margin-bottom: 10px; text-decoration: none; text-align: center; transition: opacity 0.2s; }
    .btn:hover { opacity: 0.8; }
    .btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .btn-confirmar { background: #00e676; color: #000; font-weight: bold; }
    .btn-teste     { background: #ff9100; color: #000; }
    .btn-rearmar   { background: #222; color: #aaa; border: 1px solid #333; }
    .footer { font-size: 0.65rem; color: #333; margin-top: 20px; letter-spacing: 2px; text-align: center; }
    .ws-dot { width: 8px; height: 8px; border-radius: 50%; background: #555; display: inline-block; margin-right: 6px; }
    .ws-dot.conectado { background: #00e676; box-shadow: 0 0 6px #00e676; }
    .toast {
      position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%) translateY(20px);
      background: #1a1a1a; border: 1px solid #333; color: #e0e0e0; padding: 10px 20px;
      border-radius: 8px; font-size: 0.8rem; opacity: 0; transition: opacity 0.2s, transform 0.2s;
      pointer-events: none;
    }
    .toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
  </style>
</head>
<body>
  <h1>ASTRA SPECTRE</h1>
  <p class="sub">CONTROLE DE MEDICAÇÃO</p>

  <div class="card">
    <h2>Conexão</h2>
    <div class="dose-row">
      <div class="status-row">
        <div class="dot" id="dot-hw"></div>
        <span>Controlador (Orange Pi)</span>
      </div>
      <span class="badge" id="badge-hw">--</span>
    </div>
    <div class="dose-row">
      <div class="status-row">
        <span class="ws-dot" id="ws-dot"></span>
        <span>Painel</span>
      </div>
      <span style="font-size:0.8rem;color:#555;" id="ws-status">conectando...</span>
    </div>
  </div>

  <div class="card">
    <h2>Alarme</h2>
    <div class="dose-row">
      <div class="status-row">
        <div class="dot" id="dot-alarme"></div>
        <span>Status</span>
      </div>
      <span class="badge" id="badge-alarme">--</span>
    </div>
  </div>

  <div class="card">
    <h2>Medicação do Dia</h2>
    <div class="dose-row">
      <span class="dose-time">09:00</span>
      <span class="badge" id="badge-manha">--</span>
    </div>
    <div class="dose-row">
      <span class="dose-time">22:00</span>
      <span class="badge" id="badge-noite">--</span>
    </div>
  </div>

  <div class="card">
    <h2>Comandos</h2>
    <button class="btn btn-confirmar" onclick="cmd('CONFIRMAR', this)">✓ Confirmar medicação</button>
    <button class="btn btn-teste"     onclick="cmd('TESTE', this)">⚠ Testar alarme</button>
    <button class="btn btn-rearmar"   onclick="cmd('REARMAR', this)">↺ Rearmar alarmes</button>
  </div>

  <p class="footer">
    <span class="ws-dot" id="ws-dot2"></span>ASTRA SPECTRE &nbsp;|&nbsp; porta ${PORTA_WEB}
  </p>

  <div class="toast" id="toast"></div>

<script>
  let ws;

  function conectar() {
    ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);

    ws.onopen = () => {
      document.getElementById('ws-dot').className  = 'ws-dot conectado';
      document.getElementById('ws-dot2').className = 'ws-dot conectado';
      document.getElementById('ws-status').textContent = 'conectado';
    };

    ws.onclose = () => {
      document.getElementById('ws-dot').className  = 'ws-dot';
      document.getElementById('ws-dot2').className = 'ws-dot';
      document.getElementById('ws-status').textContent = 'desconectado - tentando reconectar...';
      setTimeout(conectar, 3000);
    };

    ws.onmessage = (e) => {
      const d = JSON.parse(e.data);

      // Status do controlador (Orange Pi)
      const online = d.status === 'ONLINE';
      document.getElementById('dot-hw').className   = 'dot ' + (online ? 'dot-online' : 'dot-offline');
      document.getElementById('badge-hw').className = 'badge ' + (online ? 'ok' : 'offline');
      document.getElementById('badge-hw').textContent = d.status;

      // Alarme
      const ativo = d.alarme === 'ATIVO';
      document.getElementById('dot-alarme').className   = 'dot ' + (ativo ? 'dot-on' : 'dot-off');
      document.getElementById('badge-alarme').className = 'badge ' + (ativo ? 'alarme' : 'ok');
      document.getElementById('badge-alarme').textContent = d.alarme;

      // Medicação
      setBadge('badge-manha', d.manha);
      setBadge('badge-noite', d.noite);
    };
  }
  conectar();

  function setBadge(id, val) {
    const el = document.getElementById(id);
    el.textContent = val;
    el.className = 'badge ' + (val === 'OK' ? 'ok' : 'pendente');
  }

  function mostrarToast(texto) {
    const t = document.getElementById('toast');
    t.textContent = texto;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2000);
  }

  function cmd(comando, btn) {
    btn.disabled = true;
    fetch('/cmd/' + comando)
      .then(r => r.json())
      .then(d => mostrarToast(d.ok ? 'Enviado: ' + comando : 'Comando inválido'))
      .catch(() => mostrarToast('Falha ao enviar comando'))
      .finally(() => { btn.disabled = false; });
  }
</script>
</body>
</html>`);
});

// Comandos
app.get('/cmd/:comando', (req, res) => {
  const comando = req.params.comando;

  if (!COMANDOS_VALIDOS.includes(comando)) {
    return res.status(400).json({ ok: false, erro: 'Comando inválido' });
  }

  mqttClient.publish('astra/cmd', comando);
  console.log('Comando enviado:', comando);
  res.json({ ok: true, comando });
});

server.listen(PORTA_WEB, () => {
  console.log('===================================');
  console.log(' ASTRA SPECTRE - Dashboard Online');
  console.log('===================================');
  console.log(`http://localhost:${PORTA_WEB}`);
  console.log('===================================');
});
