"""Inicia a API sintética (FastAPI + DuckDB) e a interface React/Vite locais."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
from threading import Thread
import time
from urllib.error import URLError
from urllib.request import ProxyHandler, build_opener
import webbrowser

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"
VITE = FRONTEND / "node_modules/vite/bin/vite.js"
DEFAULT_DB = ROOT / "data/synthetic/customer_intelligence.duckdb"
STATE_FILE = ROOT / "data/synthetic/server_process.json"
HTTP = build_opener(ProxyHandler({}))


def start_server(label: str, command: list[str], cwd: Path, env: dict[str, str],
                 processes: list[subprocess.Popen]) -> None:
    flags = {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW} if os.name == "nt" else {"start_new_session": True}
    process = subprocess.Popen(
        command, cwd=cwd, env=env, stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, encoding="utf-8", errors="replace", **flags,
    )
    processes.append(process)

    def relay() -> None:
        assert process.stdout is not None
        with process.stdout:
            for line in process.stdout:
                print(f"[{label}] {line.rstrip()}", flush=True)

    Thread(target=relay, daemon=True).start()


def port_available(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        return sock.connect_ex(("127.0.0.1", port)) != 0


def wait_ready(url: str, processes: list[subprocess.Popen], timeout: int = 90) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if any(p.poll() is not None for p in processes):
            raise RuntimeError("Um servidor encerrou durante a inicialização.")
        try:
            with HTTP.open(url, timeout=2) as resp:
                if resp.status == 200:
                    return
        except URLError:
            pass
        time.sleep(0.4)
    raise TimeoutError(f"Tempo esgotado aguardando {url}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-port", type=int, default=8000)
    parser.add_argument("--web-port", type=int, default=5173)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()

    if not DEFAULT_DB.is_file():
        raise FileNotFoundError(f"Banco sintético não encontrado: {DEFAULT_DB}")
    if not port_available(args.api_port):
        raise RuntimeError(f"Porta da API já ocupada: {args.api_port}")
    if not port_available(args.web_port):
        raise RuntimeError(f"Porta do frontend já ocupada: {args.web_port}")

    processes: list[subprocess.Popen] = []
    api_env = os.environ.copy()
    api_env["PYTHONPATH"] = str(ROOT / "src")
    api_env["CUSTOMER_API_DATABASE_PATH"] = "data/synthetic/customer_intelligence.duckdb"
    api_env["CUSTOMER_API_DATA_MODE"] = "synthetic"
    api_env["CUSTOMER_API_READ_ONLY"] = "true"
    api_env["CUSTOMER_API_CORS_ORIGINS"] = f"http://localhost:{args.web_port},http://127.0.0.1:{args.web_port}"

    web_env = os.environ.copy()
    web_env["VITE_API_TARGET"] = f"http://127.0.0.1:{args.api_port}"

    try:
        start_server(
            "api",
            [sys.executable, "-m", "uvicorn", "customer_intelligence.api.main:create_app",
             "--factory", "--host", "127.0.0.1", "--port", str(args.api_port), "--no-proxy-headers"],
            ROOT, api_env, processes,
        )
        wait_ready(f"http://127.0.0.1:{args.api_port}/api/v1/ready", processes)

        start_server(
            "web",
            ["node", str(VITE), "--host", "127.0.0.1", "--port", str(args.web_port)],
            FRONTEND, web_env, processes,
        )
        wait_ready(f"http://127.0.0.1:{args.web_port}", processes)

        STATE_FILE.write_text(json.dumps({"pids": [p.pid for p in processes]}), encoding="utf-8")
        print(f"Dashboard disponível em http://127.0.0.1:{args.web_port}")
        print(f"API Swagger em http://127.0.0.1:{args.api_port}/docs")
        if not args.no_browser:
            webbrowser.open(f"http://127.0.0.1:{args.web_port}")

        while all(p.poll() is None for p in processes):
            time.sleep(0.5)
    except KeyboardInterrupt:
        pass
    finally:
        for p in processes:
            if p.poll() is None:
                p.terminate()
        STATE_FILE.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
