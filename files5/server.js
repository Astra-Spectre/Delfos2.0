const express = require('express');
const mqtt    = require('mqtt');
const { WebSocketServer } = require('ws');
const http    = require('http');
const { execFileSync } = require('child_process');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocketServer({ server });

app.use(express.json());

const MQTT_BROKER = 'mqtt://localhost:1883';
const PORTA_WEB   = 3000;
const COMANDOS_VALIDOS = ['CONFIRMAR', 'TESTE', 'REARMAR'];

// Mesmo arquivo que o main.py (Python) usa - ver config.py -> DB_PATH.
// O dashboard só LÊ esse banco; qualquer edição vira uma mensagem MQTT,
// e quem grava é sempre o Python (evita dois processos escrevendo juntos).
const DB_PATH = '/home/orangepi/Projetos/astra.db';

/**
 * Roda uma consulta SQL somente-leitura no banco, via CLI do sqlite3
 * (evita dependências nativas do Node, que são chatas de compilar em ARM).
 * Requer 'sqlite3' instalado: sudo apt install sqlite3
 */
function consultarDB(sql) {
  try {
    const saida = execFileSync('sqlite3', ['-json', DB_PATH, sql], { encoding: 'utf8' });
    return saida.trim() ? JSON.parse(saida) : [];
  } catch (err) {
    console.error('Erro ao consultar banco:', err.message);
    return null;
  }
}

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
    .campo { margin-bottom: 14px; }
    .campo label { display: block; font-size: 0.7rem; color: #777; letter-spacing: 1px; margin-bottom: 6px; text-transform: uppercase; }
    .campo input {
      width: 100%; background: #111; border: 1px solid #2a2a2a; color: #e0e0e0;
      font-family: 'Courier New', monospace; font-size: 0.9rem; padding: 10px 12px; border-radius: 6px;
    }
    .campo input:focus { outline: none; border-color: #00e5ff; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .btn-salvar { background: #00e5ff; color: #000; font-weight: bold; }
    table.historico { width: 100%; border-collapse: collapse; font-size: 0.7rem; }
    table.historico th, table.historico td { text-align: left; padding: 6px 4px; border-bottom: 1px solid #222; }
    table.historico th { color: #555; text-transform: uppercase; letter-spacing: 1px; font-size: 0.6rem; }
    table.historico td.status-ok { color: #00e676; }
    table.historico td.status-pendente { color: #ff9100; }
    table.historico td.status-perdido { color: #ff1744; }
    .btn-atualizar { background: #222; color: #aaa; border: 1px solid #333; margin-bottom: 12px; }
    .vazio { color: #444; font-size: 0.8rem; text-align: center; padding: 12px 0; }
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

  <div class="card">
    <h2>Paciente &amp; Medicação</h2>
    <div class="campo">
      <label>Nome do paciente</label>
      <input type="text" id="in-paciente" placeholder="Nome do paciente">
    </div>
    <div class="campo">
      <label>Medicação da manhã</label>
      <input type="text" id="in-med-manha" placeholder="Ex: Losartana 50mg">
    </div>
    <div class="campo">
      <label>Horário da manhã</label>
      <input type="time" id="in-hora-manha">
    </div>
    <div class="campo">
      <label>Medicação da noite</label>
      <input type="text" id="in-med-noite" placeholder="Ex: Metformina 850mg">
    </div>
    <div class="campo">
      <label>Horário da noite</label>
      <input type="time" id="in-hora-noite">
    </div>
    <button class="btn btn-salvar" onclick="salvarConfig(this)">💾 Salvar alterações</button>
  </div>

  <div class="card" style="max-width: 600px;">
    <h2>Histórico de doses</h2>
    <button class="btn btn-atualizar" onclick="carregarHistorico()">↻ Atualizar</button>
    <div id="historico-container">
      <p class="vazio">Carregando...</p>
    </div>
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

  function pad2(n) { return String(n).padStart(2, '0'); }

  function carregarConfig() {
    fetch('/api/config')
      .then(r => r.json())
      .then(d => {
        if (!d.ok) return mostrarToast('Falha ao carregar configuração');
        document.getElementById('in-paciente').value = d.paciente_nome || '';
        document.getElementById('in-med-manha').value = d.manha.nome || '';
        document.getElementById('in-med-noite').value = d.noite.nome || '';
        if (d.manha.hora != null) {
          document.getElementById('in-hora-manha').value = pad2(d.manha.hora) + ':' + pad2(d.manha.minuto);
        }
        if (d.noite.hora != null) {
          document.getElementById('in-hora-noite').value = pad2(d.noite.hora) + ':' + pad2(d.noite.minuto);
        }
      })
      .catch(() => mostrarToast('Falha ao carregar configuração'));
  }

  function salvarConfig(btn) {
    btn.disabled = true;
    const body = {
      paciente_nome: document.getElementById('in-paciente').value,
      medicamento_manha_nome: document.getElementById('in-med-manha').value,
      medicamento_noite_nome: document.getElementById('in-med-noite').value,
      horario_manha: document.getElementById('in-hora-manha').value,
      horario_noite: document.getElementById('in-hora-noite').value,
    };

    fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(r => r.json())
      .then(d => mostrarToast(d.ok ? 'Configuração salva' : 'Falha ao salvar'))
      .catch(() => mostrarToast('Falha ao salvar'))
      .finally(() => { btn.disabled = false; });
  }

  function statusClasse(status) {
    if (status === 'OK') return 'status-ok';
    if (status === 'PERDIDO') return 'status-perdido';
    return 'status-pendente';
  }

  function escapeHtml(txt) {
    const div = document.createElement('div');
    div.textContent = txt == null ? '' : txt;
    return div.innerHTML;
  }

  function carregarHistorico() {
    const container = document.getElementById('historico-container');
    fetch('/api/historico?limite=30')
      .then(r => r.json())
      .then(d => {
        if (!d.ok || !d.historico.length) {
          container.innerHTML = '<p class="vazio">Nenhum registro ainda</p>';
          return;
        }
        const linhas = d.historico.map(function (h) {
          return '<tr>'
            + '<td>' + escapeHtml(h.data) + '</td>'
            + '<td>' + escapeHtml(h.periodo) + '</td>'
            + '<td>' + (escapeHtml(h.medicamento_nome) || '-') + '</td>'
            + '<td>' + escapeHtml(h.horario_programado) + '</td>'
            + '<td>' + (escapeHtml(h.horario_tomado) || '-') + '</td>'
            + '<td class="' + statusClasse(h.status) + '">' + escapeHtml(h.status) + '</td>'
            + '</tr>';
        }).join('');

        const cabecalho = '<thead><tr>'
          + '<th>Data</th><th>Período</th><th>Medicamento</th>'
          + '<th>Programado</th><th>Tomado</th><th>Status</th>'
          + '</tr></thead>';

        container.innerHTML = '<table class="historico">' + cabecalho
          + '<tbody>' + linhas + '</tbody></table>';
      })
      .catch(() => { container.innerHTML = '<p class="vazio">Falha ao carregar histórico</p>'; });
  }

  carregarConfig();
  carregarHistorico();
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

// Configuração atual (paciente + medicamentos) - leitura direta do banco
app.get('/api/config', (req, res) => {
  const paciente = consultarDB("SELECT nome FROM paciente WHERE id = 1");
  const medicamentos = consultarDB("SELECT periodo, nome, hora, minuto FROM medicamentos");

  if (paciente === null || medicamentos === null) {
    return res.status(500).json({ ok: false, erro: 'Falha ao ler o banco' });
  }

  const manha = medicamentos.find(m => m.periodo === 'manha') || {};
  const noite = medicamentos.find(m => m.periodo === 'noite') || {};

  res.json({
    ok: true,
    paciente_nome: paciente[0] ? paciente[0].nome : '',
    manha: { nome: manha.nome || '', hora: manha.hora, minuto: manha.minuto },
    noite: { nome: noite.nome || '', hora: noite.hora, minuto: noite.minuto },
  });
});

// Edição de config - não escreve no banco direto, publica MQTT.
// Quem grava de fato é o main.py (Python), ao receber a mensagem.
app.post('/api/config', (req, res) => {
  const { paciente_nome, medicamento_manha_nome, medicamento_noite_nome, horario_manha, horario_noite } = req.body;

  if (typeof paciente_nome === 'string') {
    mqttClient.publish('astra/paciente/nome', paciente_nome);
  }
  if (typeof medicamento_manha_nome === 'string') {
    mqttClient.publish('astra/medicamento/manha', medicamento_manha_nome);
  }
  if (typeof medicamento_noite_nome === 'string') {
    mqttClient.publish('astra/medicamento/noite', medicamento_noite_nome);
  }
  if (typeof horario_manha === 'string' && /^\d{2}:\d{2}$/.test(horario_manha)) {
    mqttClient.publish('astra/horario/manha', horario_manha);
  }
  if (typeof horario_noite === 'string' && /^\d{2}:\d{2}$/.test(horario_noite)) {
    mqttClient.publish('astra/horario/noite', horario_noite);
  }

  res.json({ ok: true });
});

// Histórico de doses (mais recentes primeiro)
app.get('/api/historico', (req, res) => {
  const limite = Math.min(parseInt(req.query.limite) || 30, 200);
  const linhas = consultarDB(
    `SELECT data, periodo, paciente_nome, medicamento_nome, horario_programado,
            horario_disparo, horario_tomado, status
     FROM doses_log
     ORDER BY id DESC
     LIMIT ${limite}`
  );

  if (linhas === null) {
    return res.status(500).json({ ok: false, erro: 'Falha ao ler o banco' });
  }

  res.json({ ok: true, historico: linhas });
});

server.listen(PORTA_WEB, () => {
  console.log('===================================');
  console.log(' ASTRA SPECTRE - Dashboard Online');
  console.log('===================================');
  console.log(`http://localhost:${PORTA_WEB}`);
  console.log('===================================');
});
