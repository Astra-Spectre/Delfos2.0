"""
Buzzer ATIVO: só precisa de nível alto/baixo, ele mesmo gera o som.
Não usamos PWM/tom aqui (diferente do ledcWriteTone do ESP32),
já que buzzer ativo ignora frequência - só liga e apita.
"""
import gpio_io
import config


def iniciar():
    gpio_io.setup_output(config.PINOS["BUZZER"])
    parar()


def ligar():
    gpio_io.write(config.PINOS["BUZZER"], True)


def parar():
    gpio_io.write(config.PINOS["BUZZER"], False)
