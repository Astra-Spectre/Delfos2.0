# ASTRA SPECTRE - Orange Pi

Porte do firmware ESP32 (Arduino) para Python rodando na Orange Pi.

## 1. Copiar o projeto
Copie esta pasta inteira para `/home/orangepi/Projetos/orangepi_astra` (ou onde preferir).

## 2. Instalar dependências

Primeiro tente sem nenhuma flag especial:
```bash
pip3 install -r requirements.txt
```

Se aparecer um erro do tipo `externally-managed-environment`, aí sim use:
```bash
pip3 install -r requirements.txt --break-system-packages
```
(Se der "no such option: --break-system-packages", sua versão de pip é mais
antiga e não tem essa trava — o comando sem a flag já deve funcionar.)

O OLED está **desativado por padrão** (`OLED_HABILITADO = False` em
`config.py`). Quando for conectar o display, instale as libs extras:
```bash
pip3 install -r requirements-oled.txt
```
e mude `OLED_HABILITADO` para `True` em `config.py`.

Garanta também que o **wiringOP** está instalado (você já usou `gpio` no teste do LED, então já está ok).

Pro dashboard web ler o banco de dados, instale o utilitário de linha de comando do SQLite:
```bash
sudo apt install sqlite3
```

## 3. Habilitar o I2C (para o OLED)
Se ainda não estiver habilitado, use o utilitário de configuração da sua imagem
(`orangepi-config` ou `armbian-config` → System → Hardware → habilite o overlay de i2c
correspondente ao pino que você está usando) e reinicie.

Depois, confirme que o OLED responde:
```bash
sudo i2cdetect -l          # lista os barramentos disponíveis
sudo i2cdetect -y <numero> # deve mostrar "3c" na grade
```

## 4. Configurar o fuso horário
```bash
sudo timedatectl set-timezone America/Sao_Paulo
```

## 5. Pinos (já confirmados via `gpio readall`)

| Componente | Físico | wPi | Nome |
|---|---|---|---|
| LED verde | 12 | 6 | PB05 |
| LED amarelo | 16 | 9 | PI13 |
| LED azul | 18 | 10 | PI14 |
| LED vermelho (não aderência) | 23 | 14 | SCLK.1 |
| Botão verde | 29 | 19 | PB03 |
| Botão amarelo | 31 | 20 | PB11 |
| Botão azul | 33 | 22 | PWM13/268 |
| Botão preto | 35 | 23 | PB06 |
| Buzzer | 37 | 25 | PB12 |
| GND comum (botões/buzzer) | 39 | — | GND |
| OLED SDA | 3 | 0 | SDA.4 |
| OLED SCL | 5 | 1 | SCL.4 |

Se remontar a fiação em pinos diferentes, rode `sudo gpio readall` de novo e
atualize `config.py`.

## 6. Rodar
GPIO exige root:
```bash
sudo python3 main.py
```

## 7. Deixar rodando sempre (systemd)
Já existe um `astra.service` pronto neste projeto. Copie e ative:
```bash
sudo cp astra.service /etc/systemd/system/astra.service
sudo systemctl daemon-reload
sudo systemctl enable --now astra
sudo journalctl -u astra -f   # ver os logs
```

## 8. Banco de dados (paciente, medicamentos e histórico de doses)
O `main.py` cria sozinho o arquivo SQLite (`config.DB_PATH`, por padrão
`/home/orangepi/Projetos/astra.db`) na primeira vez que roda — não precisa
criar nada manualmente.

Guarda:
- **paciente**: nome do paciente
- **medicamentos**: nome e horário de cada período (manhã/noite) — editáveis
  pelo dashboard web
- **doses_log**: histórico de cada alarme disparado, com horário programado,
  horário do disparo, horário em que foi confirmado (se foi) e status
  (`PENDENTE` / `OK` / `PERDIDO`)

