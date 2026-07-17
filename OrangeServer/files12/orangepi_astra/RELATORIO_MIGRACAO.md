# ASTRA SPECTRE — Migração ESP32 → Orange Pi

**Data:** 07 de julho de 2026
**Status:** Sistema funcional e rodando em produção (inicia automaticamente com a placa)

---

## 1. Contexto

O ESP32 que rodava o firmware do ASTRA SPECTRE (sistema de lembrete e confirmação de medicação) queimou. Diante disso, decidimos migrar o sistema inteiro para uma **Orange Pi 4A**, reaproveitando a lógica original e adaptando o código de C++/Arduino para Python, já que a Orange Pi roda Linux completo em vez de um microcontrolador dedicado.

## 2. O que o sistema faz

- Dispara um alarme sonoro e visual (LED piscando + buzzer) nos horários configurados para tomar a medicação da manhã e da noite.
- Permite confirmar a medicação tomada, testar o alarme manualmente e rearmar tudo, via botões físicos.
- Publica o status (medicação tomada/pendente, alarme ativo/inativo) via **MQTT**, permitindo integração com outros sistemas (como um dashboard já existente na rede).
- Reseta automaticamente o status todo dia.
- Persiste o estado (o que já foi tomado) mesmo se o sistema reiniciar.

## 3. O que mudou tecnicamente

| Item | ESP32 (antes) | Orange Pi (agora) |
|---|---|---|
| Linguagem | C++ (Arduino) | Python |
| Conexão Wi-Fi | Gerenciada no próprio código | Gerenciada pelo sistema operacional (NetworkManager) |
| Controle de pinos (LEDs, botões, buzzer) | Biblioteca Arduino nativa | Comando `gpio` (wiringOP), mapeado pino a pino |
| Display OLED | Biblioteca Adafruit | Biblioteca `luma.oled` (ainda não conectado — aguardando módulo novo) |
| Armazenamento de estado | Memória interna (NVS/Preferences) | Arquivo JSON local |
| Sincronização de horário | NTP configurado manualmente no código | Sincronização automática do Linux |
| MQTT | Biblioteca PubSubClient | Biblioteca `paho-mqtt`, mesmos tópicos de antes |
| Execução contínua | Rodava sozinho ao ligar (firmware) | Configurado como serviço do sistema (`systemd`), inicia sozinho no boot e reinicia automaticamente se cair |

## 4. Processo de migração

1. **Diagnóstico inicial**: o primeiro teste de GPIO não funcionava porque a numeração de pinos do ESP32 não tem relação nenhuma com a numeração da Orange Pi — foi necessário mapear os pinos reais da placa usando a ferramenta `gpio readall`.
2. **Reescrita do firmware em Python**, dividida em módulos organizados:
   - Controle de GPIO (LEDs, botões, buzzer)
   - Display OLED (opcional, pronto para quando o módulo for conectado)
   - Persistência de estado
   - Cliente MQTT
   - Lógica principal do alarme (equivalente ao `loop()` do Arduino)
3. **Mapeamento físico dos componentes** na breadboard, pino a pino, usando a documentação oficial da Orange Pi 4A e validação prática com o multímetro e o próprio hardware.
4. **Testes incrementais**: LED individual → todos os LEDs e botões → buzzer → integração MQTT completa.
5. **Automatização**: configuração de um serviço `systemd` (`astra.service`) para que o sistema inicie sozinho sempre que a Orange Pi for ligada, sem depender de alguém conectar via SSH e rodar o script manualmente.

## 5. Status atual

✅ LEDs (verde, amarelo, azul) funcionando
✅ Botões (verde, amarelo, azul, preto) funcionando
✅ Buzzer funcionando
✅ Integração MQTT funcionando (mesmo broker Mosquitto já usado por outros sistemas na rede)
✅ Persistência de estado (sobrevive a reinicializações)
✅ Início automático no boot via `systemd`
⏳ Display OLED — pinos e biblioteca já preparados no código, mas o módulo físico atual não está respondendo (possível defeito); aguardando um módulo substituto para testar

## 6. Observação sobre o dashboard web

Durante os testes, identificamos que já existe um **dashboard web em Node.js** rodando na Orange Pi (gerenciado via PM2, na porta 3000), que também se conecta ao mesmo broker MQTT. Os dois sistemas — o controle físico em Python e o dashboard web — podem operar em conjunto sem conflito, já que um cuida do hardware (botões, LEDs, buzzer) e o outro parece apenas exibir o status. Vale uma checagem futura para confirmar a origem e o propósito exato desse dashboard.

## 7. Próximos passos sugeridos

- Testar e habilitar o display OLED assim que o módulo substituto chegar.
- Revisar/confirmar o propósito do dashboard web já existente e decidir se será mantido como interface oficial.
- Definir um processo de backup/versionamento do código (atualmente os arquivos estão só na Orange Pi).
