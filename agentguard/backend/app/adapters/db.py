import aiosqlite
from .. import models

async def query(sql: str = "", **kwargs):
    if not sql:
        return {"error": "Missing SQL query"}
    
    async with aiosqlite.connect(models.DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        try:
            cursor = await db.execute(sql)
            if sql.strip().upper().startswith("SELECT"):
                rows = await cursor.fetchall()
                results = [dict(r) for r in rows]
                return {"row_count": len(results), "rows": results}
            else:
                await db.commit()
                return {"affected_rows": cursor.rowcount, "message": "Executed statement successfully"}
        except Exception as e:
            return {"error": str(e), "success": False}
