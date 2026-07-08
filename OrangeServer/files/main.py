#!/usr/bin/env python3
"""
ASTRA SPECTRE - versão Orange Pi (porte do firmware ESP32)

Requisitos (instale na Orange Pi):
    pip install paho-mqtt luma.oled luma.core Pillow smbus2 --break-system-packages

Antes de rodar:
    1. Preencha os pinos em config.py (rode 'sudo gpio readall' pra descobrir os wPi).
    2. Confirme o endereço/barramento I2C do OLED (auto-detectado por padrão).
    3. Garanta o fuso horário certo: sudo timedatectl set-timezone America/Sao_Paulo

Rodar (precisa de sudo por causa do acesso ao GPIO):
    sudo python3 main.py
"""
import time
from datetime import datetime

import config
import gpio_io
import buzzer
import storage
from mqtt_client import AstraMQTT

if config.OLED_HABILITADO:
    import display_oled
else:
    display_oled = None


class AstraController:
    def __init__(self):
        estado = storage.carregar_estado()
        self.remedio_manha_tomado = estado["manha"]
        self.remedio_noite_tomado = estado["noite"]
        self.ultimo_dia = estado["dia"]

        self.hora_manha = config.HORA_MANHA_PADRAO
        self.min_manha = config.MIN_MANHA_PADRAO
        self.hora_noite = config.HORA_NOITE_PADRAO
        self.min_noite = config.MIN_NOITE_PADRAO

        self.alarme_ativo = False
        self.teste_alarme = False
        self.alarme_manha_disparado_hoje = False
        self.alarme_noite_disparado_hoje = False
        self.led_azul = False

        self.last_verde = False
        self.last_amarelo = False
        self.last_azul = False
        self.last_preto = False

        self.estado_pisca = False
        self.buzzer_ligado = False

        self.mqtt = AstraMQTT(
            on_comando=self.on_comando,
            on_horario_manha=self.on_horario_manha,
            on_horario_noite=self.on_horario_noite,
        )

    # ---------------- callbacks MQTT ----------------
    def on_comando(self, msg):
        if msg == "CONFIRMAR":
            if self.alarme_ativo:
                self._marcar_tomado_pela_hora()
                self.alarme_ativo = False
                self.teste_alarme = False
                buzzer.parar()
                self._salvar_e_publicar()
        elif msg == "TESTE":
            self.teste_alarme = True
            self.alarme_ativo = True
            self._publicar()
        elif msg == "REARMAR":
            self._rearmar()

    def on_horario_manha(self, hora, minuto):
        self.hora_manha = hora
        self.min_manha = minuto
        self.alarme_manha_disparado_hoje = False
        print(f"Manha atualizado: {hora:02d}:{minuto:02d}")

    def on_horario_noite(self, hora, minuto):
        self.hora_noite = hora
        self.min_noite = minuto
        self.alarme_noite_disparado_hoje = False
        print(f"Noite atualizado: {hora:02d}:{minuto:02d}")

    # ---------------- lógica interna ----------------
    def _marcar_tomado_pela_hora(self):
        agora = datetime.now()
        if agora.hour < 15:
            self.remedio_manha_tomado = True
        else:
            self.remedio_noite_tomado = True

    def _rearmar(self):
        self.remedio_manha_tomado = False
        self.remedio_noite_tomado = False
        self.alarme_manha_disparado_hoje = False
        self.alarme_noite_disparado_hoje = False
        self.alarme_ativo = False
        self.teste_alarme = False
        buzzer.parar()
        self._salvar_e_publicar()
        print("Alarmes rearmados")

    def _salvar_e_publicar(self):
        storage.salvar_estado(
            self.remedio_manha_tomado, self.remedio_noite_tomado, self.ultimo_dia
        )
        self._publicar()

    def _publicar(self):
        self.mqtt.publicar_estado(
            self.remedio_manha_tomado, self.remedio_noite_tomado, self.alarme_ativo
        )

    def processar_botoes(self):
        verde = gpio_io.botao_pressionado(config.PINOS["BTN_VERDE"])
        amarelo = gpio_io.botao_pressionado(config.PINOS["BTN_AMARELO"])
        azul = gpio_io.botao_pressionado(config.PINOS["BTN_AZUL"])
        preto = gpio_io.botao_pressionado(config.PINOS["BTN_PRETO"])

        if verde and not self.last_verde:
            if self.alarme_ativo:
                self.alarme_ativo = False
                self.teste_alarme = False
                buzzer.parar()
                self._marcar_tomado_pela_hora()
                self._salvar_e_publicar()

        if amarelo and not self.last_amarelo:
            self.teste_alarme = True
            self.alarme_ativo = True
            self._publicar()

        if azul and not self.last_azul:
            self.led_azul = not self.led_azul

        if preto and not self.last_preto:
            self._rearmar()

        self.last_verde = verde
        self.last_amarelo = amarelo
        self.last_azul = azul
        self.last_preto = preto

    def checar_reset_diario(self, agora):
        if agora.day != self.ultimo_dia:
            self.ultimo_dia = agora.day
            self.remedio_manha_tomado = False
            self.remedio_noite_tomado = False
            self.alarme_manha_disparado_hoje = False
            self.alarme_noite_disparado_hoje = False
            self._salvar_e_publicar()

    def checar_disparo_alarmes(self, agora):
        if (
            agora.hour == self.hora_manha
            and agora.minute == self.min_manha
            and not self.remedio_manha_tomado
            and not self.alarme_manha_disparado_hoje
        ):
            self.alarme_ativo = True
            self.alarme_manha_disparado_hoje = True
            self._publicar()

        if (
            agora.hour == self.hora_noite
            and agora.minute == self.min_noite
            and not self.remedio_noite_tomado
            and not self.alarme_noite_disparado_hoje
        ):
            self.alarme_ativo = True
            self.alarme_noite_disparado_hoje = True
            self._publicar()

    def atualizar_leds(self):
        gpio_io.write(
            config.PINOS["LED_VERDE"],
            self.remedio_manha_tomado or self.remedio_noite_tomado,
        )
        gpio_io.write(config.PINOS["LED_AZUL"], self.led_azul)
        gpio_io.write(
            config.PINOS["LED_AMARELO"],
            self.estado_pisca if self.alarme_ativo else False,
        )

    def atualizar_buzzer(self):
        if self.alarme_ativo:
            self.buzzer_ligado = not self.buzzer_ligado
            if self.buzzer_ligado:
                buzzer.ligar()
            else:
                buzzer.parar()
        else:
            buzzer.parar()
            self.buzzer_ligado = False


