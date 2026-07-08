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

## 7. Deixar rodando sempre (systemd) - opcional
Crie `/etc/systemd/system/astra.service`:
```ini
[Unit]
Description=ASTRA SPECTRE
After=network-online.target

[Service]
ExecStart=/usr/bin/python3 /home/orangepi/Projetos/orangepi_astra/main.py
WorkingDirectory=/home/orangepi/Projetos/orangepi_astra
Restart=always
User=root

[Install]
WantedBy=multi-user.target
```
Depois:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now astra
sudo journalctl -u astra -f   # ver os logs
```

## O que mudou em relação ao ESP32
- **WiFi**: removido do código - a Orange Pi já fica na rede via NetworkManager/nmcli.
  Configure o Wi-Fi normalmente pelo `nmtui` ou `nmcli`, fora do projeto.
- **NTP**: o Linux sincroniza a hora sozinho (systemd-timesyncd). Só é preciso configurar
  o fuso horário certo (`timedatectl`).
- **Preferences (NVS)** → arquivo `astra_estado.json` (caminho configurável em `config.py`).
- **Buzzer**: como é ativo, simplificamos para liga/desliga (sem PWM de tom).
- **GPIO**: usa o comando `gpio` do wiringOP via `subprocess`, igual ao seu teste do LED.
