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
import random
import time
from datetime import datetime, timedelta

import config
import gpio_io
import buzzer
import storage
import database
from mqtt_client import AstraMQTT

if config.OLED_HABILITADO:
    import display_oled
else:
    display_oled = None


class AstraController:
    def __init__(self):
        estado = storage.carregar_estado()
        self.ultimo_dia = estado["dia"]

        hoje = datetime.now().strftime("%Y-%m-%d")
        self.remedio_manha_tomado = database.dose_tomada_hoje("manha", hoje)
        self.remedio_noite_tomado = database.dose_tomada_hoje("noite", hoje)

        cfg = database.carregar_config()
        self.paciente_nome = cfg["paciente_nome"]
        self.nome_medicamento_manha = cfg["manha"]["nome"]
        self.nome_medicamento_noite = cfg["noite"]["nome"]
        self.hora_manha = cfg["manha"]["hora"]
        self.min_manha = cfg["manha"]["minuto"]
        self.hora_noite = cfg["noite"]["hora"]
        self.min_noite = cfg["noite"]["minuto"]

        self.alarme_ativo = False
        self.teste_alarme = False
        self.periodo_atual = None  # 'manha' | 'noite' | None (teste manual)
        self.dose_log_id_atual = None  # id da linha em doses_log do alarme em andamento
        self.alarme_manha_disparado_hoje = False
        self.alarme_noite_disparado_hoje = False
        self.led_azul = False

        self.last_verde = False
        self.last_amarelo = False
        self.last_azul = False
        self.last_preto = False

        self.estado_pisca = False
        self.buzzer_ligado = False

        # controle do alerta escalonado de não aderência
        self.alarme_desde = None
        self.beep_escalado_inicio = None
        self.ultimo_beep_escalado = None
        self.ultimo_beep_normal = time.monotonic()

        # controle do teste de responsividade (jogo tipo Simon), disparado
        # alguns minutos depois de uma dose real ser confirmada
        self.simon_agendado_para = None   # timestamp monotonic de quando deve começar
        self.simon_dose_log_id = None     # qual dose esse teste está verificando
        self.simon_fase = None            # None | 'exibindo' | 'aguardando'
        self.simon_sequencia = []
        self.simon_tentativa = 1
        self.simon_indice = 0
        self.simon_led_estado = "on"
        self.simon_proximo_evento_em = None
        self.simon_prazo_passo = None

        self.mqtt = AstraMQTT(
            on_comando=self.on_comando,
            on_horario_manha=self.on_horario_manha,
            on_horario_noite=self.on_horario_noite,
            on_paciente=self.on_paciente,
            on_medicamento_manha=self.on_medicamento_manha,
            on_medicamento_noite=self.on_medicamento_noite,
        )

    # ---------------- callbacks MQTT ----------------
    def on_comando(self, msg):
        if msg == "CONFIRMAR":
            if self.alarme_ativo:
                self._marcar_tomado()
                self._desativar_alarme()
                self._salvar_e_publicar()
        elif msg == "TESTE":
            self.teste_alarme = True
            self._ativar_alarme(periodo=None)
            self._publicar()
        elif msg == "REARMAR":
            self._rearmar()
        elif msg == "TESTE_SIMON":
            self._forcar_verificacao_simon_teste()

    def on_horario_manha(self, hora, minuto):
        self.hora_manha = hora
        self.min_manha = minuto
        self.alarme_manha_disparado_hoje = False
        database.atualizar_medicamento_horario("manha", hora, minuto)
        print(f"Manha atualizado: {hora:02d}:{minuto:02d}")

    def on_horario_noite(self, hora, minuto):
        self.hora_noite = hora
        self.min_noite = minuto
        self.alarme_noite_disparado_hoje = False
        database.atualizar_medicamento_horario("noite", hora, minuto)
        print(f"Noite atualizado: {hora:02d}:{minuto:02d}")

    def on_paciente(self, nome):
        self.paciente_nome = nome
        database.atualizar_paciente(nome)
        print(f"Paciente atualizado: {nome}")

    def on_medicamento_manha(self, nome):
        self.nome_medicamento_manha = nome
        database.atualizar_medicamento_nome("manha", nome)
        print(f"Medicamento da manhã atualizado: {nome}")

    def on_medicamento_noite(self, nome):
        self.nome_medicamento_noite = nome
        database.atualizar_medicamento_nome("noite", nome)
        print(f"Medicamento da noite atualizado: {nome}")

    # ---------------- lógica interna ----------------
    def _ativar_alarme(self, periodo=None):
        if not self.alarme_ativo:
            self.alarme_desde = time.monotonic()
        self.alarme_ativo = True
        self.periodo_atual = periodo

    def _desativar_alarme(self):
        self.alarme_ativo = False
        self.teste_alarme = False
        self.alarme_desde = None
        self.beep_escalado_inicio = None
        self.ultimo_beep_escalado = None
        self.periodo_atual = None
        self.dose_log_id_atual = None
        buzzer.parar()

    def em_nao_aderencia(self, agora_monot):
        if not self.alarme_ativo or self.alarme_desde is None:
            return False
        return (agora_monot - self.alarme_desde) >= config.TEMPO_NAO_ADERENCIA_SEG

    # ---------------- teste de responsividade (jogo Simon) ----------------
    def _agendar_verificacao_simon(self, dose_log_id):
        self.simon_dose_log_id = dose_log_id
        self.simon_agendado_para = time.monotonic() + config.SIMON_ATRASO_SEG
        self.simon_fase = None
        self.simon_tentativa = 1
        self.simon_sequencia = []

    def _forcar_verificacao_simon_teste(self):
        """Chamado pelo botão 'Testar jogo Simon' do dashboard - não
        espera os 3 minutos nem depende de uma dose real confirmada."""
        if self.alarme_ativo:
            print("[simon] Ignorado: há um alarme ativo agora")
            return
        print("[simon] Teste manual solicitado pelo dashboard")
        self.simon_dose_log_id = None
        self.simon_agendado_para = time.monotonic()
        self.simon_fase = None
        self.simon_tentativa = 1
        self.simon_sequencia = []

    def _iniciar_verificacao_simon(self, agora_monot):
        if not self.simon_sequencia:
            tamanho_inicial = (
                config.SIMON_PASSOS_INICIAL
                if config.SIMON_MODO_INCREMENTAL
                else config.SIMON_PASSOS
            )
            self.simon_sequencia = [
                random.choice(config.SIMON_CORES) for _ in range(tamanho_inicial)
            ]
            print(f"[simon] Nova verificação - sequência: {self.simon_sequencia}")
        else:
            print(
                f"[simon] Tentativa {self.simon_tentativa} - repetindo a sequência "
                f"atual ({len(self.simon_sequencia)} passos)"
            )

        self.simon_fase = "exibindo"
        self.simon_indice = 0
        self.simon_led_estado = "on"
        self.simon_proximo_evento_em = agora_monot + config.SIMON_DURACAO_FLASH_SEG
        self.simon_agendado_para = None
        self.mqtt.publicar_simon(
            self.simon_fase, self.simon_tentativa, total_passos=len(self.simon_sequencia)
        )

    def _registrar_tentativa_simon(self, resultado):
        database.registrar_verificacao_simon(
            self.simon_dose_log_id, self.simon_tentativa, self.simon_sequencia, resultado
        )
        print(f"[simon] Tentativa {self.simon_tentativa}: {resultado}")
        self.mqtt.publicar_simon(
            self.simon_fase, self.simon_tentativa, resultado,
            total_passos=len(self.simon_sequencia),
        )

    def _reiniciar_tentativa_simon(self, agora_monot):
        self.simon_tentativa += 1
        self.simon_fase = None
        self.simon_agendado_para = agora_monot  # repete quase imediatamente, mesma sequência

    def _finalizar_simon_sucesso(self):
        self._registrar_tentativa_simon("OK")
        print("[simon] Verificação concluída com sucesso")
        self._cancelar_simon()

    def _cancelar_simon(self):
        self.simon_agendado_para = None
        self.simon_fase = None
        self.simon_sequencia = []
        self.simon_indice = 0
        self.simon_tentativa = 1
        self.simon_dose_log_id = None
        buzzer.parar()
        self.mqtt.publicar_simon(None, 0)

    def responder_simon(self, cor):
        """Chamado pelo processar_botoes quando o botão dessa cor é
        apertado durante a fase de espera do jogo."""
        esperado = self.simon_sequencia[self.simon_indice]
        if cor == esperado:
            self.simon_indice += 1
            if self.simon_indice >= len(self.simon_sequencia):
                self._completar_rodada_simon()
            else:
                self.simon_prazo_passo = time.monotonic() + config.SIMON_TIMEOUT_PASSO_SEG
        else:
            self._registrar_tentativa_simon("ERRO_BOTAO")
            self._reiniciar_tentativa_simon(time.monotonic())

    def _completar_rodada_simon(self):
        """Chamado quando a pessoa acerta a rodada inteira. No modo
        incremental, se ainda não chegou no tamanho máximo, soma mais um
        passo aleatório e recomeça a mesma verificação (mesma dose, nova
        rodada). No modo fixo (ou ao atingir o máximo), encerra com
        sucesso."""
        if config.SIMON_MODO_INCREMENTAL and len(self.simon_sequencia) < config.SIMON_PASSOS_MAXIMO:
            self._registrar_tentativa_simon("OK")
            print(
                f"[simon] Rodada de {len(self.simon_sequencia)} passo(s) concluída - "
                f"aumentando para {len(self.simon_sequencia) + 1}"
            )
            self.simon_sequencia.append(random.choice(config.SIMON_CORES))
            self.simon_tentativa = 1
            self.simon_fase = None
            self.simon_agendado_para = time.monotonic()  # começa a próxima rodada quase já
        else:
            self._finalizar_simon_sucesso()

    def atualizar_simon(self, agora_monot):
        # nunca roda por cima de um alarme real - evita LEDs/botões com
        # dois significados ao mesmo tempo
        if self.alarme_ativo:
            if self.simon_fase is not None or self.simon_agendado_para is not None:
                print("[simon] Cancelado: um alarme real começou")
                self._cancelar_simon()
            return

        if self.simon_fase is None:
            if (
                self.simon_agendado_para is not None
                and agora_monot >= self.simon_agendado_para
            ):
                self._iniciar_verificacao_simon(agora_monot)
            return

        if self.simon_fase == "exibindo":
            if agora_monot < self.simon_proximo_evento_em:
                return
            if self.simon_led_estado == "on":
                self.simon_led_estado = "off"
                self.simon_proximo_evento_em = agora_monot + config.SIMON_PAUSA_FLASH_SEG
                return
            self.simon_indice += 1
            if self.simon_indice >= len(self.simon_sequencia):
                self.simon_fase = "aguardando"
                self.simon_indice = 0
                self.simon_prazo_passo = agora_monot + config.SIMON_TIMEOUT_PASSO_SEG
                self.mqtt.publicar_simon(
                    self.simon_fase, self.simon_tentativa,
                    total_passos=len(self.simon_sequencia),
                )
            else:
                self.simon_led_estado = "on"
                self.simon_proximo_evento_em = agora_monot + config.SIMON_DURACAO_FLASH_SEG
            return

        if self.simon_fase == "aguardando":
            if agora_monot >= self.simon_prazo_passo:
                self._registrar_tentativa_simon("TIMEOUT")
                self._reiniciar_tentativa_simon(agora_monot)
            return

    def _marcar_tomado(self):
        periodo = self.periodo_atual or ("manha" if datetime.now().hour < 15 else "noite")

        if periodo == "manha":
            self.remedio_manha_tomado = True
        else:
            self.remedio_noite_tomado = True

        # só loga/agenda verificação se foi um alarme real (não um teste manual)
        if self.periodo_atual is not None:
            # usa o id capturado no momento do disparo - assim funciona
            # mesmo que a confirmação aconteça depois da virada do dia
            # (quando a data de "hoje" já não bate mais com a da dose)
            dose_id = database.confirmar_dose_por_id(self.dose_log_id_atual)
            self._agendar_verificacao_simon(dose_id)

    def _rearmar(self):
        # "Rearmar" reseta a MECÂNICA do alarme (permite disparar de novo,
        # desliga LED/buzzer) - não deve apagar uma confirmação real que já
        # está no banco. Por isso relê o status direto do banco em vez de
        # simplesmente zerar as flags.
        hoje = datetime.now().strftime("%Y-%m-%d")
        self.remedio_manha_tomado = database.dose_tomada_hoje("manha", hoje)
        self.remedio_noite_tomado = database.dose_tomada_hoje("noite", hoje)
        self.alarme_manha_disparado_hoje = False
        self.alarme_noite_disparado_hoje = False
        self._desativar_alarme()
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

        if preto and not self.last_preto:
            self._cancelar_simon()
            self._rearmar()

        if self.simon_fase == "aguardando":
            # os botões coloridos aqui só respondem ao jogo - não devem
            # confirmar dose, disparar teste nem alternar o LED azul
            if verde and not self.last_verde:
                self.responder_simon("verde")
            if amarelo and not self.last_amarelo:
                self.responder_simon("amarelo")
            if azul and not self.last_azul:
                self.responder_simon("azul")
        else:
            if verde and not self.last_verde:
                if self.alarme_ativo:
                    self._marcar_tomado()
                    self._desativar_alarme()
                    self._salvar_e_publicar()

            if amarelo and not self.last_amarelo:
                self.teste_alarme = True
                self._ativar_alarme(periodo=None)
                self._publicar()

            if azul and not self.last_azul:
                self.led_azul = not self.led_azul

        self.last_verde = verde
        self.last_amarelo = amarelo
        self.last_azul = azul
        self.last_preto = preto

    def checar_reset_diario(self, agora):
        if agora.day != self.ultimo_dia:
            ontem = agora - timedelta(days=1)
            database.marcar_perdidas_pendentes(ontem.strftime("%Y-%m-%d"))

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
            self._ativar_alarme(periodo="manha")
            self.alarme_manha_disparado_hoje = True
            self.dose_log_id_atual = database.registrar_disparo(
                "manha",
                self.paciente_nome,
                self.nome_medicamento_manha,
                f"{self.hora_manha:02d}:{self.min_manha:02d}",
            )
            self._publicar()

        if (
            agora.hour == self.hora_noite
            and agora.minute == self.min_noite
            and not self.remedio_noite_tomado
            and not self.alarme_noite_disparado_hoje
        ):
            self._ativar_alarme(periodo="noite")
            self.alarme_noite_disparado_hoje = True
            self.dose_log_id_atual = database.registrar_disparo(
                "noite",
                self.paciente_nome,
                self.nome_medicamento_noite,
                f"{self.hora_noite:02d}:{self.min_noite:02d}",
            )
            self._publicar()

    def atualizar_leds(self, agora_monot):
        if self.simon_fase == "exibindo":
            cor_atual = self.simon_sequencia[self.simon_indice]
            aceso = self.simon_led_estado == "on"
            for cor in config.SIMON_CORES:
                pino = config.PINOS[f"LED_{cor.upper()}"]
                gpio_io.write(pino, aceso and cor == cor_atual)
            gpio_io.write(config.PINOS["LED_VERMELHO"], False)
            # buzzer acompanha o LED: apita junto com cada flash da sequência
            if aceso:
                buzzer.ligar()
            else:
                buzzer.parar()
            return

        if self.simon_fase == "aguardando":
            # apaga os LEDs do jogo enquanto espera o próximo botão
            for cor in config.SIMON_CORES:
                gpio_io.write(config.PINOS[f"LED_{cor.upper()}"], False)
            gpio_io.write(config.PINOS["LED_VERMELHO"], False)
            buzzer.parar()
            return

        nao_aderencia = self.em_nao_aderencia(agora_monot)

        gpio_io.write(
            config.PINOS["LED_VERDE"],
            self.remedio_manha_tomado or self.remedio_noite_tomado,
        )
        gpio_io.write(config.PINOS["LED_AZUL"], self.led_azul)

        # LED amarelo: pisca na fase inicial do alarme (antes dos 5 min)
        gpio_io.write(
            config.PINOS["LED_AMARELO"],
            self.estado_pisca if (self.alarme_ativo and not nao_aderencia) else False,
        )

        # LED vermelho: pisca só depois de 5 min sem confirmação
        gpio_io.write(
            config.PINOS["LED_VERMELHO"],
            self.estado_pisca if nao_aderencia else False,
        )

    def atualizar_buzzer(self, agora_monot):
        if self.simon_fase is not None:
            # o buzzer do jogo Simon já é controlado direto em atualizar_leds,
            # sincronizado com o flash de cada LED - não mexe aqui.
            return

        if not self.alarme_ativo:
            buzzer.parar()
            self.buzzer_ligado = False
            return

        if self.em_nao_aderencia(agora_monot):
            # fase de não aderência: beep curto a cada N segundos
            if self.beep_escalado_inicio is not None:
                # beep em andamento - checa se já deve desligar
                if (
                    agora_monot - self.beep_escalado_inicio
                    >= config.DURACAO_BEEP_NAO_ADERENCIA_SEG
                ):
                    buzzer.parar()
                    self.beep_escalado_inicio = None
                    self.ultimo_beep_escalado = agora_monot
            else:
                # ainda não tocou nenhum beep, ou já passou o intervalo
                if (
                    self.ultimo_beep_escalado is None
                    or (agora_monot - self.ultimo_beep_escalado)
                    >= config.INTERVALO_BUZZER_NAO_ADERENCIA_SEG
                ):
                    buzzer.ligar()
                    self.beep_escalado_inicio = agora_monot
        else:
            # fase inicial: beep contínuo (padrão de sempre)
            if agora_monot - self.ultimo_beep_normal >= 0.5:
                self.ultimo_beep_normal = agora_monot
                self.buzzer_ligado = not self.buzzer_ligado
                if self.buzzer_ligado:
                    buzzer.ligar()
                else:
                    buzzer.parar()


