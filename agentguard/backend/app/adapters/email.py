import aiosqlite
from .. import models

async def send(to: str = "", subject: str = "", body: str = "", **kwargs):
    if not to:
        return {"error": "Missing recipient"}
    async with aiosqlite.connect(models.DB_PATH) as db:
        cursor = await db.execute(
            "INSERT INTO mock_outbox (recipient, subject, body) VALUES (?, ?, ?)",
            (to, subject, body)
        )
        await db.commit()
        outbox_id = cursor.lastrowid
    return {
        "status": "queued",
        "outbox_id": outbox_id,
        "recipient": to,
        "subject": subject,
        "message": f"Email queued to {to} successfully"
    }
