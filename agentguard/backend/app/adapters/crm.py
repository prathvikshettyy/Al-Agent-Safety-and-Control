import aiosqlite
from .. import models

async def read_customer(customer_id: str = None, **kwargs):
    if not customer_id:
        return {"error": "Missing customer_id"}
    async with aiosqlite.connect(models.DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT id, name, email, tier, balance FROM mock_customers WHERE id = ?", (customer_id,))
        row = await cursor.fetchone()
        if not row:
            return {"customer_id": customer_id, "found": False}
        return dict(row)

async def update_ticket(ticket_id: str = None, customer_id: str = "c_101", subject: str = "General Inquiry", status: str = "open", notes: str = "", **kwargs):
    async with aiosqlite.connect(models.DB_PATH) as db:
        await db.execute("""
            INSERT INTO mock_tickets (id, customer_id, subject, status, notes)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET status=excluded.status, notes=excluded.notes
        """, (ticket_id or "t_999", customer_id, subject, status, notes))
        await db.commit()
    return {
        "ticket_id": ticket_id or "t_999",
        "status": status,
        "updated": True,
        "message": f"Ticket {ticket_id or 't_999'} updated to status '{status}'"
    }

async def export(limit: int = 10, **kwargs):
    async with aiosqlite.connect(models.DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT id, name, email, tier FROM mock_customers LIMIT ?", (limit,))
        rows = await cursor.fetchall()
        return {
            "exported_count": len(rows),
            "records": [dict(r) for r in rows]
        }
