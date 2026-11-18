import os
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SYNTHETIC_ROOT = Path.cwd().resolve() / "data" / "synthetic"


class APISettings(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    database_path: str
    data_mode: Literal["synthetic"] = "synthetic"
    read_only: Literal[True] = True
    enable_docs: bool = True
    cors_origins: tuple[str, ...] = ()
    query_timeout_seconds: float = Field(default=15, gt=0, le=120)
    memory_limit_mb: int = Field(default=512, ge=64, le=4096)
    max_rows: int = Field(default=1000, ge=1, le=10000)
    cnpj_cache_path: str | None = None

    def resolved_cnpj_cache_path(self) -> Path:
        if self.cnpj_cache_path:
            return Path(self.cnpj_cache_path)
        return Path(os.path.abspath(self.database_path)).resolve().parent / "cnpj_cache.sqlite3"

    @classmethod
    def from_env(cls) -> "APISettings":
        path = os.getenv("CUSTOMER_API_DATABASE_PATH")
        if not path:
            raise RuntimeError("Configure explicitamente CUSTOMER_API_DATABASE_PATH")
        return cls(database_path=path,
                   data_mode=os.getenv("CUSTOMER_API_DATA_MODE", "synthetic"),
                   read_only=os.getenv("CUSTOMER_API_READ_ONLY", "true").lower() == "true",
                   enable_docs=os.getenv("CUSTOMER_API_ENABLE_DOCS", "true").lower() == "true",
                   cors_origins=tuple(x.strip() for x in os.getenv("CUSTOMER_API_CORS_ORIGINS", "").split(",") if x.strip()),
                   query_timeout_seconds=os.getenv("CUSTOMER_API_QUERY_TIMEOUT_SECONDS", "15"),
                   memory_limit_mb=os.getenv("CUSTOMER_API_MEMORY_LIMIT_MB", "512"),
                   max_rows=os.getenv("CUSTOMER_API_MAX_ROWS", "1000"))

    def authorized_path(self) -> Path:
        # Verificação lexical antes de stat/resolve: caminhos externos nem são abertos.
        target = Path(os.path.abspath(self.database_path))
        root = SYNTHETIC_ROOT
        if not target.is_relative_to(root) or target.suffix != ".duckdb":
            raise RuntimeError("Fonte sintética não autorizada")
        target = target.resolve()
        marker = target.with_suffix(".synthetic.toml")
        if not target.is_relative_to(root) or not marker.resolve().is_relative_to(root):
            raise RuntimeError("Fonte sintética não autorizada")
        if not target.is_file() or not marker.is_file() or marker.read_text(encoding="utf-8") != 'synthetic = true\n':
            raise RuntimeError("Fonte sintética indisponível ou não autorizada")
        return target
