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
const COMANDOS_VALIDOS = ['CONFIRMAR', 'TESTE', 'REARMAR', 'TESTE_SIMON'];

// Precisa bater com o DEVICE_ID (ou ASTRA_DEVICE_ID) do config.py da
// Orange Pi que este dashboard está monitorando.
const DEVICE_ID = process.env.ASTRA_DEVICE_ID || 'helios-001';

function topico(sufixo) {
  return `astra/${DEVICE_ID}/${sufixo}`;
}

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
  status: 'OFFLINE',
  simon: { fase: null, tentativa: 0, ultimo_resultado: null },
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

  if (topic === topico('alarme')) estado.alarme = msg;
  if (topic === topico('manha'))  estado.manha  = msg;
  if (topic === topico('noite'))  estado.noite  = msg;
  if (topic === topico('status')) estado.status = msg;
  if (topic === topico('simon')) {
    try {
      estado.simon = JSON.parse(msg);
    } catch {
      console.error('Payload de simon inválido:', msg);
    }
  }

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


// Frontend - build de produção do React (pasta frontend/)
// Rode 'npm run build' dentro de frontend/ antes de subir o servidor.
const path = require('path');
const FRONTEND_DIST = path.join(__dirname, 'frontend', 'dist');
app.use(express.static(FRONTEND_DIST));

// Comandos
app.get('/cmd/:comando', (req, res) => {
  const comando = req.params.comando;

  if (!COMANDOS_VALIDOS.includes(comando)) {
    return res.status(400).json({ ok: false, erro: 'Comando inválido' });
  }

  mqttClient.publish(topico('cmd'), comando);
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
    mqttClient.publish(topico('paciente/nome'), paciente_nome);
  }
  if (typeof medicamento_manha_nome === 'string') {
    mqttClient.publish(topico('medicamento/manha'), medicamento_manha_nome);
  }
  if (typeof medicamento_noite_nome === 'string') {
    mqttClient.publish(topico('medicamento/noite'), medicamento_noite_nome);
  }
  if (typeof horario_manha === 'string' && /^\d{2}:\d{2}$/.test(horario_manha)) {
    mqttClient.publish(topico('horario/manha'), horario_manha);
  }
  if (typeof horario_noite === 'string' && /^\d{2}:\d{2}$/.test(horario_noite)) {
    mqttClient.publish(topico('horario/noite'), horario_noite);
  }

  res.json({ ok: true });
});

// Histórico de doses (mais recentes primeiro), com o resumo da verificação
// Simon de cada uma (quantas tentativas e o resultado da última).
// Aceita ?data=YYYY-MM-DD pra filtrar só um dia (usado pelo calendário).
app.get('/api/historico', (req, res) => {
  const limite = Math.min(parseInt(req.query.limite) || 30, 200);

  let filtroData = '';
  if (req.query.data) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(req.query.data)) {
      return res.status(400).json({ ok: false, erro: 'Parâmetro data inválido (use YYYY-MM-DD)' });
    }
    filtroData = `WHERE dl.data = '${req.query.data}'`;
  }

  const linhas = consultarDB(
    `SELECT dl.data, dl.periodo, dl.paciente_nome, dl.medicamento_nome,
            dl.horario_programado, dl.horario_disparo, dl.horario_tomado, dl.status,
            (SELECT COUNT(*) FROM verificacoes_simon vs WHERE vs.dose_log_id = dl.id)
              AS simon_tentativas,
            (SELECT vs.resultado FROM verificacoes_simon vs
             WHERE vs.dose_log_id = dl.id ORDER BY vs.id DESC LIMIT 1)
              AS simon_ultimo_resultado
     FROM doses_log dl
     ${filtroData}
     ORDER BY dl.id DESC
     LIMIT ${limite}`
  );

  if (linhas === null) {
    return res.status(500).json({ ok: false, erro: 'Falha ao ler o banco' });
  }

  res.json({ ok: true, historico: linhas });
});

// Resumo por dia de um mês inteiro (?mes=YYYY-MM), pra pintar o calendário
// sem precisar trazer a tabela detalhada de cada dia de uma vez.
app.get('/api/calendario', (req, res) => {
  const mes = req.query.mes;
  if (!/^\d{4}-\d{2}$/.test(mes || '')) {
    return res.status(400).json({ ok: false, erro: 'Parâmetro mes inválido (use YYYY-MM)' });
  }

  const dias = consultarDB(
    `SELECT data,
            COUNT(*) AS total,
            SUM(CASE WHEN status = 'OK'       THEN 1 ELSE 0 END) AS ok,
            SUM(CASE WHEN status = 'PENDENTE' THEN 1 ELSE 0 END) AS pendente,
            SUM(CASE WHEN status = 'PERDIDO'  THEN 1 ELSE 0 END) AS perdido
     FROM doses_log
     WHERE data LIKE '${mes}%'
     GROUP BY data
     ORDER BY data`
  );

  if (dias === null) {
    return res.status(500).json({ ok: false, erro: 'Falha ao ler o banco' });
  }

  res.json({ ok: true, dias });
});

// Qualquer rota que não bateu com nada acima cai no index.html do React
// (SPA - o roteamento de tela acontece no navegador, não no servidor).
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
});

server.listen(PORTA_WEB, () => {
  console.log('===================================');
  console.log(' ASTRA SPECTRE - Dashboard Online');
  console.log('===================================');
  console.log(`http://localhost:${PORTA_WEB}`);
  console.log('===================================');
});
