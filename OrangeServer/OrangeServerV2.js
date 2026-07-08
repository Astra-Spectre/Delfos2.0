//==============================================================
// ASTRA SPECTRE
// Hermes Server v2
// Orange Pi 4A
// Node.js 22
//==============================================================

const express = require("express");
const mqtt = require("mqtt");
const http = require("http");
const { WebSocketServer } = require("ws");

//--------------------------------------------------------------
// Servidor HTTP
//--------------------------------------------------------------

const app = express();
const server = http.createServer(app);

app.use(express.json());

//--------------------------------------------------------------
// WebSocket
//--------------------------------------------------------------

const wss = new WebSocketServer({
    server
});

//--------------------------------------------------------------
// Configurações
//--------------------------------------------------------------

const HTTP_PORT = 3000;

const MQTT_HOST = "mqtt://localhost:1883";

//--------------------------------------------------------------
// Estado do Sistema
//--------------------------------------------------------------

const estado = {

    status: "OFFLINE",

    alarme: "OFF",

    manha: "PENDENTE",

    noite: "PENDENTE",

    horaManha: "09:00",

    horaNoite: "22:00",

    ultimaAtualizacao: "",

    firmware: "",

    ip: ""

};

//--------------------------------------------------------------
// Cliente MQTT
//--------------------------------------------------------------

const mqttClient = mqtt.connect(MQTT_HOST);

//--------------------------------------------------------------
// Broadcast
//--------------------------------------------------------------

function broadcast() {

    const payload = JSON.stringify(estado);

    wss.clients.forEach(client => {

        if (client.readyState === 1) {

            client.send(payload);

        }

    });

}

//--------------------------------------------------------------
// WebSocket
//--------------------------------------------------------------

wss.on("connection", socket => {

    console.log("Novo navegador conectado.");

    socket.send(JSON.stringify(estado));

});

//--------------------------------------------------------------
// MQTT
//--------------------------------------------------------------

mqttClient.on("connect", () => {

    console.log("------------------------------------");
    console.log("MQTT conectado.");
    console.log("------------------------------------");

    mqttClient.subscribe("astra/#");

});

mqttClient.on("reconnect", () => {

    console.log("Reconectando MQTT...");

});

mqttClient.on("offline", () => {

    console.log("MQTT Offline");

});

mqttClient.on("error", err => {

    console.log(err);

});

//--------------------------------------------------------------
// Recepção MQTT
//--------------------------------------------------------------

mqttClient.on("message", (topic, message) => {

    const msg = message.toString();

    estado.ultimaAtualizacao = new Date().toLocaleTimeString("pt-BR");

    switch(topic){

        case "astra/status":

            estado.status = msg;
            break;

        case "astra/alarme":

            estado.alarme = msg;
            break;

        case "astra/manha":

            estado.manha = msg;
            break;

        case "astra/noite":

            estado.noite = msg;
            break;

        case "astra/horario/manha":

            estado.horaManha = msg;
            break;

        case "astra/horario/noite":

            estado.horaNoite = msg;
            break;

        case "astra/heartbeat":

            try{

                const hb = JSON.parse(msg);

                estado.firmware = hb.fw;
                estado.ip = hb.ip;

            }catch(e){}

            break;

    }

    broadcast();

});
//--------------------------------------------------------------
// Página Principal
//--------------------------------------------------------------