def main():
    print("Iniciando ASTRA SPECTRE (Orange Pi)...")

    database.iniciar()

    gpio_io.setup_output(config.PINOS["LED_VERDE"])
    gpio_io.setup_output(config.PINOS["LED_AMARELO"])
    gpio_io.setup_output(config.PINOS["LED_AZUL"])
    gpio_io.setup_output(config.PINOS["LED_VERMELHO"])
    buzzer.iniciar()

    gpio_io.setup_input_pullup(config.PINOS["BTN_VERDE"])
    gpio_io.setup_input_pullup(config.PINOS["BTN_AMARELO"])
    gpio_io.setup_input_pullup(config.PINOS["BTN_AZUL"])
    gpio_io.setup_input_pullup(config.PINOS["BTN_PRETO"])

    device_oled = display_oled.iniciar() if config.OLED_HABILITADO else None

    controlador = AstraController()
    controlador.mqtt.conectar()

    ultimo_pisca = time.monotonic()
    ultimo_mqtt = time.monotonic()
    ultimo_display = time.monotonic()

    print("Sistema pronto.")

    while True:
        agora_monot = time.monotonic()
        agora = datetime.now()

        controlador.checar_reset_diario(agora)
        controlador.processar_botoes()
        controlador.checar_disparo_alarmes(agora)
        controlador.atualizar_simon(agora_monot)

        if agora_monot - ultimo_pisca >= 0.3:
            ultimo_pisca = agora_monot
            controlador.estado_pisca = not controlador.estado_pisca

        controlador.atualizar_leds(agora_monot)
        controlador.atualizar_buzzer(agora_monot)

        if agora_monot - ultimo_mqtt >= 30:
            ultimo_mqtt = agora_monot
            controlador._publicar()

        if agora_monot - ultimo_display >= 0.2:
            ultimo_display = agora_monot
            hora_str = agora.strftime("%H:%M")
            manha_txt = f"{controlador.hora_manha:02d}:{controlador.min_manha:02d}"
            if controlador.nome_medicamento_manha:
                manha_txt += f" {controlador.nome_medicamento_manha}"
            manha_txt += " OK" if controlador.remedio_manha_tomado else " PEND"

            noite_txt = f"{controlador.hora_noite:02d}:{controlador.min_noite:02d}"
            if controlador.nome_medicamento_noite:
                noite_txt += f" {controlador.nome_medicamento_noite}"
            noite_txt += " OK" if controlador.remedio_noite_tomado else " PEND"
            if controlador.simon_fase is not None:
                alarme_txt = "VERIFICANDO (Simon)"
            elif controlador.em_nao_aderencia(agora_monot):
                alarme_txt = "ALERTA GRAVE!"
            elif controlador.alarme_ativo:
                alarme_txt = "MEDICACAO!"
            else:
                alarme_txt = "NORMAL"
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
