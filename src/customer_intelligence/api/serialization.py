"""JSON numérico exato para Decimal; sem conversão intermediária a float."""
import json
import math
from datetime import date, datetime
from decimal import Decimal

from starlette.responses import Response


def encode(value):
    if isinstance(value, Decimal):
        return format(value, "f") if value.is_finite() else "null"
    if isinstance(value, float) and not math.isfinite(value):
        return "null"
    if isinstance(value, (date, datetime)):
        return json.dumps(value.isoformat())
    if isinstance(value, dict):
        return "{"+",".join(json.dumps(str(k))+":"+encode(v) for k,v in value.items())+"}"
    if isinstance(value, (list, tuple)):
        return "["+",".join(encode(v) for v in value)+"]"
    return json.dumps(value, ensure_ascii=False, allow_nan=False)


class ExactJSONResponse(Response):
    media_type = "application/json"

    def render(self, content):
        return encode(content).encode("utf-8")


def response(model, payload):
    # Validação de saída explícita mantém Decimal até escrever o token JSON.
    return ExactJSONResponse(model.model_validate(payload).model_dump(mode="python"))
