# Iniciar o projeto (Demo Sintética)

Dê dois cliques em `run.bat`, na raiz, ou execute no PowerShell:

```powershell
.\run.bat
```

O iniciador sobe a API FastAPI em **http://127.0.0.1:8000/docs** apontando exclusivamente para a base sintética `data/synthetic/customer_intelligence.duckdb` (`CUSTOMER_API_DATA_MODE=synthetic`, somente leitura) e inicia o frontend React/Vite em **http://127.0.0.1:5173**. Use **Ctrl+C** na janela para encerrar os servidores.

Para regenerar a base sintética com outro número de clientes ou seed:

```powershell
$env:PYTHONPATH = 'src'
python scripts/run_synthetic_pipeline.py --customers 300 --seed 2026 --persist
```

Para não abrir o navegador automaticamente ou usar outras portas:

```powershell
.\run.bat --no-browser
.\run.bat --api-port 8030 --web-port 5182
```

Se o projeto foi iniciado em segundo plano, use `stop.bat` para encerrar os processos registrados.