def main():
    print("Iniciando ASTRA SPECTRE (Orange Pi)...")

    gpio_io.setup_output(config.PINOS["LED_VERDE"])
    gpio_io.setup_output(config.PINOS["LED_AMARELO"])
    gpio_io.setup_output(config.PINOS["LED_AZUL"])
    buzzer.iniciar()

    gpio_io.setup_input_pullup(config.PINOS["BTN_VERDE"])
    gpio_io.setup_input_pullup(config.PINOS["BTN_AMARELO"])
    gpio_io.setup_input_pullup(config.PINOS["BTN_AZUL"])
    gpio_io.setup_input_pullup(config.PINOS["BTN_PRETO"])

    device_oled = display_oled.iniciar() if config.OLED_HABILITADO else None

    controlador = AstraController()
    controlador.mqtt.conectar()

    ultimo_pisca = time.monotonic()
    ultimo_beep = time.monotonic()
    ultimo_mqtt = time.monotonic()
    ultimo_display = time.monotonic()

    print("Sistema pronto.")

    while True:
        agora_monot = time.monotonic()
        agora = datetime.now()

        controlador.checar_reset_diario(agora)
        controlador.processar_botoes()
        controlador.checar_disparo_alarmes(agora)

        if agora_monot - ultimo_pisca >= 0.3:
            ultimo_pisca = agora_monot
            controlador.estado_pisca = not controlador.estado_pisca

        controlador.atualizar_leds()

        if agora_monot - ultimo_beep >= 0.5:
            ultimo_beep = agora_monot
            controlador.atualizar_buzzer()

        if agora_monot - ultimo_mqtt >= 30:
            ultimo_mqtt = agora_monot
            controlador._publicar()

        if agora_monot - ultimo_display >= 0.2:
            ultimo_display = agora_monot
            hora_str = agora.strftime("%H:%M")
            manha_txt = f"{controlador.hora_manha:02d}:{controlador.min_manha:02d} " + (
                "OK" if controlador.remedio_manha_tomado else "PEND"
            )
            noite_txt = f"{controlador.hora_noite:02d}:{controlador.min_noite:02d} " + (
                "OK" if controlador.remedio_noite_tomado else "PEND"
            )
            alarme_txt = "MEDICACAO!" if controlador.alarme_ativo else "NORMAL"
            mqtt_txt = "MQ" if controlador.mqtt.conectado() else "--"

            if config.OLED_HABILITADO:
                display_oled.atualizar(
                    device_oled, hora_str, manha_txt, noite_txt, alarme_txt, mqtt_txt
                )
            else:
                # OLED desligado por enquanto - mostra o status no terminal
                print(
                    f"\r{hora_str} | {manha_txt} | {noite_txt} | {alarme_txt} | {mqtt_txt}   ",
                    end="",
                )

        time.sleep(0.05)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nEncerrando...")
        buzzer.parar()
