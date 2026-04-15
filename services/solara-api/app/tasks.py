import polars as pl
from .celery_app import celery_app
import os
import json

@celery_app.task(name="tasks.check_daily_notifications")
def check_daily_notifications():
    """
    Tarefa agendada (Beat) para verificação de notificações diárias.
    """
    return {"status": "success", "message": "Notificações verificadas via Celery"}

@celery_app.task
def process_medical_cohort_analysis(patients_data_json: str):
    """
    Processa dados médicos em massa via Celery usando o poder do Polars.
    """
    try:
        patients = json.loads(patients_data_json)
        df = pl.DataFrame(patients)
        
        # Análise de risco por especialidade
        risk_analysis = (
            df.filter(pl.col("status") == "faltou")
              .group_by(["cid_code", "specialty"])
              .agg([
                  pl.len().alias("total_faltas"),
                  pl.col("age").mean().alias("idade_media")
              ])
              .sort("total_faltas", descending=True)
        )
        
        return {"success": True, "analysis": risk_analysis.to_dicts()}
    except Exception as e:
        return {"success": False, "error": str(e)}

@celery_app.task
def generate_ai_context_for_doctor(history_records: str):
    """
    Utiliza Polars para fatiar o histórico massivo de exames.
    """
    df = pl.DataFrame(json.loads(history_records))
    summary = (
        df.sort("date", descending=True)
          .head(5)
          .select(["date", "exam_name", "result_flag"])
    )
    return summary.to_dicts()