app.get("/", (req, res) => {

res.send(`<!DOCTYPE html>

<html lang="pt-BR">

<head>

<meta charset="UTF-8">

<meta name="viewport" content="width=device-width,initial-scale=1.0">

<title>ASTRA SPECTRE</title>

<style>

*{
margin:0;
padding:0;
box-sizing:border-box;
}

body{

background:#0b0b0b;

color:#ECECEC;

font-family:Arial,Helvetica,sans-serif;

padding:25px;

}

h1{

text-align:center;

color:#00d7ff;

letter-spacing:4px;

margin-bottom:5px;

}

h2{

margin-bottom:15px;

font-size:18px;

color:#00d7ff;

}

.subtitle{

text-align:center;

margin-bottom:25px;

color:#888;

}

.card{

background:#161616;

border:1px solid #2a2a2a;

border-radius:10px;

padding:20px;

margin-bottom:20px;

box-shadow:0 0 15px rgba(0,0,0,.25);

}

.row{

display:flex;

justify-content:space-between;

align-items:center;

margin:10px 0;

}

.badge{

padding:6px 12px;

border-radius:5px;

font-weight:bold;

min-width:110px;

text-align:center;

}

.ok{

background:#0f6d2a;

}

.off{

background:#555;

}

.warn{

background:#d88a00;

}

.alarm{

background:#d50000;

animation:pulse 1s infinite;

}

button{

width:100%;

padding:14px;

margin-top:10px;

border:none;

border-radius:6px;

cursor:pointer;

font-size:15px;

font-weight:bold;

}

.green{

background:#16a34a;

color:white;

}

.orange{

background:#ff9800;

color:black;

}

.gray{

background:#3a3a3a;

color:white;

}

.blue{

background:#2196f3;

color:white;

}

input[type=time]{

padding:8px;

font-size:16px;

background:#111;

color:white;

border:1px solid #444;

border-radius:5px;

}

.footer{

margin-top:35px;

text-align:center;

font-size:12px;

color:#666;

}

@keyframes pulse{

0%{opacity:1;}

50%{opacity:.3;}

100%{opacity:1;}

}

</style>

</head>

<body>

<h1>ASTRA SPECTRE</h1>

<div class="subtitle">

Hermes Dashboard

</div>

<div class="card">

<h2>Status do Sistema</h2>

<div class="row">

<span>ESP32</span>

<span id="status"

class="badge off">

OFFLINE

</span>

</div>

<div class="row">

<span>Alarme</span>

<span id="alarme"

class="badge off">

OFF

</span>

</div>

<div class="row">

<span>Firmware</span>

<span id="fw">

--

</span>

</div>

<div class="row">

<span>IP</span>

<span id="ip">

--

</span>

</div>

<div class="row">

<span>Última atualização</span>

<span id="ultima">

--

</span>

</div>

</div>

<div class="card">

<h2>Medicação</h2>

<div class="row">

<span id="lblManha">

09:00

</span>

<span id="badgeManha"

class="badge warn">

PENDENTE

</span>

</div>

<div class="row">

<span id="lblNoite">

22:00

</span>

<span id="badgeNoite"

class="badge warn">

PENDENTE

</span>

</div>

</div>

<div class="card">

<h2>Horários</h2>

<div class="row">

<span>Manhã</span>

<input id="horaManha"

type="time"

value="09:00">

</div>

<div class="row">

<span>Noite</span>

<input id="horaNoite"

type="time"

value="22:00">

</div>

<button class="blue"

onclick="salvar()">

Salvar Horários

</button>

</div>

<div class="card">

<h2>Comandos</h2>

<button class="green"

onclick="cmd('CONFIRMAR')">

Confirmar Medicação

</button>

<button class="orange"

onclick="cmd('TESTE')">

Testar Alarme

</button>

<button class="gray"

onclick="cmd('REARMAR')">

Rearmar Alarmes

</button>

</div>
<div class="footer">
ASTRA SPECTRE • Hermes v2.0
</div>

<script>

const ws = new WebSocket(
    "ws://" + location.host
);

//======================================================

ws.onopen = () =>
{
    console.log("WebSocket conectado");
};

//======================================================

ws.onclose = () =>
{
    console.log("WebSocket desconectado");

    setTimeout(() =>
    {
        location.reload();
    },3000);
};

//======================================================

ws.onmessage = (event)=>
{
    const dados = JSON.parse(event.data);

    atualizarTela(dados);
};

//======================================================

function atualizarTela(d)
{
    //--------------------------------------------------
    // STATUS ESP
    //--------------------------------------------------

    const status =
        document.getElementById("status");

    status.innerHTML = d.status;

    if(d.status==="ONLINE")
        status.className="badge ok";
    else
        status.className="badge off";

    //--------------------------------------------------
    // ALARME
    //--------------------------------------------------

    const alarme =
        document.getElementById("alarme");

    alarme.innerHTML=d.alarme;

    if(d.alarme==="ATIVO")
        alarme.className="badge alarm";
    else
        alarme.className="badge ok";

    //--------------------------------------------------
    // MEDICAÇÃO
    //--------------------------------------------------

    const bm =
        document.getElementById("badgeManha");

    bm.innerHTML=d.manha;

    bm.className=
        d.manha==="OK"
        ? "badge ok"
        : "badge warn";

    const bn =
        document.getElementById("badgeNoite");

    bn.innerHTML=d.noite;

    bn.className=
        d.noite==="OK"
        ? "badge ok"
        : "badge warn";

    //--------------------------------------------------
    // HORÁRIOS
    //--------------------------------------------------

    document.getElementById(
        "lblManha"
    ).innerHTML=d.horaManha;

    document.getElementById(
        "lblNoite"
    ).innerHTML=d.horaNoite;

    document.getElementById(
        "horaManha"
    ).value=d.horaManha;

    document.getElementById(
        "horaNoite"
    ).value=d.horaNoite;

    //--------------------------------------------------
    // FW/IP
    //--------------------------------------------------

    if(d.fw)
        document.getElementById("fw").innerHTML=d.fw;

    if(d.ip)
        document.getElementById("ip").innerHTML=d.ip;

    //--------------------------------------------------

    document.getElementById(
        "ultima"
    ).innerHTML=
        new Date().toLocaleTimeString();
}

//======================================================

function cmd(comando)
{
    fetch("/cmd/"+comando);
}

//======================================================

function salvar()
{
    fetch("/horarios",
    {
        method:"POST",

        headers:
        {
            "Content-Type":"application/json"
        },

        body:JSON.stringify(
        {
            manha:
                document.getElementById(
                    "horaManha"
                ).value,

            noite:
                document.getElementById(
                    "horaNoite"
                ).value
        })
    });
}

</script>

</body>

</html>`);
});
//--------------------------------------------------------------
// Envia comando ao ESP32
//--------------------------------------------------------------

app.get("/cmd/:comando", (req, res) => {

    const comando = req.params.comando;

    mqttClient.publish(
        "astra/cmd",
        comando
    );

    console.log(
        "CMD ->",
        comando
    );

    res.json({
        ok:true
    });

});

//--------------------------------------------------------------
// Salva horários
//--------------------------------------------------------------

app.post("/horarios", (req, res) => {

    const manha = req.body.manha;
    const noite = req.body.noite;

    if(manha)
    {
        estado.horaManha = manha;

        mqttClient.publish(
            "astra/horario/manha",
            manha
        );
    }

    if(noite)
    {
        estado.horaNoite = noite;

        mqttClient.publish(
            "astra/horario/noite",
            noite
        );
    }

    broadcast();

    console.log(
        "Horários atualizados:",
        manha,
        noite
    );

    res.json({
        ok:true
    });

});

//--------------------------------------------------------------
// Inicialização
//--------------------------------------------------------------

const PORT = 3000;

server.listen(PORT, () => {

    console.log();
    console.log("====================================");
    console.log(" ASTRA SPECTRE");
    console.log(" Dashboard Online");
    console.log("====================================");
    console.log(
        "http://192.168.0.15:" + PORT
    );
    console.log("====================================");

});


