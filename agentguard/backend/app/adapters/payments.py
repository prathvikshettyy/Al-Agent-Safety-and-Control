import aiosqlite
from .. import models

async def refund(customer_id: str = "", amount: float = 0.0, currency: str = "INR", reason: str = "Customer request", **kwargs):
    if not customer_id:
        return {"error": "Missing customer_id"}
    if amount <= 0:
        return {"error": "Refund amount must be positive"}

    async with aiosqlite.connect(models.DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        # Deduct from mock system balance
        cursor = await db.execute("SELECT total_funds FROM mock_system_balance WHERE id = 1")
        row = await cursor.fetchone()
        current_funds = row["total_funds"] if row else 1000000.00
        new_funds = current_funds - float(amount)
        await db.execute("UPDATE mock_system_balance SET total_funds = ? WHERE id = 1", (new_funds,))
        
        # Credit customer balance
        await db.execute("UPDATE mock_customers SET balance = balance + ? WHERE id = ?", (amount, customer_id))
        await db.commit()

        # Fetch updated customer balance
        cursor = await db.execute("SELECT balance FROM mock_customers WHERE id = ?", (customer_id,))
        c_row = await cursor.fetchone()
        updated_cust_balance = c_row["balance"] if c_row else amount

    return {
        "status": "completed",
        "customer_id": customer_id,
        "amount_refunded": amount,
        "currency": currency,
        "reason": reason,
        "customer_new_balance": updated_cust_balance,
        "system_remaining_funds": new_funds,
        "transaction_id": f"tx_ref_{int(amount*100)}_{customer_id}"
    }