Edição sempre passa pelo `main.py` (Python) via MQTT — o dashboard Node.js só
lê o banco diretamente (usando o CLI `sqlite3`) e publica mudanças nos
tópicos `astra/paciente/nome`, `astra/medicamento/manha`,
`astra/medicamento/noite`, `astra/horario/manha`, `astra/horario/noite`.
Isso evita dois processos gravando no mesmo arquivo ao mesmo tempo.

## 9. Identidade do dispositivo (múltiplas unidades)

Cada Orange Pi (cada Helios/Hermes) publica em tópicos MQTT com um prefixo
único: `astra/{DEVICE_ID}/...`. Isso evita que duas unidades na mesma rede
colidam e misturem status de pacientes diferentes.

Por padrão, `DEVICE_ID` é `helios-001`. Pra rodar uma unidade com outro nome
(recomendado assim que houver mais de uma Orange Pi na mesma rede), defina a
variável de ambiente antes de iniciar - **nos dois lados** (script Python e
dashboard Node), com o mesmo valor:

```bash
# no astra.service (adicione na seção [Service]):
Environment=ASTRA_DEVICE_ID=helios-joao-silva

# ou rodando manualmente:
ASTRA_DEVICE_ID=helios-joao-silva sudo -E python3 main.py
ASTRA_DEVICE_ID=helios-joao-silva pm2 start server.js --name astra-dashboard
```

Se não definir nada, tudo continua funcionando exatamente como hoje (usa
`helios-001` como padrão nos dois lados).

## 10. Alerta de não aderência

Se um alarme ficar ativo por 5 minutos sem confirmação (botão verde), o
sistema escala: o LED amarelo para de piscar, o **LED vermelho** passa a
piscar continuamente, e o buzzer dá um beep curto a cada 90 segundos (em vez
do padrão contínuo dos primeiros 5 minutos). Os tempos são ajustáveis em
`config.py` (`TEMPO_NAO_ADERENCIA_SEG`, `INTERVALO_BUZZER_NAO_ADERENCIA_SEG`,
`DURACAO_BEEP_NAO_ADERENCIA_SEG`).

## 11. Dashboard web (frontend React + backend Express)

O dashboard tem duas partes que vivem juntas na mesma pasta (ex:
`/home/orangepi/astra/`):

- `server.js` (+ `package.json`) — backend Express: API, MQTT, WebSocket.
- `frontend/` — projeto React/Vite (o visual foi desenhado no Figma pela
  designer). O `server.js` serve o **build de produção** desse projeto, não
  o código-fonte diretamente.

**Instalação e primeiro build:**
```bash
cd /home/orangepi/astra

# dependências do backend
npm install

# dependências e build do frontend
cd frontend
npm install
npm run build      # gera frontend/dist/ - é isso que o server.js serve
cd ..

pm2 restart astra-dashboard   # ou 'pm2 start server.js --name astra-dashboard' na primeira vez
```

**Sempre que alguém (você ou a designer) alterar algo em `frontend/src/`**,
é preciso reconstruir antes de ver a mudança:
```bash
cd frontend
npm run build
cd ..
pm2 restart astra-dashboard
```
O `npm run dev` (modo de desenvolvimento do Vite, com hot-reload) também
funciona pra iterar mais rápido, mas não é o que roda em produção — é só
pra edição local.

## O que mudou em relação ao ESP32
- **WiFi**: removido do código - a Orange Pi já fica na rede via NetworkManager/nmcli.
  Configure o Wi-Fi normalmente pelo `nmtui` ou `nmcli`, fora do projeto.
- **NTP**: o Linux sincroniza a hora sozinho (systemd-timesyncd). Só é preciso configurar
  o fuso horário certo (`timedatectl`).
- **Preferences (NVS)** → arquivo `astra_estado.json` (caminho configurável em `config.py`).
- **Buzzer**: como é ativo, simplificamos para liga/desliga (sem PWM de tom).
- **GPIO**: usa o comando `gpio` do wiringOP via `subprocess`, igual ao seu teste do LED.
