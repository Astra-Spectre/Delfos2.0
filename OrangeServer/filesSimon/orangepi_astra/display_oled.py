"""
Display OLED SSD1306 via I2C, usando luma.oled (equivalente ao
Adafruit_SSD1306 do ESP32).

Requer:
    pip install luma.oled luma.core Pillow smbus2 --break-system-packages

E o I2C habilitado no sistema (geralmente via armbian-config ou
orangepi-config > System > Hardware > i2cX).
"""
from luma.core.interface.serial import i2c
from luma.oled.device import ssd1306
from PIL import ImageFont

import config

try:
    import smbus2
except ImportError:
    smbus2 = None


def _detectar_barramento():
    """Varre /dev/i2c-0 até /dev/i2c-6 procurando o endereço do OLED."""
    if smbus2 is None:
        raise RuntimeError(
            "smbus2 não instalado. Rode: pip install smbus2 --break-system-packages"
        )

    for bus_num in range(0, 7):
        try:
            bus = smbus2.SMBus(bus_num)
            bus.read_byte(config.OLED_I2C_ADDRESS)
            bus.close()
            print(f"[display] OLED encontrado no barramento I2C {bus_num}")
            return bus_num
        except Exception:
            continue

    raise RuntimeError(
        "OLED não encontrado em nenhum barramento I2C (0-6). "
        "Confira a fiação (SDA/SCL/VCC/GND) e se o I2C está habilitado "
        "no orangepi-config / armbian-config."
    )


def iniciar():
    bus_num = config.OLED_I2C_BUS
    if bus_num is None:
        bus_num = _detectar_barramento()

    serial = i2c(port=bus_num, address=config.OLED_I2C_ADDRESS)
    device = ssd1306(serial, width=config.OLED_WIDTH, height=config.OLED_HEIGHT)
    return device


def atualizar(device, hora_str, manha_txt, noite_txt, alarme_txt, mqtt_txt):
    from luma.core.render import canvas

    with canvas(device) as draw:
        draw.text((0, 0), "ASTRA SPECTRE", fill="white")
        if hora_str:
            draw.text((0, 12), hora_str, fill="white")
        draw.text((0, 28), manha_txt, fill="white")
        draw.text((0, 40), noite_txt, fill="white")
        draw.text((0, 54), alarme_txt, fill="white")
        draw.text((100, 54), mqtt_txt, fill="white")
