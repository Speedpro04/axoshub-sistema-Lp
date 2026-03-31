from __future__ import annotations

import polars as pl


def build_kpi_frame() -> pl.DataFrame:
    """Build a small sample frame used to validate the analytics workspace."""
    return pl.DataFrame(
        {
            "produto": ["solara-mei", "solara-connect"],
            "usuarios_ativos": [1200, 340],
            "conversao": [0.18, 0.27],
        }
    ).with_columns(
        (pl.col("usuarios_ativos") * pl.col("conversao")).alias("clientes_convertidos")
    )


def main() -> None:
    frame = build_kpi_frame()
    print(frame)


if __name__ == "__main__":
    main()
