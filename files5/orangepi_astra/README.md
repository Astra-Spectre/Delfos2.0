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

## 9. Alerta de não aderência
Se um alarme ficar ativo por 5 minutos sem confirmação (botão verde), o
sistema escala: o LED amarelo para de piscar, o **LED vermelho** passa a
piscar continuamente, e o buzzer dá um beep curto a cada 90 segundos (em vez
do padrão contínuo dos primeiros 5 minutos). Os tempos são ajustáveis em
`config.py` (`TEMPO_NAO_ADERENCIA_SEG`, `INTERVALO_BUZZER_NAO_ADERENCIA_SEG`,
`DURACAO_BEEP_NAO_ADERENCIA_SEG`).

## O que mudou em relação ao ESP32
- **WiFi**: removido do código - a Orange Pi já fica na rede via NetworkManager/nmcli.
  Configure o Wi-Fi normalmente pelo `nmtui` ou `nmcli`, fora do projeto.
- **NTP**: o Linux sincroniza a hora sozinho (systemd-timesyncd). Só é preciso configurar
  o fuso horário certo (`timedatectl`).
- **Preferences (NVS)** → arquivo `astra_estado.json` (caminho configurável em `config.py`).
- **Buzzer**: como é ativo, simplificamos para liga/desliga (sem PWM de tom).
- **GPIO**: usa o comando `gpio` do wiringOP via `subprocess`, igual ao seu teste do LED.
