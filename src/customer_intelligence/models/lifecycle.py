"""SQL expressions shared by current and historical customer classifications."""

from __future__ import annotations


def status_expression(
    first_purchase: str,
    last_purchase: str,
    reference: str,
    special_observed: str = "FALSE",
) -> str:
    """Classify at a cutoff using purchases already limited to that cutoff.

    Inputs are trusted SQL fragments from the model builders, never user values.
    The explicit policy controls the special source label; pending policy keeps
    the independently calculated status and exposes a separate pending flag.
    """
    return f"""CASE
        WHEN {last_purchase} IS NULL THEN
            CASE WHEN s.special_status_policy = 'preserve_without_purchase'
                      AND ({special_observed})
                 THEN 'SEM CLASSIFICAÇÃO' ELSE 'SEM FATURAMENTO' END
        WHEN date_trunc('month', {first_purchase}) = date_trunc('month', {reference})
            THEN 'NOVO'
        WHEN date_diff('day', {last_purchase}, {reference}) < 180 THEN 'RECORRENTE'
        WHEN date_diff('day', {last_purchase}, {reference}) < 365 THEN 'EM RISCO'
        ELSE 'INATIVO'
    END"""
