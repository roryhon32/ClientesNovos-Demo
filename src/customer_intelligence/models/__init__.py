"""Build deterministic DuckDB analytical models from the normalized item fact."""

from __future__ import annotations

from typing import TYPE_CHECKING

from .acquisition import build_acquisition
from .cohorts import build_cohorts
from .customers import build_customers
from .monthly import build_monthly
from .reconciliation import reconcile_monthly_cohort
from .transitions import build_transitions

if TYPE_CHECKING:
    import duckdb

    from customer_intelligence.config.settings import Settings


def build_models(connection: duckdb.DuckDBPyConnection, settings: Settings) -> None:
    """Replace model tables using the supplied as-of date and explicit policies.

    Transaction ownership belongs to the pipeline so all tables can be committed
    atomically with ingestion and data quality checks.
    """
    connection.execute(
        """CREATE OR REPLACE TEMP TABLE _ci_model_settings AS
           SELECT CAST(? AS DATE) AS reference_date, CAST(? AS DATE) AS history_start,
                  CAST(? AS VARCHAR) AS acquisition_policy,
                  CAST(? AS VARCHAR) AS special_status_policy""",
        [settings.reference_date, settings.history_start,
         settings.acquisition_policy, settings.special_status_policy],
    )
    build_customers(connection)
    build_acquisition(connection)
    build_monthly(connection)
    build_cohorts(connection)
    build_transitions(connection)
    reconcile_monthly_cohort(connection)


__all__ = ["build_models"]
