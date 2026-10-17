"""Authenticated local MQTT configuration; secrets never appear in responses."""

from fastapi import APIRouter, Depends, HTTPException, Request

from ..deps import require_auth
from ..services.mqtt import MQTTService, MQTTSettingsUpdate, MQTTStatus

router = APIRouter(dependencies=[Depends(require_auth)])


def get_mqtt_service(request: Request) -> MQTTService:
    service = getattr(request.app.state, "mqtt_service", None)
    if service is None:
        raise HTTPException(
            status_code=503, detail="MQTT settings could not be loaded."
        )
    return service


@router.get("", response_model=MQTTStatus)
async def get_mqtt(service: MQTTService = Depends(get_mqtt_service)) -> MQTTStatus:
    return service.status()


@router.put("", response_model=MQTTStatus)
async def update_mqtt(
    update: MQTTSettingsUpdate,
    service: MQTTService = Depends(get_mqtt_service),
) -> MQTTStatus:
    if update.enabled and not update.broker_address:
        raise HTTPException(
            status_code=422, detail="Enter a broker address before enabling MQTT."
        )
    try:
        return await service.update(update)
    except OSError as exc:
        raise HTTPException(
            status_code=503, detail="MQTT settings could not be saved."
        ) from exc
