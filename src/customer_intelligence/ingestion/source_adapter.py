from dataclasses import dataclass

import polars as pl

from customer_intelligence.schemas.source_schema import validate_source


@dataclass(frozen=True)
class SyntheticDataset:
    frame: pl.DataFrame
    seed: int = 42
    label: str = "generated"


def read_synthetic(dataset: SyntheticDataset) -> pl.DataFrame:
    if not isinstance(dataset, SyntheticDataset):
        raise TypeError("Somente SyntheticDataset em memória é aceito nesta fase")
    return validate_source(dataset.frame)
