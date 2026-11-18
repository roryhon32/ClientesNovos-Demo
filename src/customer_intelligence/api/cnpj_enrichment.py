"""Consulta sob demanda e cache local em SQLite para dados públicos de CNPJ via BrasilAPI."""
from __future__ import annotations

from contextlib import closing
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import re
import sqlite3
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class CnpjNotFoundError(Exception):
    """CNPJ da matriz não localizado na base pública."""


class CnpjServiceError(Exception):
    """Falha temporária ou limite atingido na API pública de CNPJ."""


def compute_matriz_cnpj(raiz_cnpj: str) -> str:
    """Calcula o CNPJ completo (14 dígitos) da matriz (0001) a partir da raiz de 8 dígitos."""
    if not re.fullmatch(r"\d{8}", raiz_cnpj):
        raise ValueError("Raiz CNPJ inválida")
    base12 = f"{raiz_cnpj}0001"
    w1 = (5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2)
    r1 = sum(int(d) * w for d, w in zip(base12, w1)) % 11
    d1 = 0 if r1 < 2 else 11 - r1
    base13 = f"{base12}{d1}"
    w2 = (6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2)
    r2 = sum(int(d) * w for d, w in zip(base13, w2)) % 11
    d2 = 0 if r2 < 2 else 11 - r2
    return f"{base13}{d2}"


def format_cnpj(cnpj14: str) -> str:
    return f"{cnpj14[:2]}.{cnpj14[2:5]}.{cnpj14[5:8]}/{cnpj14[8:12]}-{cnpj14[12:]}"


def fetch_brasilapi(cnpj14: str, timeout: float = 8.0) -> dict:
    """Consulta a BrasilAPI para um CNPJ completo de 14 dígitos."""
    if not re.fullmatch(r"\d{14}", cnpj14):
        raise ValueError("CNPJ inválido")
    req = Request(
        f"https://brasilapi.com.br/api/cnpj/v1/{cnpj14}",
        headers={"User-Agent": "CustomerIntelligence/1.0", "Accept": "application/json"},
    )
    try:
        with urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except HTTPError as exc:
        if exc.code == 404:
            raise CnpjNotFoundError("CNPJ da matriz não encontrado na base pública.") from None
        raise CnpjServiceError(f"API pública indisponível (HTTP {exc.code}).") from None
    except (URLError, TimeoutError, OSError, json.JSONDecodeError):
        raise CnpjServiceError("Não foi possível consultar a API pública de CNPJ no momento.") from None


def normalize_brasilapi_payload(raw: dict, cnpj14: str, fetched_at: str, cached: bool) -> dict:
    """Extrai e normaliza apenas os campos cadastrais úteis da resposta pública."""
    secondary = [
        {"codigo": str(item.get("codigo", "")), "descricao": str(item.get("descricao", "")).strip()}
        for item in (raw.get("cnaes_secundarios") or [])
        if item and item.get("descricao")
    ][:10]
    capital = raw.get("capital_social")
    return {
        "cnpj": cnpj14,
        "cnpj_formatted": format_cnpj(cnpj14),
        "razao_social": raw.get("razao_social") or None,
        "nome_fantasia": (raw.get("nome_fantasia") or "").strip() or None,
        "situacao_cadastral": raw.get("descricao_situacao_cadastral") or None,
        "data_situacao_cadastral": raw.get("data_situacao_cadastral") or None,
        "data_inicio_atividade": raw.get("data_inicio_atividade") or None,
        "cnae_principal_codigo": str(raw["cnae_fiscal"]) if raw.get("cnae_fiscal") is not None else None,
        "cnae_principal_descricao": raw.get("cnae_fiscal_descricao") or None,
        "cnaes_secundarios": secondary,
        "porte": raw.get("porte") or None,
        "natureza_juridica": raw.get("natureza_juridica") or None,
        "capital_social": float(capital) if capital is not None else None,
        "logradouro": raw.get("logradouro") or None,
        "numero": raw.get("numero") or None,
        "complemento": (raw.get("complemento") or "").strip() or None,
        "bairro": raw.get("bairro") or None,
        "municipio": raw.get("municipio") or None,
        "uf": raw.get("uf") or None,
        "cep": raw.get("cep") or None,
        "source": "brasilapi",
        "fetched_at": fetched_at,
        "cached": cached,
    }


def _open_cache(cache_path: Path) -> sqlite3.Connection:
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(cache_path), timeout=5)
    conn.execute(
        """CREATE TABLE IF NOT EXISTS cnpj_public_cache (
            raiz_cnpj TEXT PRIMARY KEY,
            cnpj_matriz TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            fetched_at TEXT NOT NULL
        )"""
    )
    return conn


def lookup_public_cnpj(
    raiz_cnpj: str,
    cache_path: Path,
    refresh: bool = False,
    ttl_days: int = 30,
) -> dict:
    """Retorna ficha pública do CNPJ da matriz usando cache SQLite local com atualização sob demanda."""
    cnpj14 = compute_matriz_cnpj(raiz_cnpj)
    now = datetime.now(timezone.utc)

    with closing(_open_cache(cache_path)) as conn:
        if not refresh:
            row = conn.execute(
                "SELECT payload_json, fetched_at FROM cnpj_public_cache WHERE raiz_cnpj = ?",
                (raiz_cnpj,),
            ).fetchone()
            if row is not None:
                payload_str, fetched_at_str = row
                try:
                    fetched_dt = datetime.fromisoformat(fetched_at_str)
                    if fetched_dt.tzinfo is None:
                        fetched_dt = fetched_dt.replace(tzinfo=timezone.utc)
                    if now - fetched_dt <= timedelta(days=ttl_days):
                        raw = json.loads(payload_str)
                        return normalize_brasilapi_payload(raw, cnpj14, fetched_at_str, cached=True)
                except (ValueError, json.JSONDecodeError):
                    pass

        raw = fetch_brasilapi(cnpj14)
        fetched_at = now.isoformat()
        conn.execute(
            """INSERT OR REPLACE INTO cnpj_public_cache (raiz_cnpj, cnpj_matriz, payload_json, fetched_at)
               VALUES (?, ?, ?, ?)""",
            (raiz_cnpj, cnpj14, json.dumps(raw, ensure_ascii=False), fetched_at),
        )
        conn.commit()
        return normalize_brasilapi_payload(raw, cnpj14, fetched_at, cached=False)
