"""
Wrapper de GPIO usando o comando 'gpio' do wiringOP.

Baseado no seu hardware/gpio.py original, mas com:
  - suporte a entrada com pull-up (para os botões, igual ao INPUT_PULLUP do ESP32)
  - leitura de botão já invertida (pressionado = True)
  - validação clara de erro se algum pino ainda estiver como "TROCAR"
"""
import subprocess


def _validar_pino(pino):
    if pino == "TROCAR" or pino is None:
        raise ValueError(
            "Pino não configurado em config.py (ainda está como 'TROCAR'). "
            "Rode 'sudo gpio readall', descubra o wPi correto e edite config.py."
        )
    return pino


def setup_output(pino_wpi):
    pino_wpi = _validar_pino(pino_wpi)
    subprocess.run(["gpio", "mode", str(pino_wpi), "out"], check=True)


def setup_input_pullup(pino_wpi):
    pino_wpi = _validar_pino(pino_wpi)
    subprocess.run(["gpio", "mode", str(pino_wpi), "in"], check=True)
    # habilita o resistor de pull-up interno (equivalente ao INPUT_PULLUP)
    subprocess.run(["gpio", "mode", str(pino_wpi), "up"], check=True)


def write(pino_wpi, valor):
    pino_wpi = _validar_pino(pino_wpi)
    subprocess.run(
        ["gpio", "write", str(pino_wpi), "1" if valor else "0"],
        check=True,
    )


def read_bruto(pino_wpi):
    """Leitura crua do pino (0 ou 1), sem inverter."""
    pino_wpi = _validar_pino(pino_wpi)
    resultado = subprocess.check_output(["gpio", "read", str(pino_wpi)])
    return resultado.decode().strip() == "1"


def botao_pressionado(pino_wpi):
    """
    Com pull-up, o botão pressionado puxa o pino para GND (nível baixo).
    Retorna True quando pressionado - já espelha o '!digitalRead()' do ESP32.
    """
    return not read_bruto(pino_wpi)
