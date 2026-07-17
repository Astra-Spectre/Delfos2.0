"""
Cliente MQTT (paho-mqtt), equivalente ao PubSubClient do ESP32.

Requer:
    pip install paho-mqtt --break-system-packages
"""
import paho.mqtt.client as mqtt
import config


class AstraMQTT:
    def __init__(
        self,
        on_comando,
        on_horario_manha,
        on_horario_noite,
        on_paciente,
        on_medicamento_manha,
        on_medicamento_noite,
        on_simon_status=None,
    ):
        """
        on_comando(msg: str)
        on_horario_manha(hora: int, minuto: int)
        on_horario_noite(hora: int, minuto: int)
        on_paciente(nome: str)
        on_medicamento_manha(nome: str)
        on_medicamento_noite(nome: str)
        on_simon_status(status: str) - opcional
        """
        self._on_comando = on_comando
        self._on_horario_manha = on_horario_manha
        self._on_horario_noite = on_horario_noite
        self._on_paciente = on_paciente
        self._on_medicamento_manha = on_medicamento_manha
        self._on_medicamento_noite = on_medicamento_noite
        self._on_simon_status = on_simon_status

        self.client = mqtt.Client(client_id=config.MQTT_CLIENT_ID)
        self.client.on_connect = self._on_connect
        self.client.on_message = self._on_message
        self.client.on_disconnect = self._on_disconnect
        self._conectado = False

    def conectar(self):
        try:
            self.client.connect(config.MQTT_BROKER, config.MQTT_PORT, keepalive=30)
            self.client.loop_start()
        except Exception as e:
            print(f"[mqtt] Erro ao conectar: {e}")

    def conectado(self):
        return self._conectado

    def _on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            self._conectado = True
            print("[mqtt] Conectado")
            client.subscribe(config.TOPICO_CMD)
            client.subscribe(config.TOPICO_HORARIO_MANHA)
            client.subscribe(config.TOPICO_HORARIO_NOITE)
            client.subscribe(config.TOPICO_PACIENTE)
            client.subscribe(config.TOPICO_MEDICAMENTO_MANHA)
            client.subscribe(config.TOPICO_MEDICAMENTO_NOITE)
        else:
            print(f"[mqtt] Falha ao conectar, rc={rc}")

    def _on_disconnect(self, client, userdata, rc):
        self._conectado = False
        print("[mqtt] Desconectado")

    def _on_simon_status(self, status):
        """Callback para status do jogo Simon"""
        if self._on_simon_status:
            self._on_simon_status(status)
        print(f"[mqtt] Simon status: {status}")

    def publicar_estado(self, manha_ok, noite_ok, alarme_ativo, simon_status=""):
        if not self._conectado:
            return
        self.client.publish(config.TOPICO_STATUS, "ONLINE")
        self.client.publish(config.TOPICO_MANHA, "OK" if manha_ok else "PENDENTE")
        self.client.publish(config.TOPICO_NOITE, "OK" if noite_ok else "PENDENTE")
        self.client.publish(config.TOPICO_ALARME, "ATIVO" if alarme_ativo else "OFF")
        if simon_status:
            self.client.publish(config.TOPICO_SIMON, simon_status)

    def _on_simon_status(self, status):
        """Callback para status do jogo Simon"""
        if self._on_simon_status:
            self._on_simon_status(status)
        print(f"[mqtt] Simon status: {status}")

    def publicar_estado(self, manha_ok, noite_ok, alarme_ativo, simon_status=""):
        if not self._conectado:
            return
        self.client.publish(config.TOPICO_STATUS, "ONLINE")
        self.client.publish(config.TOPICO_MANHA, "OK" if manha_ok else "PENDENTE")
        self.client.publish(config.TOPICO_NOITE, "OK" if noite_ok else "PENDENTE")
        self.client.publish(config.TOPICO_ALARME, "ATIVO" if alarme_ativo else "OFF")
        if simon_status:
            self.client.publish(config.TOPICO_SIMON, simon_status)

    def _on_simon_status(self, status):
        """Callback para status do jogo Simon"""
        if self._on_simon_status:
            self._on_simon_status(status)
        print(f"[mqtt] Simon status: {status}")

    def publicar_estado(self, manha_ok, noite_ok, alarme_ativo, simon_status=""):
        if not self._conectado:
            return
        self.client.publish(config.TOPICO_STATUS, "ONLINE")
        self.client.publish(config.TOPICO_MANHA, "OK" if manha_ok else "PENDENTE")
        self.client.publish(config.TOPICO_NOITE, "OK" if noite_ok else "PENDENTE")
        self.client.publish(config.TOPICO_ALARME, "ATIVO" if alarme_ativo else "OFF")
        if simon_status:
            self.client.publish(config.TOPICO_SIMON, simon_status)

    def _on_simon_status(self, status):
        """Callback para status do jogo Simon"""
        if self._on_simon_status:
            self._on_simon_status(status)
        print(f"[mqtt] Simon status: {status}")

    def _on_message(self, client, userdata, msg):
        topico = msg.topic
        payload = msg.payload.decode(errors="ignore")

        if topico == config.TOPICO_CMD:
            self._on_comando(payload)
        elif topico == config.TOPICO_HORARIO_MANHA:
            self._processar_horario(payload, self._on_horario_manha)
        elif topico == config.TOPICO_HORARIO_NOITE:
            self._processar_horario(payload, self._on_horario_noite)
        elif topico == config.TOPICO_PACIENTE:
            self._on_paciente(payload)
        elif topico == config.TOPICO_MEDICAMENTO_MANHA:
            self._on_medicamento_manha(payload)
        elif topico == config.TOPICO_MEDICAMENTO_NOITE:
            self._on_medicamento_noite(payload)
        elif topico == config.TOPICO_SIMON:
            self._on_simon_status(payload)

    @staticmethod
    def _processar_horario(payload, callback):
        try:
            hora = int(payload[0:2])
            minuto = int(payload[3:5])
            callback(hora, minuto)
        except (ValueError, IndexError):
            print(f"[mqtt] Payload de horário inválido: {payload!r}")

    def publicar_estado(self, manha_ok, noite_ok, alarme_ativo, simon_status=""):
        if not self._conectado:
            return
        self.client.publish(config.TOPICO_STATUS, "ONLINE")
        self.client.publish(config.TOPICO_MANHA, "OK" if manha_ok else "PENDENTE")
        self.client.publish(config.TOPICO_NOITE, "OK" if noite_ok else "PENDENTE")
        self.client.publish(config.TOPICO_ALARME, "ATIVO" if alarme_ativo else "OFF")
        if simon_status:
            self.client.publish(config.TOPICO_SIMON, simon_status)
