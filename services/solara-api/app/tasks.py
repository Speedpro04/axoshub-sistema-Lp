import time
import logging
from app.celery_app import celery_app

logger = logging.getLogger(__name__)

@celery_app.task(name="tasks.test_task")
def test_task(name: str):
    logger.info(f"Test task received for {name}")
    time.sleep(3)
    logger.info(f"Test task completed for {name}")
    return {"message": f"Hello {name}, Celery is working in new repository!"}

@celery_app.task(name="tasks.check_daily_notifications")
def check_daily_notifications():
    logger.info("Running daily checks for notifications/followups")
    # Lógica de notificação / WhatsApp aqui
    return {"status": "checked"}
