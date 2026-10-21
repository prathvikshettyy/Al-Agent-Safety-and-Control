from .crm import read_customer, update_ticket, export
from .email import send as email_send
from .db import query as db_query
from .payments import refund as payments_refund

TOOLS = {
    "crm.read_customer": read_customer,
    "crm.update_ticket": update_ticket,
    "crm.export": export,
    "email.send": email_send,
    "db.query": db_query,
    "payments.refund": payments_refund,
}
