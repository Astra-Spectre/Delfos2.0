"""
Persistência em SQLite.

Guarda:
  - paciente: nome do paciente (registro único, id=1)
  - medicamentos: nome e horário de cada período ('manha' / 'noite'),
    editáveis pelo dashboard web
  - doses_log: histórico de cada disparo de alarme e sua confirmação
    (ou não) - é o que alimenta a tela de histórico no painel web

Só o main.py (Python) deve ESCREVER neste banco. O dashboard Node.js
só faz leitura direta; qualquer edição vindo da web passa por MQTT,
que o Python recebe e grava aqui - assim evitamos dois processos
escrevendo no mesmo arquivo SQLite ao mesmo tempo.
"""
import sqlite3
from datetime import datetime

import config


def _conectar():
    conn = sqlite3.connect(config.DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")  # permite leitura concorrente (Node) enquanto este processo escreve
    conn.row_factory = sqlite3.Row
    return conn


def iniciar():
    conn = _conectar()
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS paciente (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            nome TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS medicamentos (
            periodo TEXT PRIMARY KEY CHECK (periodo IN ('manha', 'noite')),
            nome TEXT NOT NULL DEFAULT '',
            hora INTEGER NOT NULL,
            minuto INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS doses_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            data TEXT NOT NULL,
            periodo TEXT NOT NULL,
            paciente_nome TEXT NOT NULL DEFAULT '',
            medicamento_nome TEXT NOT NULL DEFAULT '',
            horario_programado TEXT NOT NULL,
            horario_disparo TEXT NOT NULL,
            horario_tomado TEXT,
            status TEXT NOT NULL DEFAULT 'PENDENTE'
        );

        CREATE TABLE IF NOT EXISTS verificacoes_simon (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dose_log_id INTEGER,
            tentativa INTEGER NOT NULL,
            sequencia TEXT NOT NULL,
            resultado TEXT NOT NULL CHECK (resultado IN ('OK', 'ERRO_BOTAO', 'TIMEOUT')),
            timestamp TEXT NOT NULL
        );
        """
    )
    conn.execute("INSERT OR IGNORE INTO paciente (id, nome) VALUES (1, '')")
    conn.execute(
        "INSERT OR IGNORE INTO medicamentos (periodo, nome, hora, minuto) VALUES ('manha', '', ?, ?)",
        (config.HORA_MANHA_PADRAO, config.MIN_MANHA_PADRAO),
    )
    conn.execute(
        "INSERT OR IGNORE INTO medicamentos (periodo, nome, hora, minuto) VALUES ('noite', '', ?, ?)",
        (config.HORA_NOITE_PADRAO, config.MIN_NOITE_PADRAO),
    )
    conn.commit()
    conn.close()


def carregar_config():
    conn = _conectar()
    paciente = conn.execute("SELECT nome FROM paciente WHERE id = 1").fetchone()
    manha = conn.execute(
        "SELECT nome, hora, minuto FROM medicamentos WHERE periodo = 'manha'"
    ).fetchone()
    noite = conn.execute(
        "SELECT nome, hora, minuto FROM medicamentos WHERE periodo = 'noite'"
    ).fetchone()
    conn.close()

    return {
        "paciente_nome": paciente["nome"] if paciente else "",
        "manha": dict(manha) if manha else {
            "nome": "", "hora": config.HORA_MANHA_PADRAO, "minuto": config.MIN_MANHA_PADRAO
        },
        "noite": dict(noite) if noite else {
            "nome": "", "hora": config.HORA_NOITE_PADRAO, "minuto": config.MIN_NOITE_PADRAO
        },
    }


def atualizar_paciente(nome):
    conn = _conectar()
    conn.execute("UPDATE paciente SET nome = ? WHERE id = 1", (nome,))
    conn.commit()
    conn.close()


def atualizar_medicamento_nome(periodo, nome):
    conn = _conectar()
    conn.execute("UPDATE medicamentos SET nome = ? WHERE periodo = ?", (nome, periodo))
    conn.commit()
    conn.close()


def atualizar_medicamento_horario(periodo, hora, minuto):
    conn = _conectar()
    conn.execute(
        "UPDATE medicamentos SET hora = ?, minuto = ? WHERE periodo = ?",
        (hora, minuto, periodo),
    )
    conn.commit()
    conn.close()


def registrar_disparo(periodo, paciente_nome, medicamento_nome, horario_programado):
    """Chamado quando um alarme real (manhã/noite) dispara. Cria uma
    linha PENDENTE no histórico."""
    agora = datetime.now()
    conn = _conectar()
    conn.execute(
        """INSERT INTO doses_log
           (data, periodo, paciente_nome, medicamento_nome,
            horario_programado, horario_disparo, status)
           VALUES (?, ?, ?, ?, ?, ?, 'PENDENTE')""",
        (
            agora.strftime("%Y-%m-%d"),
            periodo,
            paciente_nome,
            medicamento_nome,
            horario_programado,
            agora.strftime("%H:%M:%S"),
        ),
    )
    conn.commit()
    conn.close()


def confirmar_dose(periodo, data):
    """Marca como OK a última dose PENDENTE desse período, no dia informado.
    Retorna o id dessa dose (ou None se não achou nenhuma pendente)."""
    agora = datetime.now()
    conn = _conectar()
    row = conn.execute(
        """SELECT id FROM doses_log
           WHERE periodo = ? AND data = ? AND status = 'PENDENTE'
           ORDER BY id DESC LIMIT 1""",
        (periodo, data),
    ).fetchone()
    if row is None:
        conn.close()
        return None

    dose_id = row["id"]
    conn.execute(
        "UPDATE doses_log SET status = 'OK', horario_tomado = ? WHERE id = ?",
        (agora.strftime("%H:%M:%S"), dose_id),
    )
    conn.commit()
    conn.close()
    return dose_id


def registrar_verificacao_simon(dose_log_id, tentativa, sequencia, resultado):
    """Guarda o resultado de uma tentativa do teste de responsividade
    (jogo Simon) feito ~3 minutos depois da confirmação de uma dose."""
    conn = _conectar()
    conn.execute(
        """INSERT INTO verificacoes_simon (dose_log_id, tentativa, sequencia, resultado, timestamp)
           VALUES (?, ?, ?, ?, ?)""",
        (
            dose_log_id,
            tentativa,
            ",".join(sequencia),
            resultado,
            datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        ),
    )
    conn.commit()
    conn.close()


def marcar_perdidas_pendentes(data):
    """Chamado no reset diário: qualquer dose ainda PENDENTE do dia
    anterior vira PERDIDO (o paciente não confirmou a tempo)."""
    conn = _conectar()
    conn.execute(
        "UPDATE doses_log SET status = 'PERDIDO' WHERE data = ? AND status = 'PENDENTE'",
        (data,),
    )
    conn.commit()
    conn.close()
