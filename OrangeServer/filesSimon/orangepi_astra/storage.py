"""
Persistência de estado em arquivo JSON.
Substitui o Preferences (NVS) do ESP32 - guarda se o remédio da manhã/
noite já foi tomado, e qual foi o último dia processado.
"""
import json
import os
import config


def carregar_estado():
    padrao = {"manha": False, "noite": False, "dia": -1}

    if not os.path.exists(config.ARQUIVO_ESTADO):
        return padrao

    try:
        with open(config.ARQUIVO_ESTADO, "r") as f:
            dados = json.load(f)
        return {**padrao, **dados}
    except (json.JSONDecodeError, OSError):
        print("[storage] Falha ao ler estado salvo, usando padrão.")
        return padrao


def salvar_estado(manha, noite, dia):
    dados = {"manha": manha, "noite": noite, "dia": dia}
    os.makedirs(os.path.dirname(config.ARQUIVO_ESTADO), exist_ok=True)
    with open(config.ARQUIVO_ESTADO, "w") as f:
        json.dump(dados, f)
