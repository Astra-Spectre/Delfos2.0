"""
Configuração central do ASTRA SPECTRE (versão Orange Pi).

PINOS: já confirmados via 'sudo gpio readall' na sua Orange Pi 4A
(ver tabela no README.md). Se remontar a fiação em pinos diferentes,
rode 'sudo gpio readall' de novo e atualize os valores abaixo.
"""

# ================= PINOS (wPi) =================
# Confirmados via 'sudo gpio readall' - ver README para o mapeamento
# físico completo.
PINOS = {
    # LEDs
    "LED_VERDE":   6,   # físico 12 (PB05) - já testado e funcionando
    "LED_AMARELO": 9,   # físico 16 (PI13)
    "LED_AZUL":    10,  # físico 18 (PI14)
    "LED_VERMELHO": 14, # físico 23 (SCLK.1) - alerta de não aderência

    # Botões (INPUT_PULLUP - pressionado = nível baixo, contato com GND)
    "BTN_VERDE":   19,  # físico 29 (PB03)
    "BTN_AMARELO": 20,  # físico 31 (PB11)
    "BTN_AZUL":    22,  # físico 33 (PWM13/268, usado aqui só como GPIO)
    "BTN_PRETO":   23,  # físico 35 (PB06)

    # Buzzer ativo (liga/desliga simples)
    "BUZZER": 25,       # físico 37 (PB12)
}

# ================= I2C (OLED) =================
# Deixe False por enquanto - liga quando for conectar o display.
OLED_HABILITADO = False

# Endereço padrão do SSD1306. Se `i2cdetect` mostrar outro endereço
# (ex: 0x3D), troque aqui.
OLED_I2C_ADDRESS = 0x3C
OLED_WIDTH = 128
OLED_HEIGHT = 64
# Deixe None para autodetectar o barramento I2C (recomendado).
# Se quiser forçar um barramento específico (ex: /dev/i2c-3), coloque 3.
OLED_I2C_BUS = None

# ================= MQTT =================
# 'localhost' porque o broker Mosquitto roda na própria Orange Pi -
# assim não quebra se o IP da rede mudar.
MQTT_BROKER = "localhost"
MQTT_PORT = 1883
MQTT_CLIENT_ID = "OrangePi_ASTRA"

TOPICO_STATUS       = "astra/status"
TOPICO_MANHA        = "astra/manha"
TOPICO_NOITE        = "astra/noite"
TOPICO_ALARME       = "astra/alarme"
TOPICO_CMD          = "astra/cmd"
TOPICO_HORARIO_MANHA = "astra/horario/manha"
TOPICO_HORARIO_NOITE = "astra/horario/noite"

# Tópicos usados pelo dashboard web pra editar paciente/medicamentos.
# O Node.js só publica nesses tópicos - quem grava no banco é sempre
# o main.py (Python), ao receber a mensagem.
TOPICO_PACIENTE            = "astra/paciente/nome"
TOPICO_MEDICAMENTO_MANHA   = "astra/medicamento/manha"
TOPICO_MEDICAMENTO_NOITE   = "astra/medicamento/noite"

# ================= ALARMES (padrão) =================
HORA_MANHA_PADRAO = 9
MIN_MANHA_PADRAO  = 0
HORA_NOITE_PADRAO = 22
MIN_NOITE_PADRAO  = 0

# ================= ALERTA DE NÃO ADERÊNCIA =================
# Se o alarme ficar ativo (sem confirmação) por esse tempo, entra no
# modo de alerta: LED vermelho piscando + beep curto periódico.
TEMPO_NAO_ADERENCIA_SEG = 5 * 60  # 5 minutos

# Intervalo entre os beeps curtos durante o modo de não aderência.
INTERVALO_BUZZER_NAO_ADERENCIA_SEG = 90

# Duração de cada beep curto nesse modo.
DURACAO_BEEP_NAO_ADERENCIA_SEG = 1.5

# ================= ARQUIVO DE ESTADO =================
# Substitui o Preferences/NVS do ESP32.
ARQUIVO_ESTADO = "/home/orangepi/Projetos/astra_estado.json"

# Banco SQLite: paciente, medicamentos (editáveis pelo dashboard) e
# histórico de doses. O dashboard web lê esse arquivo diretamente.
DB_PATH = "/home/orangepi/Projetos/astra.db"

# ================= TIMEZONE =================
# A Orange Pi deve estar com o fuso horário correto do sistema.
# Rode uma vez: sudo timedatectl set-timezone America/Sao_Paulo
