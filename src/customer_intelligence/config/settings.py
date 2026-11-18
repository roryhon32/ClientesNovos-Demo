from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Settings(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    reference_date: date
    history_start: date = date(2020, 1, 1)
    document_key_columns: tuple[str, ...] = (
        "filial", "num_docto", "cod_cliente", "empresa"
    )
    acquisition_policy: Literal["pending", "first_day_bundle"] = "first_day_bundle"
    special_status_policy: Literal[
        "pending", "preserve_without_purchase", "source_only"
    ] = "preserve_without_purchase"
    fail_on_blocking_quality: bool = True
    money_scale: int = Field(default=6, ge=6, le=6)

    @model_validator(mode="after")
    def check_settings(self) -> "Settings":
        if self.reference_date < self.history_start:
            raise ValueError("reference_date deve ser >= history_start")
        if self.document_key_columns != ("filial", "num_docto", "cod_cliente", "empresa"):
            raise ValueError("Chave documental oficial: Filial, Num. Docto., Cód. Cliente, Empresa")
        return self
